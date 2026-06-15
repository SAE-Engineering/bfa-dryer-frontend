"""
Unit tests for umas_client.UmasMwClient — read_bits (%M) and read_many (%MW).

These tests replay known UMAS func-0x24 response frames against a fake socket,
asserting the request descriptors (object-class byte) and the value/bit decode.
No PLC, no pymodbus, no network — pure protocol-framing tests.

The %M descriptor (object class 0x02) and the per-item 3-byte response layout
([0x00, 0x00, bit]) were confirmed byte-for-byte from MEB animation-table
captures on 2026-06-15 (see app/components.py + HMI_CONTRACT.md). %M0/1/2/199
were observed reading 1/0/1/0 with class 0x02; this test pins that decode.
"""

import asyncio
import struct
import sys
from pathlib import Path

# Make `import app.umas_client` work when run from backend/ or backend/tests/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.umas_client import UmasMwClient  # noqa: E402


# ---------------------------------------------------------------------------
# Fake blocking socket: records everything sent; replays queued MBAP frames.
# ---------------------------------------------------------------------------

class FakeSocket:
    def __init__(self, response_frames: list[bytes]):
        # Each frame is a complete MBAP-framed message (header + PDU).
        self._inbox = bytearray(b"".join(response_frames))
        self.sent = bytearray()

    def settimeout(self, _):
        pass

    def sendall(self, data: bytes):
        self.sent += data

    def recv(self, n: int) -> bytes:
        if not self._inbox:
            raise ConnectionError("FakeSocket inbox empty")
        chunk = bytes(self._inbox[:n])
        del self._inbox[:n]
        return chunk

    def close(self):
        pass


def _mbap_frame(pdu: bytes, tx: int = 1) -> bytes:
    """Wrap a UMAS PDU in an MBAP header (length = len(pdu)+1 incl. unit byte)."""
    return struct.pack(">HHHB", tx, 0, len(pdu) + 1, 1) + pdu


def _bits_response(bit_values: list[int]) -> bytes:
    """A func-0x24 %M response: [5a 00 fe count] then count × [00 00 bit]."""
    pdu = bytes([0x5A, 0x00, 0xFE, len(bit_values)])
    for b in bit_values:
        pdu += bytes([0x00, 0x00, 1 if b else 0])
    return _mbap_frame(pdu)


def _words_response(word_values: list[int]) -> bytes:
    """A func-0x24 %MW response: [5a 00 fe count] then count × [00 00 lo hi]."""
    pdu = bytes([0x5A, 0x00, 0xFE, len(word_values)])
    for w in word_values:
        pdu += bytes([0x00, 0x00, w & 0xFF, (w >> 8) & 0xFF])
    return _mbap_frame(pdu)


def _make_client(response_frames: list[bytes]) -> UmasMwClient:
    """A client wired to a FakeSocket that is already 'connected'."""
    c = UmasMwClient(host="test", port=502)
    c._sock = FakeSocket(response_frames)
    c.is_connected = True
    return c


def _run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# read_bits (%M)
# ---------------------------------------------------------------------------

def test_read_bits_decodes_each_bit():
    # %M4=1, %M20=0, %M21=1, %M22=0
    client = _make_client([_bits_response([1, 0, 1, 0])])
    result = _run(client.read_bits([4, 20, 21, 22]))
    assert result == {4: True, 20: False, 21: True, 22: False}


def test_read_bits_request_uses_m_object_class():
    """The 0x24 request descriptor MUST carry object class 0x02 for %M (not 0x03
    = %MW). A wrong class would read the wrong table — the whole point of Task 0."""
    client = _make_client([_bits_response([1])])
    _run(client.read_bits([4]))
    sent = bytes(client._sock.sent)
    # Find the UMAS PDU: MBAP(7) + [5a, pairing, func, count, descriptor...]
    pdu = sent[7:]
    assert pdu[0] == 0x5A          # UMAS
    assert pdu[2] == 0x24          # func READ_COILS_REGISTERS
    assert pdu[3] == 1             # count = 1 address
    descriptor = pdu[4:10]         # [0x02, class, addr_lo, addr_hi, 0x01, 0x00]
    assert descriptor[0] == 0x02
    assert descriptor[1] == 0x02, "object class must be 0x02 (%M), not 0x03 (%MW)"
    assert descriptor[2] == 4 and descriptor[3] == 0   # addr = %M4
    assert descriptor[4] == 1 and descriptor[5] == 0


def test_read_bits_single():
    client = _make_client([_bits_response([1])])
    assert _run(client.read_bit(4)) is True


def test_read_bits_empty():
    client = _make_client([])
    assert _run(client.read_bits([])) == {}


def test_read_bits_count_mismatch_returns_none():
    # Response claims 2 items but we asked for 3 → guard returns None (no crash).
    client = _make_client([_bits_response([1, 0])])
    assert _run(client.read_bits([4, 20, 21])) is None


def test_read_bits_error_status_returns_none():
    bad = _mbap_frame(bytes([0x5A, 0x00, 0xFD, 0x00]))  # 0xFD = error
    client = _make_client([bad, bad])  # 2nd frame for the auto-reconnect path
    assert _run(client.read_bits([4])) is None


# ---------------------------------------------------------------------------
# read_many (%MW) — keep the word path pinned so the two never get confused
# ---------------------------------------------------------------------------

def test_read_many_decodes_words():
    client = _make_client([_words_response([850, 20, 920])])
    result = _run(client.read_many([45, 46, 49]))
    assert result == {45: 850, 46: 20, 49: 920}


def test_read_many_request_uses_mw_object_class():
    client = _make_client([_words_response([0])])
    _run(client.read_many([45]))
    pdu = bytes(client._sock.sent)[7:]
    assert pdu[2] == 0x24
    descriptor = pdu[4:10]
    assert descriptor[1] == 0x03, "read_many must use object class 0x03 (%MW)"
