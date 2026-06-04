"""
Offline licence enforcement for the BFD Dryer HMI.

A licence is a small JSON file {"payload": {...}, "sig": "<base64>"} where sig is
an Ed25519 signature (by SAE's private key) over the canonical JSON of payload.
The panel carries only the PUBLIC key, so a customer cannot forge or extend a
licence. Everything is checked against the LOCAL clock, so enforcement works
with no internet at all.

payload fields:
  customer    : str
  machine_id  : str           # must match this host (anti-copy)
  issued      : ISO-8601 UTC
  warn        : ISO-8601 UTC   # on-screen warning banner starts
  expires     : ISO-8601 UTC   # control locks (block new starts; STOP always allowed)
  nonce       : str

No-sabotage policy: a lock NEVER stops running equipment. It only refuses to
START. The warning window (warn -> expires) telegraphs the lockout well ahead.

Anti clock-rollback: a high-water file stores the latest wall-clock time ever
observed. Effective time = max(now, high_water), so winding the clock back
cannot buy more runtime.
"""

from __future__ import annotations

import base64
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Union

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature

logger = logging.getLogger(__name__)

# SAE licence-signing PUBLIC key (raw Ed25519, base64). Private key held by SAE.
DEFAULT_PUBKEY_B64 = "l5h+yrvEvisaYtZLSQ8fbPPNbSC9ucbT8hFGiysqAu8="


def canonical(payload: dict) -> bytes:
    """Canonical byte form signed/verified: sorted keys, compact separators."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def _parse_iso(s: str) -> datetime:
    dt = datetime.fromisoformat(s.strip().replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@dataclass
class LicenseStatus:
    status: str          # "ok" | "warning" | "expired" | "invalid" | "missing"
    locked: bool
    customer: str
    machine_id: str
    warn: Optional[str]
    expires: Optional[str]
    days_left: Optional[int]
    message: str

    def as_dict(self) -> dict:
        return {
            "status": self.status,
            "locked": self.locked,
            "customer": self.customer,
            "machine_id": self.machine_id,
            "warn": self.warn,
            "expires": self.expires,
            "days_left": self.days_left,
            "message": self.message,
        }


class LicenseManager:
    def __init__(
        self,
        license_path: Union[str, Path],
        hw_path: Union[str, Path],
        machine_id: str,
        pubkey_b64: str = DEFAULT_PUBKEY_B64,
        enforce: bool = True,
        require_machine: bool = True,
    ):
        self.license_path = Path(license_path)
        self.hw_path = Path(hw_path)
        self.machine_id = machine_id
        self.enforce = enforce
        self.require_machine = require_machine
        self._pub = Ed25519PublicKey.from_public_bytes(base64.b64decode(pubkey_b64))
        self._cache: Union[dict, str, None] = None     # verified payload | "INVALID" | None
        self._cache_mtime: Optional[float] = None
        self._hw: float = self._load_hw()
        self._hw_last_persist: float = 0.0

    # ---- high-water (anti clock-rollback) --------------------------------
    def _load_hw(self) -> float:
        try:
            return float(self.hw_path.read_text().strip())
        except Exception:
            return 0.0

    def _persist_hw(self, val: float) -> None:
        try:
            self.hw_path.parent.mkdir(parents=True, exist_ok=True)
            self.hw_path.write_text(f"{val:.0f}\n")
        except Exception as e:
            logger.warning(f"could not persist licence high-water: {e}")

    def _effective_now(self) -> datetime:
        now = time.time()
        if now > self._hw:
            self._hw = now
            if now - self._hw_last_persist > 60:   # persist at most once a minute
                self._persist_hw(self._hw)
                self._hw_last_persist = now
        return datetime.fromtimestamp(max(now, self._hw), tz=timezone.utc)

    # ---- verification ----------------------------------------------------
    def _verify_payload(self) -> Union[dict, str, None]:
        try:
            doc = json.loads(self.license_path.read_text())
            payload = doc["payload"]
            sig = base64.b64decode(doc["sig"])
            self._pub.verify(sig, canonical(payload))   # raises on bad sig
            return payload
        except FileNotFoundError:
            return None
        except (InvalidSignature, KeyError, ValueError, TypeError) as e:
            logger.warning(f"licence verification failed: {e}")
            return "INVALID"

    def status(self) -> LicenseStatus:
        eff = self._effective_now()

        if not self.enforce:
            return LicenseStatus(
                "ok", False, "(enforcement off)", self.machine_id,
                None, None, None, "Licence enforcement disabled",
            )

        # Cache the (expensive) signature verification by file mtime.
        try:
            mtime: Optional[float] = self.license_path.stat().st_mtime
        except FileNotFoundError:
            mtime = None
        if mtime != self._cache_mtime:
            self._cache = self._verify_payload()
            self._cache_mtime = mtime
        payload = self._cache

        if payload is None:
            return LicenseStatus(
                "missing", True, "—", self.machine_id, None, None, None,
                "No licence installed — contact SAE Engineering",
            )
        if payload == "INVALID":
            return LicenseStatus(
                "invalid", True, "—", self.machine_id, None, None, None,
                "Licence invalid — contact SAE Engineering",
            )

        customer = str(payload.get("customer", "—"))
        lic_machine = str(payload.get("machine_id", ""))
        if self.require_machine and lic_machine and lic_machine != self.machine_id:
            return LicenseStatus(
                "invalid", True, customer, self.machine_id, None, None, None,
                "Licence is for a different machine — contact SAE Engineering",
            )

        try:
            warn = _parse_iso(payload["warn"])
            expires = _parse_iso(payload["expires"])
        except Exception:
            return LicenseStatus(
                "invalid", True, customer, self.machine_id, None, None, None,
                "Licence dates malformed — contact SAE Engineering",
            )

        days_left = (expires - eff).days
        warn_iso, exp_iso = warn.isoformat(), expires.isoformat()

        if eff >= expires:
            return LicenseStatus(
                "expired", True, customer, self.machine_id, warn_iso, exp_iso, days_left,
                "Licence expired — control locked. Contact SAE Engineering.",
            )
        if eff >= warn:
            return LicenseStatus(
                "warning", False, customer, self.machine_id, warn_iso, exp_iso, days_left,
                f"Licence expires in {days_left} day(s) — contact SAE Engineering.",
            )
        return LicenseStatus(
            "ok", False, customer, self.machine_id, warn_iso, exp_iso, days_left, "Licensed",
        )
