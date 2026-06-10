from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # PLC connection settings
    PLC_HOST: str = "192.168.1.100"
    PLC_PORT: int = 502
    MODBUS_UNIT_ID: int = 1

    # Transport protocol: "umas" (for Schneider M221) or "modbus" (legacy FC03/FC16)
    # UMAS is required for the M221 — plain Modbus writes ACK but never apply.
    PLC_PROTO: str = "modbus"   # default stays "modbus" to not break existing installs

    # Polling
    POLL_MS: int = 500          # milliseconds between PLC polls

    # Simulator — default ON so the HMI works without hardware
    PLC_SIM: bool = True

    # Data logging
    LOG_DIR: str = "/data"
    LOG_INTERVAL_S: int = 5

    # Licence enforcement (offline kill-switch)
    LICENSE_ENFORCE: bool = True
    LICENSE_PATH: str = "/data/license.json"
    LICENSE_HW_PATH: str = "/data/.license_hw"
    LICENSE_REQUIRE_MACHINE: bool = True
    MACHINE_ID: str = ""        # blank -> falls back to the host name at startup

    # Maintenance PIN to release the PLC link so MEB can take it for a program
    # upload. On-panel maintenance gate, NOT a login credential.
    PLC_RELEASE_PIN: str = "8800"

    # Server / dev settings
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
