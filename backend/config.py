from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # PLC/Modbus settings
    PLC_HOST: str = "192.168.1.100"  # Change to your PLC IP
    PLC_PORT: int = 502
    MODBUS_UNIT_ID: int = 1
    
    # Server settings
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
