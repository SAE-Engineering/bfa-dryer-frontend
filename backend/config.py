from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Runtime configuration (env / .env file).

    DEV DEFAULTS (here) are SIM-SAFE — PLC_SIM=true, no hardware touched — so the
    HMI runs anywhere for development.  The LIVE PANEL profile is documented in
    backend/.env.panel.example (copy to .env on the panel):

        PLC_SIM=false      # arm live control (ON-SITE + ATTENDED only)
        PLC_PROTO=umas     # M221 requires UMAS (plain Modbus ACKs but never applies)
        PLC_HOST=10.10.10.10
        PLC_PORT=502
        LOG_DIR=/data      # CSV logs (bind-mounted ./data:/data in compose)

    Do NOT flip the dev defaults to live values here — arming happens via the
    panel .env so a dev/CI run can never command the dryer.
    """

    # PLC connection settings (dev defaults are sim-safe; live values live in
    # .env.panel.example).
    PLC_HOST: str = "192.168.1.100"
    PLC_PORT: int = 502
    MODBUS_UNIT_ID: int = 1

    # Transport protocol: "umas" (for Schneider M221) or "modbus" (legacy FC03/FC16
    # + the in-process simulator).  UMAS is REQUIRED for live M221 control — plain
    # Modbus writes ACK but never apply.  The live panel profile sets PLC_PROTO=umas.
    PLC_PROTO: str = "modbus"   # dev default; the sim path uses the modbus interface

    # Polling
    POLL_MS: int = 500          # milliseconds between PLC polls

    # Simulator — default ON so the HMI works without hardware (dev/CI safe).
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
