"""Shared PLC-release gate.

A single process-wide flag telling the poll loop to STOP touching the PLC so an
external tool (Schneider EcoStruxure Machine Expert – Basic / MEB) can take the
UMAS connection to upload or modify the program. Lives in its own module to
avoid a circular import between main.py (sets the flag + closes the socket) and
poll_loop.py (honours the flag).

No-sabotage: releasing the PLC connection NEVER stops running equipment — the
PLC keeps executing its loaded program. It only drops the HMI's read/write link
so a single UMAS master (MEB) can connect.
"""

_released: bool = False


def is_released() -> bool:
    return _released


def set_released(value: bool) -> None:
    global _released
    _released = bool(value)
