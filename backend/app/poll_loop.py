"""
Poll loop — reads PLC registers every POLL_MS and broadcasts the state
JSON over WebSocket to all connected clients.

UMAS path (PLC_PROTO=umas):
  Single read_many([0, 31, 32, 33, 34, 45]) per poll — one round-trip.
  %MW0 = command word; cmd==running because %Q = %MW0:Xn in the ladder.
  Temps from %MW31-34 (÷ 10 → °C); burner setpoint %MW45 for display.

Modbus path (PLC_PROTO=modbus, legacy / sim):
  Multiple FC03 reads as before.

State JSON shape (per HMI_CONTRACT.md):
{
  "type": "state",
  "ts": "<ISO 8601>",
  "connected": true,
  "sim": false,
  "safety_ok": true,
  "fan_proven": false,
  "components": [
    {"id": "hot_fan", "label": "Hot Fan", "kind": "dol", "has_speed": false,
     "cmd": false, "running": false, "fault": false, "speed_pct": 0.0},
    ...
  ],
  "temps": {
    "hotfan_motor": 0.0, "burner": 0.0, "product1": 0.0,
    "product2": 0.0, "exhaust": 0.0
  },
  "setpoints": {...},
  "license": {...}
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
    SETPOINT_REG_MAP,
    REG_BURNER_SP,
    # Live %M (safety / fault) model — read via UMAS 0x24 class 0x02.
    M_READ_ADDRS,
    M_SAFETY_OK,
    M_HOT_FAN_ON,
    M_FIRE_TRIP,
    M_OVER_TEMP,
    M_SCORCH,
    FAULT_DEFS,
    # Simulator-only register/bit model (modbus sim path).
    SIM_BIT_FAN_PROVEN,
    SIM_BIT_SAFETY_OK,
)
from app import plc_gate


def _faults_from_m_bits(m_bits: dict) -> list[dict]:
    """Build the State `faults` list from the read %M fault-latch bits.

    `m_bits` is {m_addr: bool} as returned by read_bits.  Each FAULT_DEFS entry
    whose latch bit is set becomes one fault dict {id, label, severity}.  Empty
    list = no active faults (UI banner clears).
    """
    faults = []
    for addr, defn in FAULT_DEFS.items():
        if m_bits.get(addr):
            faults.append({
                "id":       defn["id"],
                "label":    defn["label"],
                "severity": defn["severity"],
            })
    return faults

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
            # Released for MEB: do NOT touch the PLC (the umas client would
            # auto-reconnect on any read and steal the link back). Serve a
            # 'released' state so the HMI shows the banner + Reconnect button.
            if plc_gate.is_released():
                state = _released_state(settings, license_mgr)
                _latest_state = state
                await manager.broadcast(state)
                await asyncio.sleep(interval)
                continue

            proto = getattr(settings, "PLC_PROTO", "modbus").lower()
            if not settings.PLC_SIM and proto == "umas":
                state = await _build_state_umas(client, settings, license_mgr)
            else:
                state = await _build_state_modbus(client, settings, license_mgr)
            _latest_state = state
            await manager.broadcast(state)
        except Exception as e:
            logger.error(f"Poll loop error: {e}")
        await asyncio.sleep(interval)


def _released_state(settings, license_mgr=None) -> dict:
    """State served while the PLC link is released for MEB — connected False,
    released True, equipment indicators zeroed. The PLC keeps running its
    program; this only reflects that the HMI has dropped its read/write link."""
    state = {
        "type":       "state",
        "ts":         datetime.now(timezone.utc).isoformat(),
        "connected":  False,
        "released":   True,
        "sim":        settings.PLC_SIM,
        "safety_ok":  True,
        "fan_proven": False,
        "faults":     [],
        "components": [
            {
                "id":        c.id,
                "label":     c.label,
                "kind":      c.kind,
                "has_speed": c.has_speed,
                "manual":    c.manual,
                "cmd":       False,
                "running":   False,
                "fault":     False,
                "speed_pct": 0.0,
            }
            for c in COMPONENTS
        ],
        "temps":     {"hotfan_motor": 0.0, "burner": 0.0, "product1": 0.0,
                      "product2": 0.0, "exhaust": 0.0},
        "setpoints": {"burner_target": 0.0, "burner_band": 0.0, "product_max": 0.0},
    }
    if license_mgr is not None:
        state["license"] = license_mgr.status().as_dict()
    return state


# ---------------------------------------------------------------------------
# UMAS state builder — one read_many round-trip
# ---------------------------------------------------------------------------

async def _build_state_umas(client, settings, license_mgr=None) -> dict:
    """
    LIVE UMAS path (final PLC `BFD_final.smbp`):

    Two func-0x24 reads per poll:
      1. %MW burst  — command word %MW0, temps %MW31-34, burner setpoints
         %MW45/46/49, and the commanded drive Hz %MW40-44 (for speed display).
      2. %M  burst  — real safety %M4, fault latches %M20/21/22, hot-fan-on %M23
         (via read_bits, object class 0x02 — see umas_client.read_bits).

    The final program has NO per-component running-word mirror, so "running" is
    reported as the commanded state (%MW0 bit).  Speeds shown are COMMANDED (the
    Hz the HMI wrote, read back from %MW40-44); actual-RPM feedback is deferred.
    Per-component fault + global safety/fault annunciation come from the %M bits.
    """
    # %MW burst: command word, temps, burner setpoints, commanded drive Hz.
    mw_addrs = [0, 31, 32, 33, 34, 45, 46, 49, 40, 41, 42, 43, 44]
    regs = await client.read_many(mw_addrs)

    if regs is None:
        # %MW read failed → connection down. Zeroed last-known + safety unknown.
        cmd_word = 0
        temps_raw = {31: 0, 32: 0, 33: 0, 34: 0}
        burner_sp_raw = band_raw = product_raw = 0
        speed_raw = {}
        connected = False
    else:
        cmd_word = regs.get(0, 0)
        temps_raw = {r: regs.get(r, 0) for r in (31, 32, 33, 34)}
        burner_sp_raw = regs.get(45, 0)
        band_raw = regs.get(46, 0)
        product_raw = regs.get(49, 0)
        speed_raw = {r: regs.get(r, 0) for r in (40, 41, 42, 43, 44)}
        connected = True

    # %M burst: real safety + fault latches + hot-fan-on (status, not command).
    m_bits = await client.read_bits(M_READ_ADDRS)
    if m_bits is None:
        # %M read failed (but %MW may have succeeded). The HARDWARE safety relay
        # is the real protection; the HMI annunciator falls back to last-known OK
        # and the connection indicator reflects the comms problem.
        m_bits = {}
        safety_ok = True
        fan_proven = False
        faults: list[dict] = []
        if not connected:
            connected = False
    else:
        safety_ok  = bool(m_bits.get(M_SAFETY_OK, True))
        fan_proven = bool(m_bits.get(M_HOT_FAN_ON, False))
        faults = _faults_from_m_bits(m_bits)

    components = []
    for comp in COMPONENTS:
        cmd = bool(cmd_word & (1 << comp.cmd_bit))
        # No running-word mirror on the final program → running == commanded.
        running = cmd
        # Per-component fault from its mapped %M latch (if any).
        fault = bool(comp.fault_bit is not None and m_bits.get(comp.fault_bit))
        # Commanded speed display: read-back of the Hz setpoint, scaled to %.
        speed_pct = 0.0
        if comp.has_speed and comp.speed_sp_reg is not None:
            raw = speed_raw.get(comp.speed_sp_reg, 0)
            if comp.speed_unit == "hz":
                hz = raw * comp.speed_res_hz                          # res 1.0=whole-Hz, 0.1=tenths
                speed_pct = round(min(100.0, hz / 50.0 * 100.0), 1)   # Hz → %
            else:
                speed_pct = round(min(100.0, float(raw)), 1)          # already %
        components.append({
            "id":        comp.id,
            "label":     comp.label,
            "kind":      comp.kind,
            "has_speed": comp.has_speed,
            "manual":    comp.manual,
            "cmd":       cmd,
            "running":   running,
            "fault":     fault,
            "speed_pct":    speed_pct,
            "min_hz":       comp.min_hz,
            "speed_res_hz": comp.speed_res_hz,
        })

    temps = {
        "hotfan_motor": 0.0,                              # %MW30 not wired (final)
        "burner":       round(temps_raw[31] / 10.0, 1),
        "product1":     round(temps_raw[32] / 10.0, 1),
        "product2":     round(temps_raw[33] / 10.0, 1),
        "exhaust":      round(temps_raw[34] / 10.0, 1),
    }

    setpoints = {
        "burner_target": round(burner_sp_raw / 10.0, 1),
        "burner_band":   round(band_raw / 10.0, 1),
        "product_max":   round(product_raw / 10.0, 1),
    }

    state = {
        "type":       "state",
        "ts":         datetime.now(timezone.utc).isoformat(),
        "connected":  connected,
        "released":   plc_gate.is_released(),
        "sim":        settings.PLC_SIM,
        "safety_ok":  safety_ok,
        "fan_proven": fan_proven,
        "faults":     faults,
        "components": components,
        "temps":      temps,
        "setpoints":  setpoints,
    }

    if license_mgr is not None:
        state["license"] = license_mgr.status().as_dict()

    return state


# ---------------------------------------------------------------------------
# Modbus state builder — legacy path (also used for sim)
# ---------------------------------------------------------------------------

async def _build_state_modbus(client, settings, license_mgr=None) -> dict:
    """Read all relevant registers and build the state dict (Modbus/sim path)."""

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
    speed_actuals: dict[int, int] = {}
    if speed_regs:
        for i, val in enumerate(speed_regs):
            speed_actuals[REG_SPEED_ACT_BASE + i] = val

    # Commanded drive Hz setpoints %MW40-44 (what the HMI actually writes).
    # The legacy actual-speed ramp keys off %MW1-6, which the current HMI never
    # writes, so report the COMMANDED Hz here — identical to the live UMAS path —
    # so the simulator shows real speeds in Hz instead of a frozen 0.
    sp_speed_regs = await client.read_holding_registers(40, 5)
    speed_sp = {40 + i: v for i, v in enumerate(sp_speed_regs)} if sp_speed_regs else {}

    # Temperatures: %MW30..%MW34 (5 registers)
    temp_regs_raw = await client.read_holding_registers(REG_TEMP_BASE, 5)
    temps_raw: dict[int, int] = {}
    if temp_regs_raw:
        for i, val in enumerate(temp_regs_raw):
            temps_raw[REG_TEMP_BASE + i] = val

    # Safety / fan proven from the sim's %MW20 status word (X14 safety, X13 fan).
    safety_ok  = bool(running_word & (1 << SIM_BIT_SAFETY_OK))
    fan_proven = bool(running_word & (1 << SIM_BIT_FAN_PROVEN))

    # Build temps dict (°C with 1 decimal)
    temps = {}
    for key, reg in TEMP_REGS.items():
        raw = temps_raw.get(reg, 0)
        temps[key] = round(raw / 10.0, 1)

    # Derive faults from sim temps crossing the PLC trip thresholds, so the
    # fault annunciation UI is testable purely against the simulator (drive the
    # burner hot → over-temp / scorch / fire latch).  Thresholds mirror the
    # final PLC: fire 120.0, over-temp 98.0, scorch 92.0 (product1/2).
    sim_faults: dict[int, bool] = {
        M_FIRE_TRIP: any(temps[k] >= 120.0 for k in ("burner", "product1", "product2", "exhaust")),
        M_OVER_TEMP: any(temps[k] >= 98.0  for k in ("burner", "product1", "product2", "exhaust")),
        M_SCORCH:    any(temps[k] >= 92.0  for k in ("product1", "product2")),
    }
    # OR in any operator-injected fault latches (sim I/O panel inputs)
    if hasattr(client, "injected_faults"):
        for bit in client.injected_faults():
            if bit in sim_faults:
                sim_faults[bit] = True
    faults = _faults_from_m_bits(sim_faults)

    # Build component list
    components = []
    for comp in COMPONENTS:
        cmd     = bool(cmd_word     & (1 << comp.cmd_bit))
        running = bool(running_word & (1 << comp.status_bit))
        fault   = bool(comp.fault_bit is not None and sim_faults.get(comp.fault_bit))

        speed_pct = 0.0
        if comp.has_speed and comp.speed_sp_reg is not None:
            raw = speed_sp.get(comp.speed_sp_reg, 0)
            if comp.speed_unit == "hz":
                hz = raw * comp.speed_res_hz                          # res 1.0=whole-Hz, 0.1=tenths
                speed_pct = round(min(100.0, hz / 50.0 * 100.0), 1)   # Hz → %
            else:
                speed_pct = round(min(100.0, float(raw)), 1)          # already %

        components.append({
            "id":        comp.id,
            "label":     comp.label,
            "kind":      comp.kind,
            "has_speed": comp.has_speed,
            "manual":    comp.manual,
            "cmd":       cmd,
            "running":   running,
            "fault":     fault,
            "speed_pct":    speed_pct,
            "min_hz":       comp.min_hz,
            "speed_res_hz": comp.speed_res_hz,
        })

    # Read operator setpoint registers
    sp_reg_addrs = list(SETPOINT_REG_MAP.values())
    sp_regs_raw = await client.read_holding_registers(min(sp_reg_addrs), max(sp_reg_addrs) - min(sp_reg_addrs) + 1)
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
        "main_on":    getattr(client, "main_on", True),     # main switch (sim input)
        "soft_lock":  getattr(client, "soft_lock", False),  # soft-lockout (sim input)
        "released":   plc_gate.is_released(),
        "sim":        settings.PLC_SIM,
        "safety_ok":  safety_ok,
        "fan_proven": fan_proven,
        "faults":     faults,
        "components": components,
        "temps":      temps,
        "setpoints":  setpoints,
    }

    if license_mgr is not None:
        state["license"] = license_mgr.status().as_dict()

    return state
