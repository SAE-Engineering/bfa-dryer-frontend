from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pydantic import BaseModel, Field
import asyncio
import logging
import os
import socket
from pathlib import Path

from app.components import COMPONENT_MAP, REG_CMD_WORD, REG_BURNER_SP, SETPOINT_REG_MAP
from app.modbus_client import ModbusClient, SimulatedPlcClient
from app.umas_client import UmasMwClient
from app.websocket_handler import setup_websocket, manager
from app.poll_loop import poll_loop, get_latest_state
from app.logging_task import logging_task
from app.run_logger import run_logger_task
from app.license import LicenseManager
from app.acceptance import log_acceptance, send_acceptance_email
from config import Settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = Settings()

# PLC client — selected at startup based on PLC_SIM / PLC_PROTO
plc_client = None

# PLC release state — tracks whether HMI currently holds the PLC connection
# True  = HMI is connected and polling
# False = HMI has released the PLC (MEB / other tool can take it)
_plc_released: bool = False

# Licence manager — offline kill-switch
license_mgr = LicenseManager(
    license_path=settings.LICENSE_PATH,
    hw_path=settings.LICENSE_HW_PATH,
    machine_id=(settings.MACHINE_ID or socket.gethostname()),
    enforce=settings.LICENSE_ENFORCE,
    require_machine=settings.LICENSE_REQUIRE_MACHINE,
)

# Machine ID used for acceptance logging (resolved at startup)
_machine_id: str = settings.MACHINE_ID or socket.gethostname()


def _assert_unlocked():
    """Raise 403 when the licence is locked. Used to gate 'start/change' actions.

    No-sabotage: this never stops running equipment — callers only gate
    actions that START or CHANGE settings. STOP commands bypass this.
    """
    st = license_mgr.status()
    if st.locked:
        raise HTTPException(status_code=403, detail=st.message)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global plc_client

    st = license_mgr.status()
    logger.info(f"Licence: machine_id={license_mgr.machine_id} status={st.status} "
                f"locked={st.locked} expires={st.expires}")

    if settings.PLC_SIM:
        logger.info("PLC_SIM=true — using simulated register bank")
        plc_client = SimulatedPlcClient()
        await plc_client.connect()
    elif settings.PLC_PROTO.lower() == "umas":
        logger.info(
            f"PLC_PROTO=umas — connecting to {settings.PLC_HOST}:{settings.PLC_PORT} via UMAS"
        )
        plc_client = UmasMwClient(
            host=settings.PLC_HOST,
            port=settings.PLC_PORT,
        )
        await plc_client.connect()
    else:
        logger.info(
            f"PLC_PROTO=modbus — connecting to {settings.PLC_HOST}:{settings.PLC_PORT} via Modbus"
        )
        plc_client = ModbusClient(
            host=settings.PLC_HOST,
            port=settings.PLC_PORT,
            unit_id=settings.MODBUS_UNIT_ID,
        )
        await plc_client.connect()

    # Background tasks
    poll_task = asyncio.create_task(
        poll_loop(plc_client, manager, settings, license_mgr),
        name="poll_loop",
    )
    log_task = asyncio.create_task(
        logging_task(settings),
        name="logging_task",
    )
    run_log_task = asyncio.create_task(
        run_logger_task(),
        name="run_logger_task",
    )

    yield

    # Shutdown
    poll_task.cancel()
    log_task.cancel()
    run_log_task.cancel()
    await plc_client.close()
    logger.info("BFD HMI backend shut down")


app = FastAPI(
    title="BFD Dryer HMI",
    description="Banana Dryer Control Panel",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

setup_websocket(app)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class CommandRequest(BaseModel):
    id: str
    on: bool


class SpeedRequest(BaseModel):
    id: str
    value_pct: float = Field(ge=0.0, le=100.0)


class BurnerSetpointRequest(BaseModel):
    celsius: float = Field(ge=0.0, le=1200.0)


class SetpointRequest(BaseModel):
    key: str
    value_c: float


class PinRequest(BaseModel):
    pin: str


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {
        "ok":        True,
        "connected": plc_client.is_connected if plc_client else False,
        "sim":       settings.PLC_SIM,
        "proto":     settings.PLC_PROTO,
    }


@app.get("/api/license")
async def license_status():
    return license_mgr.status().as_dict()


@app.get("/api/state")
async def state():
    s = get_latest_state()
    if not s:
        raise HTTPException(status_code=503, detail="No state available yet")
    return s


@app.post("/api/command")
async def command(req: CommandRequest):
    comp = COMPONENT_MAP.get(req.id)
    if comp is None:
        raise HTTPException(status_code=404, detail=f"Unknown component id: {req.id!r}")

    # Licence gate: block STARTS only. STOP (on=False) is always allowed.
    if req.on:
        _assert_unlocked()

    ok = await plc_client.read_modify_write_bit(REG_CMD_WORD, comp.cmd_bit, req.on)
    if not ok:
        raise HTTPException(status_code=502, detail="PLC write failed")

    return {"ok": True, "id": req.id, "on": req.on}


@app.post("/api/speed")
async def set_speed(req: SpeedRequest):
    comp = COMPONENT_MAP.get(req.id)
    if comp is None:
        raise HTTPException(status_code=404, detail=f"Unknown component id: {req.id!r}")
    if not comp.has_speed or comp.speed_sp_reg is None:
        raise HTTPException(status_code=400, detail=f"Component {req.id!r} has no speed register")

    _assert_unlocked()

    # Scale 0-100 % → 0-10000; clamp
    raw = int(max(0, min(10000, round(req.value_pct * 100))))
    ok = await plc_client.write_register(comp.speed_sp_reg, raw)
    if not ok:
        raise HTTPException(status_code=502, detail="PLC write failed")

    return {"ok": True, "id": req.id, "value_pct": req.value_pct, "raw": raw}


@app.post("/api/burner_setpoint")
async def burner_setpoint(req: BurnerSetpointRequest):
    _assert_unlocked()
    raw = int(round(req.celsius * 10))
    ok = await plc_client.write_register(REG_BURNER_SP, raw)
    if not ok:
        raise HTTPException(status_code=502, detail="PLC write failed")

    return {"ok": True, "celsius": req.celsius, "raw": raw}


@app.post("/api/setpoint")
async def set_operator_setpoint(req: SetpointRequest):
    """Write an operator temperature setpoint to the matching holding register.

    key ∈ {"burner_hi_lo", "burner_lo_off", "product_max"}
    value_c in °C — stored as °C×10 in the register, clamped 0..2000.
    """
    reg = SETPOINT_REG_MAP.get(req.key)
    if reg is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown setpoint key {req.key!r}. Valid keys: {list(SETPOINT_REG_MAP)}",
        )

    _assert_unlocked()

    raw = int(max(0, min(2000, round(req.value_c * 10))))
    ok = await plc_client.write_register(reg, raw)
    if not ok:
        raise HTTPException(status_code=502, detail="PLC write failed")

    return {"ok": True, "key": req.key, "value_c": round(raw / 10.0, 1), "raw": raw}


# ---------------------------------------------------------------------------
# Acceptance endpoint — called by splash screen on operator tap-accept
# ---------------------------------------------------------------------------

@app.post("/api/acceptance")
async def record_acceptance():
    """
    Record that an operator has accepted the operating agreement.

    Writes a timestamped JSONL record to ACCEPTANCE_LOG_DIR/acceptance_YYYY-MM-DD.jsonl.
    Sends an email notification via Resend to admin@saee.com.au unless
    BILLING_PAID=true (perpetual/paid-up licence path).

    The licence gate is NOT checked here: operators on a locked machine
    still need to accept the agreement before seeing the lock banner.
    """
    ts = log_acceptance(_machine_id)
    # Fire email as a background task so we don't hold up the splash dismiss
    asyncio.create_task(send_acceptance_email(_machine_id, ts))
    return {"ok": True, "ts": ts, "machine_id": _machine_id}


# ---------------------------------------------------------------------------
# PLC release / take endpoints — PIN-gated master release
# ---------------------------------------------------------------------------

@app.post("/api/plc/release")
async def plc_release(req: PinRequest):
    """
    PIN-gated: disconnect the UMAS client so MEB (or another tool) can take
    the PLC. The poll loop will detect the disconnection and serve last-known
    state until /api/plc/take reconnects.

    PIN must match PLC_RELEASE_PIN (default 8800).

    No-sabotage: this does NOT stop any running equipment. It only releases
    the TCP connection. Running outputs continue under PLC ladder control.
    """
    if req.pin != settings.PLC_RELEASE_PIN:
        raise HTTPException(status_code=403, detail="Incorrect PIN")

    global _plc_released
    if _plc_released:
        return {"ok": True, "released": True, "message": "Already released"}

    if plc_client and hasattr(plc_client, 'close'):
        await plc_client.close()
        logger.info("PLC connection released by operator (PIN authenticated)")

    _plc_released = True
    return {"ok": True, "released": True, "message": "PLC released — HMI disconnected"}


@app.post("/api/plc/take")
async def plc_take():
    """
    Attempt to re-acquire the PLC connection (reconnect after a release).
    Called automatically by the frontend after /api/plc/release; also
    auto-retried by the frontend every few seconds until PLC becomes reachable
    (i.e. MEB has disconnected).

    Returns {"ok": true, "connected": true} when connected,
            {"ok": false, "connected": false} when not yet available.
    """
    global _plc_released

    if not _plc_released:
        # Not in released state — already connected
        connected = plc_client.is_connected if plc_client else False
        return {"ok": True, "connected": connected, "message": "Not in released state"}

    if plc_client is None:
        return {"ok": False, "connected": False, "message": "No PLC client initialised"}

    # Attempt reconnect
    success = await plc_client.connect()
    if success:
        _plc_released = False
        logger.info("PLC re-acquired by HMI after release")
        return {"ok": True, "connected": True, "message": "PLC re-acquired"}
    else:
        return {"ok": False, "connected": False, "message": "PLC not yet available — retrying"}


@app.get("/api/plc/released")
async def plc_released_status():
    """Return current release state — used by frontend to show release indicator."""
    return {
        "released": _plc_released,
        "connected": plc_client.is_connected if plc_client else False,
    }


# Serve the built React frontend if it exists.
# MUST be mounted AFTER all @app.get / @app.post route definitions so
# FastAPI's router matches API paths first.
frontend_path = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_path.exists():
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
