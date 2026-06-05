#!/usr/bin/env python3
"""
bfd-plc — Layer A command-line harness for the BFD banana-dryer Schneider M221.

Plain Modbus TCP (no Schneider proprietary protocol). Talks the holding-register
contract in bfa-dryer-frontend/HMI_CONTRACT.md, so component names, bits and
registers match the HMI exactly.

DEFAULT IS READ-ONLY. Every write (on/off, speed, burner setpoint, raw write)
requires the --arm flag AND prints a safety banner. Only --arm on-site with the
field loads PHYSICALLY DISCONNECTED.

Examples:
    ./plc_cli.py status                       # read & decode everything (safe)
    ./plc_cli.py read 30 5                    # raw read 5 regs from %MW30
    ./plc_cli.py --arm on hot_fan             # set Hot Fan cmd bit in %MW0
    ./plc_cli.py --arm speed trace_chain 50   # Trace Chain setpoint 50.00%
    ./plc_cli.py --arm burner-sp 80           # burner setpoint 80.0 degC
    ./plc_cli.py --arm write 0 0              # raw: clear command word

Needs: pip install pymodbus
"""
import argparse
import os
import sys

try:
    from pymodbus.client import ModbusTcpClient
except ImportError:
    sys.exit("pymodbus not installed — run:  pip install pymodbus")

# --- component map (canonical, from HMI_CONTRACT.md) ------------------------
# id: (label, kind, has_speed, cmd_bit, status_bit, speed_sp_reg, speed_act_reg)
COMPONENTS = {
    "hot_fan":     ("Hot Fan",            "vsd",    True,  0,  0,    1, 22),
    "disch_agi":   ("Discharge Agitator", "vsd",    False, 1,  1, None, None),
    "spinner":     ("Spinner",            "vsd",    True,  2,  2,    3, 24),
    "agitator1":   ("Agitator 1",         "vsd",    True,  3,  3,    4, 25),
    "agitator2":   ("Agitator 2",         "vsd",    True,  4,  4,    5, 26),
    "trace_chain": ("Trace Chain",        "vsd",    True,  5,  5,    2, 23),
    "mill":        ("Mill",               "dol",    False, 6,  6, None, None),
    "disch_conv":  ("Discharge Conveyor", "dol",    False, 7,  7, None, None),
    "load_conv":   ("Loading Conveyor",   "dol",    False, 8,  8, None, None),
    "shaker":      ("Shaker",             "dol",    False, 9,  9, None, None),
    "brush":       ("Brush",              "dol",    False, 10, 10, None, None),
    "burner":      ("Burner (enable/low)","burner", False, 11, 11, None, None),
    "burner_high": ("Burner High",        "burner", False, 12, 12, None, None),
}
CMD_WORD = 0          # %MW0  command word (bit per component)
STATUS_WORD = 20      # %MW20 running word (+X13 fan proven, X14 safety OK)
FAULT_WORD = 21       # %MW21 fault word
TEMPS = {30: "Hot Fan motor", 31: "Burner air", 32: "Product 1",
         33: "Product 2", 34: "Exhaust"}  # degC x10
SAFETY_BIT, FAN_PROVEN_BIT = 14, 13


# --- version-robust pymodbus wrappers --------------------------------------
def _read(client, addr, count, unit):
    for kw in ("device_id", "slave", "unit"):
        try:
            return client.read_holding_registers(addr, count=count, **{kw: unit})
        except TypeError:
            continue
    return client.read_holding_registers(addr, count)  # positional fallback


def _write(client, addr, values, unit):
    fn = client.write_registers
    for kw in ("device_id", "slave", "unit"):
        try:
            return fn(addr, values, **{kw: unit})
        except TypeError:
            continue
    return fn(addr, values)


def read_regs(client, addr, count, unit):
    rr = _read(client, addr, count, unit)
    if rr.isError():
        sys.exit(f"Modbus read error @%MW{addr} x{count}: {rr}")
    return list(rr.registers)


def write_regs(client, addr, values, unit):
    rr = _write(client, addr, values, unit)
    if rr.isError():
        sys.exit(f"Modbus write error @%MW{addr} = {values}: {rr}")
    return True


# --- commands ---------------------------------------------------------------
def cmd_status(client, unit):
    cmd = read_regs(client, CMD_WORD, 8, unit)        # %MW0..7 (cmd + setpoints)
    stat = read_regs(client, STATUS_WORD, 2, unit)    # %MW20,21
    acts = read_regs(client, 22, 6, unit)             # %MW22..27 actual speeds
    temps = read_regs(client, 30, 5, unit)            # %MW30..34
    run, flt = stat[0], stat[1]
    print(f"  command word %MW0 = 0x{cmd[0]:04X}   status %MW20 = 0x{run:04X}"
          f"   faults %MW21 = 0x{flt:04X}")
    print(f"  SAFETY OK (X14): {'YES' if run >> SAFETY_BIT & 1 else 'NO'}   "
          f"FAN PROVEN (X13): {'YES' if run >> FAN_PROVEN_BIT & 1 else 'no'}")
    print(f"  {'component':<20} {'cmd':>4} {'run':>4} {'fault':>5} {'sp%':>7} {'act%':>7}")
    print("  " + "-" * 52)
    for cid, (label, _k, has_sp, cb, sb, spreg, actreg) in COMPONENTS.items():
        c = "ON" if cmd[0] >> cb & 1 else "·"
        r = "ON" if run >> sb & 1 else "·"
        f = "FLT" if flt >> sb & 1 else "·"
        sp = f"{cmd[spreg] / 100:.1f}" if has_sp and spreg is not None else "-"
        ac = f"{acts[actreg - 22] / 100:.1f}" if has_sp and actreg is not None else "-"
        print(f"  {label:<20} {c:>4} {r:>4} {f:>5} {sp:>7} {ac:>7}")
    print("  " + "-" * 52)
    for reg, name in TEMPS.items():
        print(f"  {name:<20} {temps[reg - 30] / 10:6.1f} degC   (%MW{reg})")


def cmd_read(client, unit, addr, count):
    regs = read_regs(client, addr, count, unit)
    for i, v in enumerate(regs):
        print(f"  %MW{addr + i} = {v}  (0x{v:04X})")


def banner(action):
    print("=" * 60)
    print("  ⚠  ARMED WRITE — this changes the LIVE M221.")
    print(f"     {action}")
    print("     Only proceed with field loads PHYSICALLY DISCONNECTED.")
    print("=" * 60)


def cmd_onoff(client, unit, comp, on):
    if comp not in COMPONENTS:
        sys.exit(f"unknown component '{comp}'. one of: {', '.join(COMPONENTS)}")
    bit = COMPONENTS[comp][3]
    banner(f"{'START' if on else 'STOP'} {COMPONENTS[comp][0]} (%MW0:X{bit})")
    word = read_regs(client, CMD_WORD, 1, unit)[0]
    word = word | (1 << bit) if on else word & ~(1 << bit)
    write_regs(client, CMD_WORD, [word], unit)
    print(f"  %MW0 now 0x{word:04X}")


def cmd_speed(client, unit, comp, pct):
    if comp not in COMPONENTS:
        sys.exit(f"unknown component '{comp}'")
    _, _, has_sp, _, _, spreg, _ = COMPONENTS[comp]
    if not has_sp or spreg is None:
        sys.exit(f"{comp} has no speed setpoint")
    raw = max(0, min(10000, round(pct * 100)))
    banner(f"set {COMPONENTS[comp][0]} speed setpoint = {pct:.1f}% (%MW{spreg}={raw})")
    write_regs(client, spreg, [raw], unit)
    print(f"  %MW{spreg} = {raw}")


def cmd_burner_sp(client, unit, celsius):
    raw = max(0, min(65535, round(celsius * 10)))
    banner(f"set burner setpoint = {celsius:.1f} degC (%MW7={raw})")
    write_regs(client, 7, [raw], unit)
    print(f"  %MW7 = {raw}")


def cmd_write(client, unit, addr, value):
    banner(f"raw write %MW{addr} = {value}")
    write_regs(client, addr, [value], unit)
    print(f"  %MW{addr} = {value}")


def main():
    p = argparse.ArgumentParser(description="BFD M221 Modbus CLI (Layer A).")
    p.add_argument("--host", default=os.environ.get("PLC_HOST", "10.10.10.10"))
    p.add_argument("--port", type=int, default=int(os.environ.get("PLC_PORT", 502)))
    p.add_argument("--unit", type=int, default=int(os.environ.get("MODBUS_UNIT_ID", 1)))
    p.add_argument("--arm", action="store_true", help="permit writes (default read-only)")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    pr = sub.add_parser("read"); pr.add_argument("addr", type=int); pr.add_argument("count", type=int, nargs="?", default=1)
    po = sub.add_parser("on"); po.add_argument("component")
    pf = sub.add_parser("off"); pf.add_argument("component")
    ps = sub.add_parser("speed"); ps.add_argument("component"); ps.add_argument("pct", type=float)
    pb = sub.add_parser("burner-sp"); pb.add_argument("celsius", type=float)
    pw = sub.add_parser("write"); pw.add_argument("addr", type=int); pw.add_argument("value", type=int)
    a = p.parse_args()

    writes = {"on", "off", "speed", "burner-sp", "write"}
    if a.cmd in writes and not a.arm:
        sys.exit(f"'{a.cmd}' is a WRITE — re-run with --arm (field loads disconnected, on-site only).")

    client = ModbusTcpClient(host=a.host, port=a.port)
    if not client.connect():
        sys.exit(f"could not connect to PLC at {a.host}:{a.port}")
    print(f"# connected {a.host}:{a.port} unit {a.unit}"
          f"{'   [ARMED — writes enabled]' if a.arm else '   [read-only]'}")
    try:
        if a.cmd == "status":      cmd_status(client, a.unit)
        elif a.cmd == "read":      cmd_read(client, a.unit, a.addr, a.count)
        elif a.cmd == "on":        cmd_onoff(client, a.unit, a.component, True)
        elif a.cmd == "off":       cmd_onoff(client, a.unit, a.component, False)
        elif a.cmd == "speed":     cmd_speed(client, a.unit, a.component, a.pct)
        elif a.cmd == "burner-sp": cmd_burner_sp(client, a.unit, a.celsius)
        elif a.cmd == "write":     cmd_write(client, a.unit, a.addr, a.value)
    finally:
        client.close()


if __name__ == "__main__":
    main()
