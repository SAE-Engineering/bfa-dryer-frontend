"""
Unit tests for poll_loop state builders — live UMAS path and modbus/sim path.

Uses stub clients (no pymodbus, no PLC) so the State-JSON shape, the real-safety
read, the fault list and the per-component fault mapping are all exercised
deterministically.  Pins the Task-3 behaviour:
  - safety_ok comes from %M4 (not hardcoded True),
  - faults list is built from %M20/21/22,
  - temps come from %MW31-34,
  - fan_proven comes from %M23 (status), not the %MW0:X0 command bit.
"""

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import poll_loop  # noqa: E402
from app.components import (  # noqa: E402
    M_SAFETY_OK, M_FIRE_TRIP, M_OVER_TEMP, M_SCORCH, M_HOT_FAN_ON,
    SIM_BIT_FAN_PROVEN, SIM_BIT_SAFETY_OK, SIM_REG_RUNNING_WORD,
)


def _run(coro):
    return asyncio.run(coro)


def _settings(sim, proto="umas"):
    return SimpleNamespace(PLC_SIM=sim, PLC_PROTO=proto, POLL_MS=500)


# ---------------------------------------------------------------------------
# Live UMAS path
# ---------------------------------------------------------------------------

class FakeUmasClient:
    """Stub UMAS client: returns canned %MW words and %M bits."""
    def __init__(self, words: dict, bits: dict):
        self._words = words
        self._bits = bits
        self.is_connected = True

    async def read_many(self, addrs):
        return {a: self._words.get(a, 0) for a in addrs}

    async def read_bits(self, addrs):
        return {a: bool(self._bits.get(a, False)) for a in addrs}


def test_umas_safety_from_m4_true():
    client = FakeUmasClient(
        words={31: 250, 32: 300, 33: 305, 34: 280, 45: 850, 46: 20, 49: 920,
               40: 50, 41: 20, 42: 20, 43: 25, 44: 100},
        bits={M_SAFETY_OK: True, M_FIRE_TRIP: False, M_OVER_TEMP: False,
              M_SCORCH: False, M_HOT_FAN_ON: True},
    )
    state = _run(poll_loop._build_state_umas(client, _settings(False)))
    assert state["safety_ok"] is True
    assert state["fan_proven"] is True          # from %M23, not %MW0:X0
    assert state["faults"] == []
    assert state["temps"]["burner"] == 25.0     # %MW31 250 → 25.0 °C
    assert state["temps"]["exhaust"] == 28.0


def test_umas_safety_fault_from_m4_false():
    client = FakeUmasClient(
        words={31: 250, 32: 300, 33: 305, 34: 280, 45: 850, 46: 20, 49: 920},
        bits={M_SAFETY_OK: False, M_FIRE_TRIP: False, M_OVER_TEMP: False,
              M_SCORCH: False, M_HOT_FAN_ON: False},
    )
    state = _run(poll_loop._build_state_umas(client, _settings(False)))
    assert state["safety_ok"] is False          # NOT the old hardcoded True


def test_umas_fault_list_and_per_component():
    client = FakeUmasClient(
        words={31: 1250, 32: 300, 33: 950, 34: 280, 45: 850, 46: 20, 49: 920},
        bits={M_SAFETY_OK: True, M_FIRE_TRIP: True, M_OVER_TEMP: True,
              M_SCORCH: False, M_HOT_FAN_ON: True},
    )
    state = _run(poll_loop._build_state_umas(client, _settings(False)))
    fault_ids = {f["id"] for f in state["faults"]}
    assert fault_ids == {"fire_trip", "over_temp"}
    # fire is critical, over-temp is a fault
    sev = {f["id"]: f["severity"] for f in state["faults"]}
    assert sev["fire_trip"] == "critical"
    # hot_fan tile maps to fire-trip → faulted; burner tile maps to over-temp → faulted
    comp = {c["id"]: c for c in state["components"]}
    assert comp["hot_fan"]["fault"] is True
    assert comp["burner"]["fault"] is True
    assert comp["spinner"]["fault"] is False    # no fault_bit mapped


def test_umas_commanded_speed_display():
    # %MW40 (spinner) = 25 Hz → 50 %; %MW0:X2 set → spinner commanded.
    client = FakeUmasClient(
        words={0: (1 << 2), 31: 0, 32: 0, 33: 0, 34: 0, 45: 0, 46: 0, 49: 0,
               40: 25, 41: 0, 42: 0, 43: 0, 44: 0},
        bits={M_SAFETY_OK: True},
    )
    state = _run(poll_loop._build_state_umas(client, _settings(False)))
    comp = {c["id"]: c for c in state["components"]}
    assert comp["spinner"]["cmd"] is True
    assert comp["spinner"]["running"] is True   # running == commanded (no mirror)
    assert comp["spinner"]["speed_pct"] == 50.0


def test_umas_mw_read_failure_disconnected():
    class Down(FakeUmasClient):
        async def read_many(self, addrs):
            return None
    client = Down(words={}, bits={M_SAFETY_OK: True})
    state = _run(poll_loop._build_state_umas(client, _settings(False)))
    assert state["connected"] is False
    assert "faults" in state


# ---------------------------------------------------------------------------
# Modbus / sim path
# ---------------------------------------------------------------------------

class FakeModbusClient:
    """Stub modbus client backed by a flat register bank dict."""
    def __init__(self, regs: dict):
        self._regs = regs
        self.is_connected = True

    async def read_holding_registers(self, address, count=1):
        return [self._regs.get(address + i, 0) for i in range(count)]


def test_modbus_safety_and_fan_from_status_word():
    # %MW20 with X14 (safety) + X13 (fan proven) set; cold temps → no faults.
    status = (1 << SIM_BIT_SAFETY_OK) | (1 << SIM_BIT_FAN_PROVEN)
    regs = {0: 0, SIM_REG_RUNNING_WORD: status, 30: 250, 31: 250, 32: 250,
            33: 250, 34: 250, 45: 850, 46: 20, 49: 920}
    state = _run(poll_loop._build_state_modbus(FakeModbusClient(regs), _settings(True, "modbus")))
    assert state["safety_ok"] is True
    assert state["fan_proven"] is True
    assert state["faults"] == []


def test_modbus_faults_from_hot_temps():
    # Burner air 130.0 °C → fire + over-temp; product 95.0 °C → scorch.
    status = (1 << SIM_BIT_SAFETY_OK)
    regs = {0: 0, SIM_REG_RUNNING_WORD: status, 30: 0,
            31: 1300, 32: 950, 33: 950, 34: 250, 45: 850, 46: 20, 49: 920}
    state = _run(poll_loop._build_state_modbus(FakeModbusClient(regs), _settings(True, "modbus")))
    fault_ids = {f["id"] for f in state["faults"]}
    assert "fire_trip" in fault_ids
    assert "over_temp" in fault_ids
    assert "scorch" in fault_ids
    comp = {c["id"]: c for c in state["components"]}
    assert comp["hot_fan"]["fault"] is True     # fire → fan tile
    assert comp["burner"]["fault"] is True       # over-temp → burner tile
