from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pydantic import BaseModel, Field
import asyncio
import logging
import socket
import secrets
import time
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
from app import persistence
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

    # Restore persisted operator setpoints (speed + burner) into the register
    # bank / PLC so the last-set values survive a restart / power cycle.
    await persistence.restore(plc_client)

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


class EstopRequest(BaseModel):
    on: bool


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
    raw = speed_pct_to_raw(req.value_pct, comp.speed_unit, comp.speed_res_hz)
    # Enforce the drive's minimum speed (LSP) as a hard floor — defence in depth
    # behind the HMI clamp, so even a direct API call can't command below it.
    # min_hz is in Hz; scale to register counts by the drive's resolution.
    if comp.speed_unit == "hz" and comp.min_hz > 0:
        raw = max(raw, int(round(comp.min_hz / comp.speed_res_hz)))
    ok = await plc_client.write_register(comp.speed_sp_reg, raw)
    if not ok:
        raise HTTPException(status_code=502, detail="PLC write failed")

    persistence.save_reg(comp.speed_sp_reg, raw)   # survive restart / power cycle
    return {"ok": True, "id": req.id, "value_pct": req.value_pct,
            "raw": raw, "unit": comp.speed_unit}


@app.post("/api/burner_setpoint")
async def burner_setpoint(req: BurnerSetpointRequest):
    _assert_unlocked()
    raw = int(round(req.celsius * 10))
    ok = await plc_client.write_register(REG_BURNER_SP, raw)
    if not ok:
        raise HTTPException(status_code=502, detail="PLC write failed")

    persistence.save_reg(REG_BURNER_SP, raw)       # survive restart / power cycle
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

    persistence.save_reg(reg, raw)                 # survive restart / power cycle
    return {"ok": True, "key": req.key, "value_c": round(raw / 10.0, 1), "raw": raw}


def _require_sim(attr: str):
    if not settings.PLC_SIM or not hasattr(plc_client, attr):
        raise HTTPException(status_code=400, detail="Input simulation is sim-only")


@app.post("/api/sim/estop")
async def sim_estop(req: EstopRequest):
    """SIM-ONLY: engage/clear a simulated E-STOP (hardwired safety relay drop).
    Drops the safety-OK bit and stops every motor (power cut). Refused unless the
    backend is running the in-process simulator — never touches a real PLC."""
    _require_sim("set_estop")
    plc_client.set_estop(req.on)
    return {"ok": True, "estop": req.on}


@app.post("/api/sim/commloss")
async def sim_commloss(req: EstopRequest):
    """SIM-ONLY: fake a PLC link loss (state reports connected=false)."""
    _require_sim("set_commloss")
    plc_client.set_commloss(req.on)
    return {"ok": True, "commloss": req.on}


class SimFaultRequest(BaseModel):
    kind: str   # 'fire' | 'over_temp' | 'scorch'
    on: bool


@app.post("/api/sim/fault")
async def sim_fault(req: SimFaultRequest):
    """SIM-ONLY: force a fault latch on/off (fire / over-temp / scorch)."""
    _require_sim("set_fault")
    plc_client.set_fault(req.kind, req.on)
    return {"ok": True, "kind": req.kind, "on": req.on}


@app.post("/api/sim/main")
async def sim_main(req: EstopRequest):
    """SIM-ONLY: main switch (%I0.0). on=true → machine powered; on=false →
    master kill: every output off and the HMI screen powers down (main_on=false)."""
    _require_sim("set_main")
    plc_client.set_main(req.on)
    return {"ok": True, "main_on": req.on}


@app.post("/api/sim/softlock")
async def sim_softlock(req: EstopRequest):
    """SIM-ONLY: soft-lockout (%I0.10). on=true → forces the %M0-gated outputs
    (burner + DOL bank + discharge agitator) off."""
    _require_sim("set_softlock")
    plc_client.set_softlock(req.on)
    return {"ok": True, "soft_lock": req.on}


@app.post("/api/sim/reset")
async def sim_reset():
    """SIM-ONLY: reset pushbutton (%I0.12) — clears the injected fault latches."""
    _require_sim("reset")
    plc_client.reset()
    return {"ok": True}


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


# ---------------------------------------------------------------------------
# Diagnostics PIN gate.
# The hidden read-only diag screen is gated behind a server-checked PIN
# (env DIAG_PIN) so the real PIN is never in the JS bundle. On a correct PIN
# POST /api/diag-auth issues a short-lived opaque token; GET /api/diag then
# requires that token (X-Diag-Token header or ?t= query). Tokens are held in
# process memory only and expire after DIAG_TOKEN_TTL_S.
# ---------------------------------------------------------------------------

DIAG_TOKEN_TTL_S = 12 * 60 * 60   # tech keeps access for the rest of the shift
_diag_tokens: dict[str, float] = {}   # token -> expiry epoch seconds


def _issue_diag_token() -> str:
    now = time.time()
    # opportunistic prune of expired tokens
    for t, exp in list(_diag_tokens.items()):
        if exp < now:
            _diag_tokens.pop(t, None)
    tok = secrets.token_urlsafe(24)
    _diag_tokens[tok] = now + DIAG_TOKEN_TTL_S
    return tok


def _diag_token_valid(tok: str | None) -> bool:
    if not tok:
        return False
    exp = _diag_tokens.get(tok)
    if exp is None:
        return False
    if exp < time.time():
        _diag_tokens.pop(tok, None)
        return False
    return True


@app.post("/api/diag-auth")
async def diag_auth(req: PinRequest):
    """Check the diagnostics PIN (server-side, against env DIAG_PIN).

    Returns {ok, token} on success so the real PIN never ships in the JS
    bundle. Wrong PIN returns {ok: false} (200, no token) so the keypad can
    show \"Incorrect PIN\" without leaking timing/status detail."""
    if secrets.compare_digest(str(req.pin), str(settings.DIAG_PIN)):
        return {"ok": True, "token": _issue_diag_token()}
    return {"ok": False}


# ---------------------------------------------------------------------------
# Hidden diagnostics — GET /api/diag
# Read-only raw register / bit dump for on-panel fault-finding (no MEB needed).
# NEVER writes to the PLC.  Reads a fixed set of %MW words + %M bits each call
# via the UMAS client's read_many / read_bits (one round-trip each).  On any
# read failure it returns null values + a note in conn.errors — never 500.
# ---------------------------------------------------------------------------

# %MW words surfaced on the diag screen (command word, mode, heartbeat, temps,
# Hz setpoints, burner/scorch setpoints, clear/re-enable words).
DIAG_MW_ADDRS = [0, 2, 10, 11, 31, 32, 33, 34, 40, 41, 42, 43, 44, 45, 46, 49, 48, 50, 52]
# %M bits: inputs/mirrors, fault latches, drive-status mirrors.
DIAG_M_ADDRS = [0, 1, 2, 3, 4, 5, 20, 21, 22, 23, 80, 81, 82, 83, 88, 89, 90, 91]


@app.get("/api/diag")
async def diag(request: Request):
    """Raw %MW / %M dump for the hidden on-panel diagnostics screen.

    PIN-gated: requires a valid token (X-Diag-Token header or ?t= query)
    issued by POST /api/diag-auth.  Without one this returns 403 so the raw
    register dump is not reachable by a normal operator.

    SIM-ONLY BYPASS: when settings.PLC_SIM is true (an in-process fake PLC,
    no real hardware) the PIN gate is skipped so the bosun-hosted sim's logic
    view can poll the register/bit dump without a token.  This is guarded
    STRICTLY on the sim flag — on a real panel (PLC_SIM=false) the token check
    below is unchanged and the diag dump stays PIN-gated.  The sim exposes no
    write path that the bypass could reach, and there is no live PLC behind it.
    """
    if not settings.PLC_SIM:
        tok = request.headers.get("X-Diag-Token") or request.query_params.get("t")
        if not _diag_token_valid(tok):
            raise HTTPException(status_code=403, detail="Diagnostics locked")

    from datetime import datetime, timezone

    errors: list[str] = []
    mw: dict[str, int | None] = {}
    m: dict[str, bool | None] = {}

    client = plc_client
    can_read_mw = client is not None and hasattr(client, "read_many")
    can_read_m = client is not None and hasattr(client, "read_bits")

    # --- %MW words ---------------------------------------------------------
    if can_read_mw:
        try:
            res = await client.read_many(DIAG_MW_ADDRS)
            if res is None:
                errors.append("read_many returned None (PLC read failed)")
                for a in DIAG_MW_ADDRS:
                    mw[str(a)] = None
            else:
                for a in DIAG_MW_ADDRS:
                    mw[str(a)] = res.get(a)
                    if a not in res:
                        errors.append(f"%MW{a} missing from read_many result")
        except Exception as e:  # never bubble up
            errors.append(f"read_many error: {e}")
            for a in DIAG_MW_ADDRS:
                mw[str(a)] = None
    else:
        errors.append("client has no read_many (sim/modbus path) — %MW unavailable")
        for a in DIAG_MW_ADDRS:
            mw[str(a)] = None

    # --- %M bits -----------------------------------------------------------
    # NOTE: read_bits() does NOT chunk internally (unlike read_many), and the
    # M221 caps a single 0x24 multi-read at 10 variables -- it silently returns
    # only the first 10.  So we chunk the %M reads here (<=8, matching the
    # read_many margin) and merge.  umas_client is left untouched.
    if can_read_m:
        for off in range(0, len(DIAG_M_ADDRS), 8):
            chunk = DIAG_M_ADDRS[off:off + 8]
            try:
                res = await client.read_bits(chunk)
                if res is None:
                    errors.append(f"read_bits returned None for {chunk}")
                    for a in chunk:
                        m[str(a)] = None
                else:
                    for a in chunk:
                        m[str(a)] = res.get(a)
                        if a not in res:
                            errors.append(f"%M{a} missing from read_bits result")
            except Exception as e:
                errors.append(f"read_bits error {chunk}: {e}")
                for a in chunk:
                    m[str(a)] = None
    else:
        errors.append("client has no read_bits (sim/modbus path) -- %M unavailable")
        for a in DIAG_M_ADDRS:
            m[str(a)] = None

    conn = {
        "connected": bool(client.is_connected) if client is not None else False,
        "host":      settings.PLC_HOST,
        "port":      settings.PLC_PORT,
        "proto":     settings.PLC_PROTO,
        "sim":       settings.PLC_SIM,
        "released":  plc_gate.is_released(),
        "errors":    errors,
    }

    return {
        "ts":   datetime.now(timezone.utc).isoformat(),
        "conn": conn,
        "mw":   mw,
        "m":    m,
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
