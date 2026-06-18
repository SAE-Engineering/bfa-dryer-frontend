"""Durable persistence of operator setpoints (speed + burner) so they survive an
HMI / PLC restart or power cycle.

Every operator setpoint write (speed %MW40-44, burner %MW45/46/49) is mirrored to
a small JSON file; on startup the file is replayed into the register bank / PLC so
the last-set values are restored instead of reverting to 0 / first-scan defaults.

SIM: BFA_STATE_FILE lives on a mounted /data volume, so setpoints persist across
container recreation. REAL panel: point BFA_STATE_FILE at a retentive path.
"""
import json
import logging
import os
from pathlib import Path

from app.components import COMPONENTS, SETPOINT_REG_MAP

logger = logging.getLogger(__name__)

# Operator-set registers that must persist:
#   speed setpoints (%MW40-44) + burner operator setpoints (%MW45/46/49)
_SPEED_REGS = [c.speed_sp_reg for c in COMPONENTS
               if c.has_speed and c.speed_sp_reg is not None]
PERSIST_REGS = sorted(set(_SPEED_REGS) | set(SETPOINT_REG_MAP.values()))

STATE_FILE = Path(os.environ.get("BFA_STATE_FILE", "/data/bfa_setpoints.json"))


def _read() -> dict:
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {}


def save_reg(reg: int, value: int) -> None:
    """Mirror one persisted register's value to disk (best-effort, atomic)."""
    if reg not in PERSIST_REGS:
        return
    data = _read()
    data[str(reg)] = int(value)
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = STATE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(data))
        tmp.replace(STATE_FILE)
    except Exception as e:
        logger.warning("setpoint persist failed (%s): %s", STATE_FILE, e)


async def restore(plc_client) -> None:
    """Replay persisted setpoints into the register bank / PLC on startup."""
    data = _read()
    if not data:
        logger.info("no persisted setpoints to restore (%s)", STATE_FILE)
        return
    n = 0
    for reg_s, value in data.items():
        try:
            reg = int(reg_s)
        except (TypeError, ValueError):
            continue
        if reg in PERSIST_REGS:
            if await plc_client.write_register(reg, int(value)):
                n += 1
    logger.info("restored %d persisted setpoint(s) from %s", n, STATE_FILE)
