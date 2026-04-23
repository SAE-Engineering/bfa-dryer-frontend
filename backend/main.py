from fastapi import FastAPI, WebSocketException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import asyncio
import logging
from pathlib import Path

from app.modbus_client import ModbusClient
from app.websocket_handler import setup_websocket
from config import Settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global state
modbus_client: ModbusClient = None
settings = Settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global modbus_client
    modbus_client = ModbusClient(
        host=settings.PLC_HOST,
        port=settings.PLC_PORT,
        unit_id=settings.MODBUS_UNIT_ID,
    )
    await modbus_client.connect()
    logger.info(f"Connected to PLC at {settings.PLC_HOST}:{settings.PLC_PORT}")
    
    yield
    
    # Shutdown
    await modbus_client.close()
    logger.info("Disconnected from PLC")


app = FastAPI(
    title="BFA Dryer HMI",
    description="Banana Dryer Control Panel",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup WebSocket
setup_websocket(app)

# Static files (React frontend build)
frontend_path = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_path.exists():
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "plc_connected": modbus_client.is_connected if modbus_client else False,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
    )
