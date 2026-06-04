"""
Canonical component definitions for the BFD Dryer HMI.

Single source of truth — both the Modbus poll loop and the REST command
layer import from here.  Matches the HMI_CONTRACT.md table exactly.

Fields
------
id            : unique string key used in REST payloads and WS JSON
label         : human-readable label shown in the UI
kind          : 'vsd' | 'dol' | 'burner'
has_speed     : True if a speed setpoint / actual register pair exists
cmd_bit       : bit index in %MW0 (command word) — 0-based
status_bit    : bit index in %MW20 (running word) — 0-based
speed_sp_reg  : holding-register address of speed setpoint (None if not VSD)
speed_act_reg : holding-register address of actual speed feedback (None if not VSD)
"""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Component:
    id: str
    label: str
    kind: str           # 'vsd' | 'dol' | 'burner'
    has_speed: bool
    cmd_bit: int        # bit in %MW0
    status_bit: int     # bit in %MW20
    speed_sp_reg: Optional[int] = None   # %MW address
    speed_act_reg: Optional[int] = None  # %MW address


# Order matches HMI_CONTRACT.md — do NOT reorder; bit positions are load-bearing.
COMPONENTS: list[Component] = [
    Component("hot_fan",    "Hot Fan",              "vsd",    True,  0,  0,  1, 22),
    Component("disch_agi",  "Discharge Agitator",   "vsd",    True,  1,  1,  6, 27),
    Component("spinner",    "Spinner",              "vsd",    True,  2,  2,  3, 24),
    Component("agitator1",  "Agitator 1",           "vsd",    True,  3,  3,  4, 25),
    Component("agitator2",  "Agitator 2",           "vsd",    True,  4,  4,  5, 26),
    Component("trace_chain","Trace Chain",          "vsd",    True,  5,  5,  2, 23),
    Component("mill",       "Mill",                 "dol",    False, 6,  6,  None, None),
    Component("disch_conv", "Discharge Conveyor",   "dol",    False, 7,  7,  None, None),
    Component("load_conv",  "Loading Conveyor",     "dol",    False, 8,  8,  None, None),
    Component("shaker",     "Shaker",               "dol",    False, 9,  9,  None, None),
    Component("brush",      "Brush",                "dol",    False, 10, 10, None, None),
    Component("burner",     "Burner (enable/low)",  "burner", False, 11, 11, None, None),
    Component("burner_high","Burner High",          "burner", False, 12, 12, None, None),
]

# Lookup by id
COMPONENT_MAP: dict[str, Component] = {c.id: c for c in COMPONENTS}

# Temperature register addresses (°C × 10)
TEMP_REGS = {
    "hotfan_motor": 30,
    "burner":       31,
    "product1":     32,
    "product2":     33,
    "exhaust":      34,
}

# Modbus register addresses (0-based)
REG_CMD_WORD       = 0   # %MW0  — command bits (HMI writes)
REG_RUNNING_WORD   = 20  # %MW20 — running/status bits (HMI reads)
REG_FAULT_WORD     = 21  # %MW21 — fault bits (HMI reads)
REG_SPEED_ACT_BASE = 22  # %MW22..%MW27 (hot_fan..trace_chain)
REG_TEMP_BASE      = 30  # %MW30..%MW34
REG_BURNER_SP      = 7   # %MW7  — burner setpoint °C × 10

BIT_FAN_PROVEN = 13   # bit 13 in %MW20
BIT_SAFETY_OK  = 14   # bit 14 in %MW20
