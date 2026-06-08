"""
Canonical component definitions for the BFD Dryer HMI.

Single source of truth — both the UMAS/Modbus poll loop and the REST command
layer import from here.  Matches BFD_manual_v2 ladder contract.

Ladder contract (BFD_manual_v2):
  Command word %MW0, %Q = %MW0:Xn directly (commanded bit == output running).

  bit0 = hot_fan    (%Q0.0)
  bit1 = disch_agi  (%Q0.1)
  bit4 = mill       (%Q0.4)
  bit5 = disch_conv (%Q0.5)
  bit6 = load_conv  (%Q0.6)
  bit7 = brush      (%Q0.7)
  bit8 = shaker     (%Q0.8)

  burner / burner_high = AUTOMATIC in ladder — status-only tiles, no command.

  VSDs (no ladder output yet — bits 2,3,9,10 are unused/harmless to write):
    bit2  = spinner     (no physical effect)
    bit3  = agitator1   (no physical effect)
    bit9  = agitator2   (no physical effect)
    bit10 = trace_chain (no physical effect)

  Because %MW0 drives %Q directly, cmd == running for all digital outputs.
  There is no separate "running word" — we derive running from the same %MW0.

Temps (read-only, raw value is 0.1 °C → ÷ 10):
  %MW31 = burner_air, %MW32 = product1, %MW33 = product2, %MW34 = exhaust.
  (%MW30 hot-fan motor unused, reads 0.)

Fields
------
id            : unique string key used in REST payloads and WS JSON
label         : human-readable label shown in the UI
kind          : 'vsd' | 'dol' | 'burner'
has_speed     : True if a speed setpoint register exists
cmd_bit       : bit index in %MW0 (command word) — 0-based
status_bit    : same as cmd_bit (cmd==running on this PLC)
speed_sp_reg  : holding-register address of speed setpoint (None if not VSD)
speed_act_reg : not wired yet for VSDs — None
manual        : False → indicator-only tile (no operator toggle)
"""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Component:
    id: str
    label: str
    kind: str           # 'vsd' | 'dol' | 'burner'
    has_speed: bool
    cmd_bit: int        # bit in %MW0 (and effectively in %MW0 for running too)
    status_bit: int     # same as cmd_bit — derived from %MW0
    speed_sp_reg: Optional[int] = None   # %MW address for setpoint
    speed_act_reg: Optional[int] = None  # %MW address for actual (not wired yet)
    manual: bool = True                  # False → indicator only (no operator toggle)


# ---------------------------------------------------------------------------
# Component table — order preserved for WS/CSV consumers (do NOT reorder).
# Bit positions are from BFD_manual_v2 ladder.
# ---------------------------------------------------------------------------
COMPONENTS: list[Component] = [
    # Digital outputs wired in ladder
    Component("hot_fan",    "Hot Fan",              "dol",   False,  0,  0),
    Component("disch_agi",  "Discharge Agitator",   "dol",   False,  1,  1),
    Component("mill",       "Mill",                 "dol",   False,  4,  4),
    Component("disch_conv", "Discharge Conveyor",   "dol",   False,  5,  5),
    Component("load_conv",  "Loading Conveyor",     "dol",   False,  6,  6),
    Component("brush",      "Brush",                "dol",   False,  7,  7),
    Component("shaker",     "Shaker",               "dol",   False,  8,  8),

    # Automatic — status-only tiles; burner is ladder-controlled, no command
    Component("burner",     "Burner",               "burner",False, 11, 11, manual=False),
    Component("burner_high","Burner High",          "burner",False, 12, 12, manual=False),

    # VSDs — no ladder output wired yet; bits 2/3/9/10 are unused in ladder
    # (writing them is harmless — no physical effect — included for future wiring)
    Component("spinner",    "Spinner",              "vsd",   True,   2,  2,  speed_sp_reg=3),
    Component("agitator1",  "Agitator 1",           "vsd",   True,   3,  3,  speed_sp_reg=4),
    Component("agitator2",  "Agitator 2",           "vsd",   True,   9,  9,  speed_sp_reg=5),
    Component("trace_chain","Trace Chain",          "vsd",   True,  10, 10,  speed_sp_reg=2),
]

# Lookup by id
COMPONENT_MAP: dict[str, Component] = {c.id: c for c in COMPONENTS}

# ---------------------------------------------------------------------------
# Register addresses
# ---------------------------------------------------------------------------

# Command word — %MW0; cmd==running because %Q = %MW0:Xn in the ladder
REG_CMD_WORD  = 0   # %MW0

# For UMAS transport, running is read from the same %MW0 (no separate word).
# We keep these constants for backward compatibility with poll_loop / logging.
REG_RUNNING_WORD   = 0   # %MW0 — same as command word on this PLC
REG_FAULT_WORD     = 21  # %MW21 — not used in current ladder; reads 0
REG_SPEED_ACT_BASE = 22  # %MW22..%MW27 — not wired yet
REG_TEMP_BASE      = 30  # %MW30..%MW34

# Temperature register addresses (°C × 10)
TEMP_REGS = {
    "hotfan_motor": 30,   # reads 0 on this PLC (motor sensor not wired)
    "burner":       31,   # burner air temp
    "product1":     32,
    "product2":     33,
    "exhaust":      34,
}

# Burner setpoints — readable; %MW45 = burner air setpoint (e.g. 850 = 85.0 °C)
REG_BURNER_SP       = 45  # %MW45 — burner air setpoint (read-only display)
REG_SP_BURNER_HI_LO  = 46  # %MW46
REG_SP_BURNER_LO_OFF = 47  # %MW47
REG_SP_PRODUCT_MAX   = 48  # %MW48

# Default setpoint values (°C) used to seed the sim register bank
SP_DEFAULTS = {
    "burner_hi_lo":  85.0,
    "burner_lo_off": 96.0,
    "product_max":   92.0,
}

# Key → register address mapping (for REST handler)
SETPOINT_REG_MAP: dict[str, int] = {
    "burner_hi_lo":  REG_SP_BURNER_HI_LO,
    "burner_lo_off": REG_SP_BURNER_LO_OFF,
    "product_max":   REG_SP_PRODUCT_MAX,
}

# Bit flags — these come from %MW0 on this PLC (no separate status word)
BIT_FAN_PROVEN = 0   # %MW0 bit0 = hot_fan commanded (serves as "fan proven" indicator)
BIT_SAFETY_OK  = 14  # %MW0 bit14 — unused/0 in current ladder; kept for compat
