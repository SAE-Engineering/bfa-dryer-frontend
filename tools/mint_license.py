#!/usr/bin/env python3
"""
Mint a signed BFD Dryer HMI licence (SAE side).

Signs a licence payload with SAE's Ed25519 PRIVATE key. The panel verifies it
with the embedded public key. Output is a license.json to drop onto the panel
(over Zerotier) at ~/bfa-dryer-frontend/data/license.json.

Usage:
  # explicit dates (warn = the "Monday", expires = the "Friday")
  python3 mint_license.py --customer "Banana Feeds Australia" \
      --machine-id bfa-hmi-01 \
      --warn 2026-08-24 --expires 2026-08-28 \
      --out license.json

  # or relative
  python3 mint_license.py --customer "BFA" --machine-id bfa-hmi-01 \
      --expires-in-days 90 --warn-before-days 4 --out license.json

Private key defaults to ~/.claude/secrets/bfa-license-signing.key (base64 raw
Ed25519). Keep it secret; never commit it.
"""

import argparse
import base64
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def canonical(payload: dict) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def parse_date(s: str) -> datetime:
    s = s.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        dt = datetime.strptime(s, "%Y-%m-%d")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def main() -> None:
    ap = argparse.ArgumentParser(description="Mint a signed BFD HMI licence")
    ap.add_argument("--customer", required=True)
    ap.add_argument("--machine-id", required=True, help="must match the panel's MACHINE_ID")
    ap.add_argument("--warn", help="warning-banner start date (ISO or YYYY-MM-DD)")
    ap.add_argument("--expires", help="lockout date (ISO or YYYY-MM-DD)")
    ap.add_argument("--expires-in-days", type=int, help="alt: expiry N days from now")
    ap.add_argument("--warn-before-days", type=int, default=4,
                    help="alt: warn this many days before expiry (default 4)")
    ap.add_argument("--key", default=str(Path.home() / ".claude/secrets/bfa-license-signing.key"))
    ap.add_argument("--out", default="license.json")
    args = ap.parse_args()

    now = datetime.now(timezone.utc)

    if args.expires:
        expires = parse_date(args.expires)
    elif args.expires_in_days is not None:
        expires = now + timedelta(days=args.expires_in_days)
    else:
        ap.error("provide --expires or --expires-in-days")

    if args.warn:
        warn = parse_date(args.warn)
    else:
        warn = expires - timedelta(days=args.warn_before_days)

    if warn > expires:
        ap.error("warn date must be on or before expires date")

    payload = {
        "customer":   args.customer,
        "machine_id": args.machine_id,
        "issued":     now.replace(microsecond=0).isoformat(),
        "warn":       warn.replace(microsecond=0).isoformat(),
        "expires":    expires.replace(microsecond=0).isoformat(),
        "nonce":      secrets.token_hex(8),
    }

    priv_b64 = Path(args.key).read_text().strip()
    priv = Ed25519PrivateKey.from_private_bytes(base64.b64decode(priv_b64))
    sig = priv.sign(canonical(payload))

    doc = {"payload": payload, "sig": base64.b64encode(sig).decode()}
    out = Path(args.out)
    out.write_text(json.dumps(doc, indent=2) + "\n")
    os.chmod(out, 0o644)

    print(f"Wrote {out}")
    print(f"  customer : {payload['customer']}")
    print(f"  machine  : {payload['machine_id']}")
    print(f"  warn     : {payload['warn']}")
    print(f"  expires  : {payload['expires']}")
    print()
    print("Install on the panel (over Zerotier):")
    print(f"  scp {out} bfa-hmi-zt:~/bfa-dryer-frontend/data/license.json")
    print("  # backend reloads automatically within one poll (~0.5 s)")


if __name__ == "__main__":
    main()
