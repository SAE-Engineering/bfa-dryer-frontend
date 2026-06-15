"""
umas_client.py — Async-friendly UMAS %MW read/write client for Schneider M221.

Protocol: Modbus/TCP function 0x5A (UMAS), NO reservation needed for %MW r/w.
Proven live against BFD dryer M221 at bfd-dryer.sauer.com.au:502.

Transport contract:
  - Single persistent TCP connection.  Call connect() once; the poll loop
    keeps it open and calls reconnect() on failure.
  - All blocking socket I/O runs in asyncio's thread executor so the event
    loop is never blocked.
  - Never raises to the caller — returns None / False on any error and logs.
  - is_connected tracks live state; the caller checks this for /api/health.
"""

import asyncio
import logging
import socket
import struct
from typing import Optional

logger = logging.getLogger(__name__)


class UmasMwClient:
    """
    UMAS %MW read/write client (async wrapper around a synchronous socket).

    %MWn = UMAS segment 0x03, address n.
    Frame = MBAP(7 bytes BE: trans_id, proto=0, length, unit=1)
            | 0x5A | pairing=0x00 | umas_func | body

    On connect: sends init_comm (func 0x01) and discards the response.
    READ  (func 0x24): multi-address burst read, one round-trip.
    WRITE (func 0x25): single %MW write.
    set_bit: read-modify-write on %MW0 (the command word).
    """

    def __init__(self, host: str, port: int = 502, timeout: float = 8.0):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.is_connected: bool = False
        self._sock: Optional[socket.socket] = None
        self._tx: int = 0
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> bool:
        """Open TCP connection and send init_comm.  Returns True on success."""
        try:
            sock = await asyncio.get_event_loop().run_in_executor(
                None, self._sync_connect
            )
            self._sock = sock
            self.is_connected = True
            logger.info(f"UMAS connected to {self.host}:{self.port}")
            return True
        except Exception as e:
            logger.error(f"UMAS connect failed: {e}")
            self._sock = None
            self.is_connected = False
            return False

    def _sync_connect(self) -> socket.socket:
        """Blocking: create socket, connect, send init_comm."""
        s = socket.create_connection((self.host, self.port), timeout=self.timeout)
        s.settimeout(self.timeout)
        self._tx = 0
        # init_comm: func 0x01, payload b"\x00"
        self._sync_send(s, 0x01, b"\x00")
        self._sync_recv(s)  # discard response
        return s

    async def close(self) -> None:
        """Close the socket gracefully."""
        async with self._lock:
            self._close_sock()

    def _close_sock(self) -> None:
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None
        self.is_connected = False

    async def _reconnect(self) -> bool:
        """Close current socket and reconnect.  Called inside the lock."""
        self._close_sock()
        logger.info(f"UMAS reconnecting to {self.host}:{self.port}…")
        try:
            sock = await asyncio.get_event_loop().run_in_executor(
                None, self._sync_connect
            )
            self._sock = sock
            self.is_connected = True
            logger.info("UMAS reconnected successfully")
            return True
        except Exception as e:
            logger.error(f"UMAS reconnect failed: {e}")
            self.is_connected = False
            return False

    # ------------------------------------------------------------------
    # Frame I/O (synchronous — run in executor)
    # ------------------------------------------------------------------

    def _sync_send(self, sock: socket.socket, func: int, payload: bytes,
                   pairing: int = 0x00) -> int:
        """Build and send one UMAS frame.  Returns the transaction id used."""
        self._tx = (self._tx + 1) & 0xFFFF
        pdu = bytes([0x5A, pairing, func]) + payload
        # MBAP: trans_id(2) proto=0(2) length(2) unit=1(1)
        mbap = struct.pack(">HHHB", self._tx, 0, len(pdu) + 1, 1)
        sock.sendall(mbap + pdu)
        return self._tx

    def _sync_recv(self, sock: socket.socket) -> bytes:
        """Read one complete MBAP-framed response.  Returns everything after MBAP."""
        # Read 7-byte MBAP header
        hdr = b""
        while len(hdr) < 7:
            chunk = sock.recv(7 - len(hdr))
            if not chunk:
                raise ConnectionError("UMAS socket closed mid-MBAP")
            hdr += chunk
        _tx, _proto, length, _unit = struct.unpack(">HHHB", hdr)
        # Read (length - 1) remaining bytes  (length includes unit_id byte)
        body = b""
        remaining = length - 1
        while len(body) < remaining:
            chunk = sock.recv(remaining - len(body))
            if not chunk:
                raise ConnectionError("UMAS socket closed mid-body")
            body += chunk
        return body  # starts with 0x5A pairing status ...

    def _sync_exchange(self, sock: socket.socket, func: int, payload: bytes,
                       pairing: int = 0x00) -> bytes:
        """send + recv, return body bytes."""
        self._sync_send(sock, func, payload, pairing)
        return self._sync_recv(sock)

    # ------------------------------------------------------------------
    # High-level operations (async, hold lock, run blocking I/O in executor)
    # ------------------------------------------------------------------

    async def read_many(self, addrs: list[int]) -> Optional[dict[int, int]]:
        """
        Read multiple %MW addresses in one round-trip.
        Returns {addr: value} or None on error.

        UMAS func 0x24 multi-read body:
          byte[0]   = count
          then for each addr: [2, 3, addr_lo, addr_hi, 1, 0]  (6 bytes each)

        Response body after MBAP:
          [0x5A, 0x00, 0xFE, count]  then count × 4-byte groups:
          each group: [0x00, 0x00, val_lo, val_hi]
          → value = group[2] | (group[3] << 8)
        """
        if not addrs:
            return {}
        # The M221 caps a single 0x24 multi-read at 10 variables (verified live
        # 2026-06-15: requesting >10 returns exactly 10 -> the "short response"
        # bug). Chunk to stay under it; 8 leaves margin. Each chunk = one
        # round-trip, all under the same lock/connection.
        MAX_VARS = 8

        async with self._lock:
            if self._sock is None:
                if not await self._reconnect():
                    return None
            try:
                sock = self._sock
                result: dict[int, int] = {}
                for off in range(0, len(addrs), MAX_VARS):
                    chunk = addrs[off:off + MAX_VARS]
                    payload = bytes([len(chunk)])
                    for a in chunk:
                        payload += bytes([2, 3, a & 0xFF, (a >> 8) & 0xFF, 1, 0])
                    body = await asyncio.get_event_loop().run_in_executor(
                        None, lambda p=payload: self._sync_exchange(sock, 0x24, p)
                    )
                    # body[0]=0x5A, [1]=pairing=0x00, [2]=0xFE(ok), [3]=count
                    if len(body) < 4 + len(chunk) * 4:
                        raise ValueError(
                            f"UMAS read_many short response ({len(body)} bytes) for chunk {chunk}")
                    if body[2] != 0xFE:
                        raise ValueError(f"UMAS read_many status {body[2]:#04x} (expected 0xFE)")
                    for i, a in enumerate(chunk):
                        g = body[4 + 4 * i: 8 + 4 * i]
                        result[a] = g[2] | (g[3] << 8)
                self.is_connected = True
                return result
            except Exception as e:
                logger.error(f"UMAS read_many{addrs} error: {e}")
                self.is_connected = False
                await self._reconnect()
                return None

    async def read(self, n: int) -> Optional[int]:
        """Read a single %MW register.  Returns value or None on error."""
        result = await self.read_many([n])
        if result is None:
            return None
        return result.get(n)

    # ------------------------------------------------------------------
    # %M (memory bit) read — UMAS func 0x24, object class 0x02
    # ------------------------------------------------------------------
    #
    # Object-class byte for the 0x24 multi-read selects the variable table:
    #   class 0x03 = %MW (word, 2-byte value)   ← read_many()
    #   class 0x02 = %M  (memory bit, 1-byte value, 0/1)
    # Confirmed byte-for-byte from MEB animation-table captures (2026-06-15):
    # MEB polled %M0/%M1/%M2/%M199 with descriptor [0x02, 0x02, addr_lo, addr_hi,
    # 0x01, 0x00] and the PLC answered each item as [0x00, 0x00, bit] (1 data byte),
    # decoding to %M0=1 %M1=0 %M2=1 %M199=0 — exactly the resting program state.
    # See ~/projects/bfa-plc-cli/M221_ADDRESS_MAP.md §6d and UMAS_PROTOCOL.md §2.
    #
    # Reads use pairing 0x00 (no reservation), so this survives the BFAplc
    # read-protect (which only gates the 0x28 program-block upload).

    M_OBJECT_CLASS = 0x02   # %M (memory bit) object class for func 0x24

    async def read_bits(self, addrs: list[int]) -> Optional[dict[int, bool]]:
        """
        Read multiple %M (memory bit) addresses in one 0x24 round-trip.
        Returns {addr: bool} or None on error.

        Request body (func 0x24):
          [count] then per-address: [0x02, 0x02, addr_lo, addr_hi, 0x01, 0x00]
          (the second 0x02 is the %M object class; 0x03 would be %MW).

        Response body after MBAP:
          [0x5A, pairing=0x00, 0xFE, count]  then count × per-item groups:
          each %M item = [0x00, 0x00, bit]  (3 bytes; bit = 0 or 1).
          → bool(bit & 1).
        """
        if not addrs:
            return {}
        payload = bytes([len(addrs)])
        for a in addrs:
            payload += bytes([2, self.M_OBJECT_CLASS, a & 0xFF, (a >> 8) & 0xFF, 1, 0])

        async with self._lock:
            if self._sock is None:
                if not await self._reconnect():
                    return None
            try:
                sock = self._sock
                body = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self._sync_exchange(sock, 0x24, payload)
                )
                # body[0]=0x5A, [1]=pairing, [2]=status, [3]=count
                if len(body) < 4:
                    raise ValueError(f"UMAS read_bits short response ({len(body)} bytes)")
                if body[2] != 0xFE:
                    raise ValueError(f"UMAS read_bits status {body[2]:#04x} (expected 0xFE)")
                count = body[3]
                if count != len(addrs):
                    raise ValueError(
                        f"UMAS read_bits count mismatch (resp {count} != req {len(addrs)})")
                # Each %M item is 3 bytes: [0x00, 0x00, bit]
                result: dict[int, bool] = {}
                p = 4
                for a in addrs:
                    group = body[p:p + 3]
                    if len(group) < 3:
                        raise ValueError(
                            f"UMAS read_bits truncated item for %M{a} at offset {p}")
                    result[a] = bool(group[2] & 1)
                    p += 3
                self.is_connected = True
                return result
            except Exception as e:
                logger.error(f"UMAS read_bits{addrs} error: {e}")
                self.is_connected = False
                await self._reconnect()
                return None

    async def read_bit(self, addr: int) -> Optional[bool]:
        """Read a single %M bit.  Returns bool or None on error."""
        result = await self.read_bits([addr])
        if result is None:
            return None
        return result.get(addr)

    async def write(self, n: int, v: int) -> bool:
        """
        Write a single %MW register.
        UMAS func 0x25 body: [1, 2, 3, n_lo, n_hi, 1, 0, val_lo, val_hi]
        Response: check body[2] == 0xFE for OK.
        """
        v = v & 0xFFFF
        payload = bytes([1, 2, 3, n & 0xFF, (n >> 8) & 0xFF, 1, 0,
                         v & 0xFF, (v >> 8) & 0xFF])

        async with self._lock:
            if self._sock is None:
                if not await self._reconnect():
                    return False
            try:
                sock = self._sock
                body = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self._sync_exchange(sock, 0x25, payload)
                )
                ok = len(body) >= 3 and body[2] == 0xFE
                if not ok:
                    raise ValueError(f"UMAS write %MW{n} status {body[2] if len(body)>=3 else '?':#04x}")
                self.is_connected = True
                return True
            except Exception as e:
                logger.error(f"UMAS write %MW{n}={v} error: {e}")
                self.is_connected = False
                await self._reconnect()
                return False

    async def set_bit(self, n: int, bit: int, on: bool) -> bool:
        """
        Read-modify-write on %MW{n}: set or clear bit {bit}.
        Used for commanding %MW0 (the output command word).
        """
        # Must hold the lock for the whole RMW to avoid races.
        # We do two separate operations but the lock is re-entrant via
        # doing the RMW with direct sync calls inside the lock.
        async with self._lock:
            if self._sock is None:
                if not await self._reconnect():
                    return False
            try:
                sock = self._sock
                loop = asyncio.get_event_loop()

                # Read
                read_payload = bytes([1, 2, 3, n & 0xFF, (n >> 8) & 0xFF, 1, 0])
                body = await loop.run_in_executor(
                    None, lambda: self._sync_exchange(sock, 0x24, read_payload)
                )
                if len(body) < 8 or body[2] != 0xFE:
                    raise ValueError(f"UMAS set_bit read status {body[2] if len(body)>=3 else '?':#04x}")
                val = body[4 + 2] | (body[4 + 3] << 8)  # group[2] | group[3]<<8

                # Modify
                if on:
                    val = (val | (1 << bit)) & 0xFFFF
                else:
                    val = (val & ~(1 << bit)) & 0xFFFF

                # Write
                write_payload = bytes([1, 2, 3, n & 0xFF, (n >> 8) & 0xFF, 1, 0,
                                       val & 0xFF, (val >> 8) & 0xFF])
                body2 = await loop.run_in_executor(
                    None, lambda: self._sync_exchange(sock, 0x25, write_payload)
                )
                ok = len(body2) >= 3 and body2[2] == 0xFE
                if not ok:
                    raise ValueError(f"UMAS set_bit write status {body2[2] if len(body2)>=3 else '?':#04x}")

                self.is_connected = True
                return True
            except Exception as e:
                logger.error(f"UMAS set_bit %MW{n} bit{bit}={'1' if on else '0'} error: {e}")
                self.is_connected = False
                await self._reconnect()
                return False

    # Compatibility shim so the rest layer can call the same methods
    # as the Modbus client without changes to main.py command handler.
    async def read_modify_write_bit(self, address: int, bit: int, value: bool) -> bool:
        return await self.set_bit(address, bit, value)

    async def write_register(self, address: int, value: int) -> bool:
        return await self.write(address, value)

    async def write_registers(self, address: int, values: list) -> bool:
        """Write consecutive registers one at a time (UMAS has no multi-write shortcut)."""
        for i, v in enumerate(values):
            if not await self.write(address + i, v):
                return False
        return True

    async def read_holding_registers(self, address: int, count: int = 1) -> Optional[list]:
        """Compatibility shim for poll_loop fallback path."""
        addrs = list(range(address, address + count))
        result = await self.read_many(addrs)
        if result is None:
            return None
        return [result[a] for a in addrs]
