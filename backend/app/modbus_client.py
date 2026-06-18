"""
Modbus client — real (pymodbus AsyncModbusTcpClient) and simulated.

Both classes expose the same async interface so the poll loop and command
handlers are identical regardless of PLC_SIM.

Real client methods:
  read_holding_registers(address, count) -> list[int] | None
  write_register(address, value)         -> bool          (FC06 single)
  write_registers(address, values)       -> bool          (FC16 multi)
  read_modify_write_bit(address, bit, value) -> bool      (FC03 read, flip, FC16 write)
  connect() / close()

SimulatedPlcClient implements the same interface against an in-process
register bank.  See docstring on that class for simulation behaviour.
"""

import asyncio
import logging
import math
import random
import time

from pymodbus.client import AsyncModbusTcpClient
from pymodbus.exceptions import ModbusException

from app.components import (
    SP_DEFAULTS, SETPOINT_REG_MAP,
    M_FIRE_TRIP, M_OVER_TEMP, M_SCORCH,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Real Modbus TCP client
# ---------------------------------------------------------------------------

class ModbusClient:
    def __init__(self, host: str, port: int = 502, unit_id: int = 1):
        self.host = host
        self.port = port
        self.unit_id = unit_id
        self.client = AsyncModbusTcpClient(host=host, port=port)
        self.is_connected = False
        self._lock = asyncio.Lock()

    async def connect(self):
        try:
            await self.client.connect()
            self.is_connected = True
            logger.info(f"Connected to PLC at {self.host}:{self.port}")
        except Exception as e:
            logger.error(f"Failed to connect to PLC: {e}")
            self.is_connected = False

    async def close(self):
        if self.client:
            self.client.close()
            self.is_connected = False
            logger.info("Disconnected from PLC")

    # ------------------------------------------------------------------
    # Read helpers
    # ------------------------------------------------------------------

    async def read_holding_registers(self, address: int, count: int = 1) -> list[int] | None:
        """FC03 — read one or more holding registers.  Returns list[int] or None on error."""
        try:
            async with self._lock:
                result = await self.client.read_holding_registers(address, count, self.unit_id)
            if result.isError():
                logger.error(f"FC03 error at {address}: {result}")
                self.is_connected = False
                return None
            self.is_connected = True
            return list(result.registers)
        except (ModbusException, Exception) as e:
            logger.error(f"FC03 exception at {address}: {e}")
            self.is_connected = False
            await self._try_reconnect()
            return None

    # ------------------------------------------------------------------
    # Write helpers
    # ------------------------------------------------------------------

    async def write_register(self, address: int, value: int) -> bool:
        """FC06 — write a single holding register."""
        try:
            async with self._lock:
                result = await self.client.write_register(address, value, self.unit_id)
            if result.isError():
                logger.error(f"FC06 error at {address}: {result}")
                return False
            return True
        except (ModbusException, Exception) as e:
            logger.error(f"FC06 exception at {address}: {e}")
            self.is_connected = False
            await self._try_reconnect()
            return False

    async def write_registers(self, address: int, values: list[int]) -> bool:
        """FC16 — write multiple consecutive holding registers."""
        try:
            async with self._lock:
                result = await self.client.write_registers(address, values, self.unit_id)
            if result.isError():
                logger.error(f"FC16 error at {address}: {result}")
                return False
            return True
        except (ModbusException, Exception) as e:
            logger.error(f"FC16 exception at {address}: {e}")
            self.is_connected = False
            await self._try_reconnect()
            return False

    async def read_modify_write_bit(self, address: int, bit: int, value: bool) -> bool:
        """
        Read %MW<address> (FC03), set or clear bit <bit>, write back (FC16).
        This is the correct way to operate the command word without clobbering
        other bits set by the HMI or PLC logic.
        """
        regs = await self.read_holding_registers(address, 1)
        if regs is None:
            return False
        word = regs[0]
        if value:
            word |= (1 << bit)
        else:
            word &= ~(1 << bit)
        return await self.write_registers(address, [word])

    # ------------------------------------------------------------------
    # Legacy coil helpers (kept for compatibility)
    # ------------------------------------------------------------------

    async def read_coils(self, address: int, count: int = 1):
        try:
            async with self._lock:
                result = await self.client.read_coils(address, count, self.unit_id)
            if result.isError():
                logger.error(f"FC01 error at {address}: {result}")
                return None
            return result.bits
        except (ModbusException, Exception) as e:
            logger.error(f"FC01 exception at {address}: {e}")
            return None

    async def write_coil(self, address: int, value: bool) -> bool:
        try:
            async with self._lock:
                result = await self.client.write_coil(address, value, self.unit_id)
            if result.isError():
                logger.error(f"FC05 error at {address}: {result}")
                return False
            return True
        except (ModbusException, Exception) as e:
            logger.error(f"FC05 exception at {address}: {e}")
            return False

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _try_reconnect(self):
        if not self.is_connected:
            logger.info("Attempting PLC reconnect…")
            await self.connect()


# ---------------------------------------------------------------------------
# Simulated PLC client
# ---------------------------------------------------------------------------

class SimulatedPlcClient:
    """
    In-process fake PLC register bank.

    Behaviour (matching CONTRACT spec):
    - Commands:  HMI writes a bit in %MW0 → sim picks it up within ~1 s and
                 mirrors the bit into %MW20 (running word).
    - Speed:     Actual speed (%MW22-27) ramps toward setpoint (%MW1-6)
                 at ~5 000 units/s (100 % in ~2 s).
    - Temps (°C × 10):
        %MW30 Hot Fan motor — ramps with hot_fan running, cools slowly
        %MW31 Burner air    — ramps aggressively when burner on
        %MW32 Product 1     — slow rise when both hot_fan + burner on
        %MW33 Product 2     — lags product1 by a few seconds
        %MW34 Exhaust       — mid-range, tracks burner loosely
      All temps have ±0.3 °C gentle noise added each poll.
    - Faults:    %MW21 always 0 in sim (no faults).
    - Safety:    bit 14 of %MW20 = 1 (safety OK) always in sim.
    - Fan proven: bit 13 of %MW20 = mirrors hot_fan running bit.
    """

    # Register bank size — covers all addresses used
    _SIZE = 64

    def __init__(self):
        self._regs: list[int] = [0] * self._SIZE
        self.is_connected = True
        self._lock = asyncio.Lock()

        # Internal simulation state
        self._last_tick = time.monotonic()

        # Temperature state (°C, float, before ×10 encoding)
        self._temp = {
            30: 25.0,   # hot fan motor
            31: 25.0,   # burner air
            32: 25.0,   # product 1
            33: 25.0,   # product 2
            34: 25.0,   # exhaust
        }

        # Lag buffer for product2 (uses a short history of product1)
        self._prod1_history: list[float] = [25.0] * 10

        # Seed setpoint registers with defaults
        for key, reg in SETPOINT_REG_MAP.items():
            self._regs[reg] = int(SP_DEFAULTS[key] * 10)

        # Commanded bits that are "pending" — reflected after ~1 s delay
        # _pending[bit] = (target_value, apply_at_monotonic)
        self._pending: dict[int, tuple[bool, float]] = {}

        # SIM-ONLY input injection (driven from the design-page I/O panel):
        #   _estop          — hardwired safety relay drop: safety clears, all
        #                      motors stop (power cut), commands clear.
        #   is_connected    — set False to fake a PLC link loss (comms drop).
        #   _inject_faults  — fault latches forced on (fire / over-temp / scorch).
        # None of these exist on the real client.
        self._estop = False
        self._inject_faults: set[int] = set()

    # ---- SIM-ONLY input injection ------------------------------------------
    _FAULT_BITS = {"fire": M_FIRE_TRIP, "over_temp": M_OVER_TEMP, "scorch": M_SCORCH}

    def set_estop(self, on: bool) -> None:
        self._estop = bool(on)

    def set_commloss(self, on: bool) -> None:
        # Comms drop ⇒ the link is "down": state builder reports connected=False.
        self.is_connected = not bool(on)

    def set_fault(self, kind: str, on: bool) -> None:
        bit = self._FAULT_BITS.get(kind)
        if bit is None:
            return
        if on:
            self._inject_faults.add(bit)
        else:
            self._inject_faults.discard(bit)

    def injected_faults(self) -> set[int]:
        return set(self._inject_faults)

    # ------------------------------------------------------------------
    # Public interface (same signature as ModbusClient)
    # ------------------------------------------------------------------

    async def connect(self):
        self.is_connected = True

    async def close(self):
        self.is_connected = False

    async def read_holding_registers(self, address: int, count: int = 1) -> list[int] | None:
        async with self._lock:
            self._tick()
            return list(self._regs[address: address + count])

    # ------------------------------------------------------------------
    # Diagnostics-screen reads (SIM ONLY) — mirror the UMAS client's
    # read_many / read_bits so the hidden diag screen (and the bosun-hosted
    # sim's logic view) shows live %MW / %M data instead of "client has no
    # read_many".  The live panel uses UmasMwClient's real implementations;
    # these are the simulator's equivalents against the in-process bank.
    # NEVER touched on hardware (PLC_SIM=false uses UmasMwClient).
    # ------------------------------------------------------------------

    async def read_many(self, addrs: list[int]) -> dict[int, int] | None:
        """SIM: read multiple %MW addresses. Returns {addr: value}."""
        if not addrs:
            return {}
        async with self._lock:
            self._tick()
            out: dict[int, int] = {}
            for a in addrs:
                out[a] = self._regs[a] if 0 <= a < self._SIZE else 0
            return out

    async def read_bits(self, addrs: list[int]) -> dict[int, bool] | None:
        """SIM: synthesise %M bits from the in-process register bank so the
        diag/logic view lights up as the operator drives the sim HMI.

        Mapping (sim only — derived, NOT a hardware contract):
          %M0  RUN-PERMIT  = True   (machine permitted in sim)
          %M1  MAIN on     = True
          %M2  SHUTOFF     = True   (closed/run)
          %M3  SOFT-LOCKOUT= False
          %M4  SAFETY-OK   = True   (sim safety always engaged; %MW20:X14)
          %M5  RESET       = False
          %M20 FIRE        = False  (sim simulates no faults)
          %M21 OVER-TEMP   = False
          %M22 SCORCH      = False
          %M23 Hot-fan ON  = %MW20:X13 (fan-proven mirror)
          %M80-83 MC_Power = running of the 4 VSDs in devId order
                             (0 Trace chain bit10, 1 Agitator1 bit3,
                              2 Agitator2 bit9, 3 Spinner bit2) from %MW20
          %M88-91 ReadStatus valid = True (sim always returns data)
        """
        if not addrs:
            return {}
        async with self._lock:
            self._tick()
            run = self._regs[20]            # running word (mirrors %MW0 after ~1 s)
            fan_proven = bool(run & (1 << 13))
            # VSD running bits by devId (cmd_bit positions, mirrored in %MW20).
            vsd_cmd_bits = [10, 3, 9, 2]    # trace_chain, ag1, ag2, spinner
            static = {
                0: True,    1: True,   2: True,   3: False,
                4: not self._estop,    5: False,   # %M4 SAFETY-OK drops on E-STOP
                20: False,  21: False, 22: False,
                23: fan_proven,
            }
            out: dict[int, bool] = {}
            for a in addrs:
                if a in static:
                    out[a] = static[a]
                elif 80 <= a <= 83:
                    out[a] = bool(run & (1 << vsd_cmd_bits[a - 80]))
                elif 88 <= a <= 91:
                    out[a] = True
                else:
                    out[a] = False
            return out

    async def write_register(self, address: int, value: int) -> bool:
        async with self._lock:
            self._regs[address] = value & 0xFFFF
            self._on_write(address, value)
        return True

    async def write_registers(self, address: int, values: list[int]) -> bool:
        async with self._lock:
            for i, v in enumerate(values):
                self._regs[address + i] = v & 0xFFFF
                self._on_write(address + i, v)
        return True

    async def read_modify_write_bit(self, address: int, bit: int, value: bool) -> bool:
        async with self._lock:
            word = self._regs[address]
            if value:
                word |= (1 << bit)
            else:
                word &= ~(1 << bit)
            word &= 0xFFFF
            self._regs[address] = word
            self._on_write(address, word)
        return True

    # Legacy coil shims (unused in normal operation but keep interface clean)
    async def read_coils(self, address: int, count: int = 1):
        return [False] * count

    async def write_coil(self, address: int, value: bool) -> bool:
        return True

    # ------------------------------------------------------------------
    # Internal simulation
    # ------------------------------------------------------------------

    def _on_write(self, address: int, value: int):
        """Called (inside lock) whenever a register is written."""
        if address == 0:
            # Command word — schedule each set bit to reflect into %MW20 after ~1 s
            now = time.monotonic()
            for bit in range(13):   # bits 0-12 = components
                target = bool(value & (1 << bit))
                current_running = bool(self._regs[20] & (1 << bit))
                if target != current_running:
                    delay = 0.8 + random.uniform(0.0, 0.4)
                    self._pending[bit] = (target, now + delay)

    def _tick(self):
        """Advance simulation — called inside lock before every read."""
        now = time.monotonic()
        dt = now - self._last_tick
        self._last_tick = now

        if self._estop:
            # E-STOP: safety relay dropped → power cut. Stop everything, drop the
            # safety + fan-proven bits, and clear the command word so nothing
            # re-runs until the operator restarts after reset.
            self._regs[0] = 0
            self._regs[20] = 0          # all running bits + safety(X14) + fan(X13) = 0
            self._pending.clear()
        else:
            # Apply any pending running-bit transitions
            for bit, (target, apply_at) in list(self._pending.items()):
                if now >= apply_at:
                    word = self._regs[20]
                    if target:
                        word |= (1 << bit)
                    else:
                        word &= ~(1 << bit)
                    self._regs[20] = word & 0xFFFF
                    del self._pending[bit]

            # Fan proven (bit 13) = mirrors hot_fan running (bit 0 of %MW20)
            hot_fan_running = bool(self._regs[20] & 0x01)
            word20 = self._regs[20]
            if hot_fan_running:
                word20 |= (1 << 13)
            else:
                word20 &= ~(1 << 13)
            # Safety OK (bit 14) — engaged unless E-STOP is held
            word20 |= (1 << 14)
            self._regs[20] = word20 & 0xFFFF

        # Ramp actual speeds toward setpoints
        # Speed setpoint regs: MW1=hot_fan, MW2=trace_chain, MW3=spinner,
        #                      MW4=agitator1, MW5=agitator2, MW6=disch_agi
        # Actual speed regs:   MW22=hot_fan, MW23=trace_chain, MW24=spinner,
        #                      MW25=agitator1, MW26=agitator2, MW27=disch_agi
        sp_act_pairs = [
            (1, 22),  # hot_fan
            (6, 27),  # disch_agi
            (3, 24),  # spinner
            (4, 25),  # agitator1
            (5, 26),  # agitator2
            (2, 23),  # trace_chain
        ]
        ramp_rate = 5000 * dt  # 5000 units/s → full range in ~2 s
        for sp_reg, act_reg in sp_act_pairs:
            sp  = self._regs[sp_reg]
            act = self._regs[act_reg]
            delta = sp - act
            if abs(delta) <= ramp_rate:
                self._regs[act_reg] = sp
            elif delta > 0:
                self._regs[act_reg] = int(act + ramp_rate)
            else:
                self._regs[act_reg] = int(act - ramp_rate)

        # Simulate temperatures
        burner_on       = bool(self._regs[20] & (1 << 11))
        hot_fan_running = bool(self._regs[20] & 0x01)   # re-derived: valid whether or not E-STOP held
        hot_fan_cmd     = bool(self._regs[0]  & (1 <<  0))

        # Hot fan motor (MW30): rises when hot_fan running, ambient otherwise
        target_hf = 85.0 if hot_fan_running else 25.0
        self._temp[30] += (target_hf - self._temp[30]) * min(dt * 0.3, 1.0)

        # Burner air (MW31): aggressive rise when burner on — ~600 °C target
        target_burner = 620.0 if burner_on else 25.0
        self._temp[31] += (target_burner - self._temp[31]) * min(dt * 0.15, 1.0)

        # Product 1 (MW32): slow rise when hot_fan + burner both on
        target_prod = 180.0 if (hot_fan_cmd and burner_on) else 25.0
        self._temp[32] += (target_prod - self._temp[32]) * min(dt * 0.04, 1.0)

        # Product 2 (MW33): lags product1 with a rolling average
        self._prod1_history.append(self._temp[32])
        self._prod1_history = self._prod1_history[-20:]
        self._temp[33] = sum(self._prod1_history) / len(self._prod1_history)

        # Exhaust (MW34): tracks burner loosely at lower temp
        target_ex = 320.0 if burner_on else 25.0
        self._temp[34] += (target_ex - self._temp[34]) * min(dt * 0.08, 1.0)

        # Write temps with gentle noise (±0.3 °C)
        for reg, val in self._temp.items():
            noise = random.uniform(-0.3, 0.3)
            self._regs[reg] = max(0, int((val + noise) * 10))
