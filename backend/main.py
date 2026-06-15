from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pydantic import BaseModel, Field
import asyncio
import logging
import socket
from pathlib import Path

from app.components import (
    COMPONENT_MAP,
    REG_CMD_WORD,
    REG_BURNER_SP,
    SETPOINT_REG_MAP,
    speed_pct_to_raw,
)
from app.modbus_client import ModbusClient, SimulatedPlcClient
from app.umas_client import UmasMwClient
from app.websocket_handler import setup_websocket, manager
from app.poll_loop import poll_loop, get_latest_state
from app.logging_task import logging_task
from app.license import LicenseManager
from app import plc_gate
from config import Settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = Settings()

# PLC client — selected at startup based on PLC_SIM / PLC_PROTO
plc_client = None

# Licence manager — offline kill-switch
license_mgr = LicenseManager(
    license_path=settings.LICENSE_PATH,
    hw_path=settings.LICENSE_HW_PATH,
    machine_id=(settings.MACHINE_ID or socket.gethostname()),
    enforce=settings.LICENSE_ENFORCE,
    require_machine=settings.LICENSE_REQUIRE_MACHINE,
)


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

    yield

    # Shutdown
    poll_task.cancel()
    log_task.cancel()
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

    # Scale the operator 0-100 % to the register's unit.  The FINAL PLC reads the
    # drive speed words %MW40-43 as Hz (0-50), so a 'hz' setpoint maps 0-100 % →
    # 0-50 Hz; the hot-fan %MW44 ('pct', display-only) stays 0-100.
    raw = speed_pct_to_raw(req.value_pct, comp.speed_unit)
    ok = await plc_client.write_register(comp.speed_sp_reg, raw)
    if not ok:
        raise HTTPException(status_code=502, detail="PLC write failed")

    return {"ok": True, "id": req.id, "value_pct": req.value_pct,
            "raw": raw, "unit": comp.speed_unit}


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

    key ∈ {"burner_target", "burner_band", "product_max"}
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
# PLC release / take — PIN-gated maintenance release of the HMI's PLC link so
# Schneider MEB (single UMAS master) can take the PLC for a program upload.
# No-sabotage: releasing NEVER stops running equipment; it only drops the link.
# ---------------------------------------------------------------------------

@app.post("/api/plc/release")
async def plc_release(req: PinRequest):
    if req.pin != settings.PLC_RELEASE_PIN:
        raise HTTPException(status_code=403, detail="Incorrect PIN")
    plc_gate.set_released(True)
    try:
        await plc_client.close()
    except Exception as e:
        logger.warning(f"PLC close during release: {e}")
    logger.info("PLC released by operator (PIN ok) — HMI link dropped for MEB")
    return {"ok": True, "released": True}


@app.post("/api/plc/take")
async def plc_take():
    """Re-acquire the PLC after a release (e.g. once MEB has disconnected).
    The poll loop resumes polling and reconnects on its own as well."""
    plc_gate.set_released(False)
    try:
        await plc_client.connect()
    except Exception as e:
        logger.warning(f"PLC reconnect during take: {e}")
    logger.info("PLC re-acquired by HMI (release cleared)")
    return {
        "ok": True,
        "released": False,
        "connected": plc_client.is_connected if plc_client else False,
    }


@app.get("/api/plc/released")
async def plc_released_status():
    return {
        "released": plc_gate.is_released(),
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
