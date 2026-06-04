"""
Poll loop — reads PLC registers every POLL_MS and broadcasts the state
JSON over WebSocket to all connected clients.

State JSON shape (per HMI_CONTRACT.md):
{
  "type": "state",
  "ts": "<ISO 8601>",
  "connected": true,
  "sim": true,
  "safety_ok": true,
  "fan_proven": false,
  "components": [
    {"id": "hot_fan", "label": "Hot Fan", "kind": "vsd", "has_speed": true,
     "cmd": false, "running": false, "fault": false, "speed_pct": 0.0},
    ...
  ],
  "temps": {
    "hotfan_motor": 0.0, "burner": 0.0, "product1": 0.0,
    "product2": 0.0, "exhaust": 0.0
  },
  "license": {"status": "ok", "locked": false, ...}
}
"""

import asyncio
import logging
from datetime import datetime, timezone

from app.components import (
    COMPONENTS,
    TEMP_REGS,
    REG_CMD_WORD,
    REG_RUNNING_WORD,
    REG_FAULT_WORD,
    REG_SPEED_ACT_BASE,
    REG_TEMP_BASE,
    BIT_FAN_PROVEN,
    BIT_SAFETY_OK,
    SETPOINT_REG_MAP,
)

logger = logging.getLogger(__name__)

# Latest state — kept so GET /api/state can return without waiting for next poll
_latest_state: dict = {}


def get_latest_state() -> dict:
    return _latest_state


async def poll_loop(client, manager, settings, license_mgr=None):
    """
    Asyncio task: poll PLC (or sim) at POLL_MS intervals, build State,
    broadcast to WebSocket manager, cache in _latest_state.
    """
    global _latest_state
    interval = settings.POLL_MS / 1000.0

    while True:
        try:
            state = await _build_state(client, settings, license_mgr)
            _latest_state = state
            await manager.broadcast(state)
        except Exception as e:
            logger.error(f"Poll loop error: {e}")
        await asyncio.sleep(interval)


async def _build_state(client, settings, license_mgr=None) -> dict:
    """Read all relevant registers and build the state dict."""

    # Read the command word so we can report cmd (what the HMI last commanded)
    cmd_regs = await client.read_holding_registers(REG_CMD_WORD, 1)
    cmd_word = cmd_regs[0] if cmd_regs else 0

    # Status block: %MW20 (running), %MW21 (fault)
    status_regs = await client.read_holding_registers(REG_RUNNING_WORD, 2)
    if status_regs and len(status_regs) >= 2:
        running_word = status_regs[0]
        fault_word   = status_regs[1]
    else:
        running_word = 0
        fault_word   = 0

    # Actual speeds: %MW22..%MW27 (6 registers)
    speed_regs = await client.read_holding_registers(REG_SPEED_ACT_BASE, 6)
    speed_actuals: dict[int, int] = {}   # reg_address -> raw value
    if speed_regs:
        for i, val in enumerate(speed_regs):
            speed_actuals[REG_SPEED_ACT_BASE + i] = val

    # Temperatures: %MW30..%MW34 (5 registers)
    temp_regs_raw = await client.read_holding_registers(REG_TEMP_BASE, 5)
    temps_raw: dict[int, int] = {}
    if temp_regs_raw:
        for i, val in enumerate(temp_regs_raw):
            temps_raw[REG_TEMP_BASE + i] = val

    # Safety / fan proven bits
    safety_ok  = bool(running_word & (1 << BIT_SAFETY_OK))
    fan_proven = bool(running_word & (1 << BIT_FAN_PROVEN))

    # Build component list
    components = []
    for comp in COMPONENTS:
        cmd     = bool(cmd_word     & (1 << comp.cmd_bit))
        running = bool(running_word & (1 << comp.status_bit))
        fault   = bool(fault_word   & (1 << comp.status_bit))

        speed_pct = 0.0
        if comp.has_speed and comp.speed_act_reg is not None:
            raw = speed_actuals.get(comp.speed_act_reg, 0)
            speed_pct = round(raw / 100.0, 2)   # 0-10000 → 0.00-100.00 %

        components.append({
            "id":        comp.id,
            "label":     comp.label,
            "kind":      comp.kind,
            "has_speed": comp.has_speed,
            "manual":    comp.manual,
            "cmd":       cmd,
            "running":   running,
            "fault":     fault,
            "speed_pct": speed_pct,
        })

    # Build temps dict (°C with 1 decimal)
    temps = {}
    for key, reg in TEMP_REGS.items():
        raw = temps_raw.get(reg, 0)
        temps[key] = round(raw / 10.0, 1)

    # Read operator setpoint registers (%MW8, %MW9, %MW10)
    sp_reg_addrs = list(SETPOINT_REG_MAP.values())  # [8, 9, 10]
    sp_regs_raw = await client.read_holding_registers(min(sp_reg_addrs), len(sp_reg_addrs))
    setpoints: dict[str, float] = {}
    base = min(sp_reg_addrs)
    for key, reg in SETPOINT_REG_MAP.items():
        if sp_regs_raw and (reg - base) < len(sp_regs_raw):
            setpoints[key] = round(sp_regs_raw[reg - base] / 10.0, 1)
        else:
            setpoints[key] = 0.0

    state = {
        "type":       "state",
        "ts":         datetime.now(timezone.utc).isoformat(),
        "connected":  client.is_connected,
        "sim":        settings.PLC_SIM,
        "safety_ok":  safety_ok,
        "fan_proven": fan_proven,
        "components": components,
        "temps":      temps,
        "setpoints":  setpoints,
    }

    if license_mgr is not None:
        state["license"] = license_mgr.status().as_dict()

    return state
