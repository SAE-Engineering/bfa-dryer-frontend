from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # PLC / Modbus settings
    PLC_HOST: str = "192.168.1.100"
    PLC_PORT: int = 502
    MODBUS_UNIT_ID: int = 1

    # Polling
    POLL_MS: int = 500          # milliseconds between Modbus polls

    # Simulator — default ON so the HMI works without hardware
    PLC_SIM: bool = True

    # Data logging
    LOG_DIR: str = "/data"
    LOG_INTERVAL_S: int = 5

    # Server / dev settings
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
