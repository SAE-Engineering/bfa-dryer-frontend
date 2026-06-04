from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pydantic import BaseModel, Field
import asyncio
import logging
from pathlib import Path

from app.components import COMPONENT_MAP, REG_CMD_WORD, REG_BURNER_SP, SETPOINT_REG_MAP
from app.modbus_client import ModbusClient, SimulatedPlcClient
from app.websocket_handler import setup_websocket, manager
from app.poll_loop import poll_loop, get_latest_state
from app.logging_task import logging_task
from config import Settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = Settings()

# PLC client — selected at startup based on PLC_SIM
plc_client = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global plc_client

    if settings.PLC_SIM:
        logger.info("PLC_SIM=true — using simulated register bank")
        plc_client = SimulatedPlcClient()
        await plc_client.connect()
    else:
        logger.info(f"PLC_SIM=false — connecting to {settings.PLC_HOST}:{settings.PLC_PORT}")
        plc_client = ModbusClient(
            host=settings.PLC_HOST,
            port=settings.PLC_PORT,
            unit_id=settings.MODBUS_UNIT_ID,
        )
        await plc_client.connect()

    # Background tasks
    poll_task = asyncio.create_task(
        poll_loop(plc_client, manager, settings),
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


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {
        "ok":        True,
        "connected": plc_client.is_connected if plc_client else False,
        "sim":       settings.PLC_SIM,
    }


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

    ok = await plc_client.read_modify_write_bit(REG_CMD_WORD, comp.cmd_bit, req.on)
    if not ok:
        raise HTTPException(status_code=502, detail="Modbus write failed")

    return {"ok": True, "id": req.id, "on": req.on}


@app.post("/api/speed")
async def set_speed(req: SpeedRequest):
    comp = COMPONENT_MAP.get(req.id)
    if comp is None:
        raise HTTPException(status_code=404, detail=f"Unknown component id: {req.id!r}")
    if not comp.has_speed or comp.speed_sp_reg is None:
        raise HTTPException(status_code=400, detail=f"Component {req.id!r} has no speed register")

    # Scale 0-100 % → 0-10000; clamp
    raw = int(max(0, min(10000, round(req.value_pct * 100))))
    ok = await plc_client.write_register(comp.speed_sp_reg, raw)
    if not ok:
        raise HTTPException(status_code=502, detail="Modbus write failed")

    return {"ok": True, "id": req.id, "value_pct": req.value_pct, "raw": raw}


@app.post("/api/burner_setpoint")
async def burner_setpoint(req: BurnerSetpointRequest):
    # °C → °C × 10 for register
    raw = int(round(req.celsius * 10))
    ok = await plc_client.write_register(REG_BURNER_SP, raw)
    if not ok:
        raise HTTPException(status_code=502, detail="Modbus write failed")

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
    raw = int(max(0, min(2000, round(req.value_c * 10))))
    ok = await plc_client.write_register(reg, raw)
    if not ok:
        raise HTTPException(status_code=502, detail="Modbus write failed")

    return {"ok": True, "key": req.key, "value_c": round(raw / 10.0, 1), "raw": raw}


# Serve the built React frontend if it exists.
# MUST be mounted AFTER all @app.get / @app.post route definitions so
# FastAPI's router matches API paths first; the "/" catch-all only fires
# for anything that doesn't match an API or WS route.
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
