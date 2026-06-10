"""
acceptance.py — Operator acceptance logging and notification.

On each POST /api/acceptance:
  1. Appends a timestamped JSONL record to the daily acceptance log.
  2. Sends an email via Resend to admin@saee.com.au — UNLESS the
     BILLING_PAID env var is set to true (perpetual licence path).

Log location: ACCEPTANCE_LOG_DIR (default /app/acceptance-logs/)
Daily file:   acceptance_YYYY-MM-DD.jsonl

BILLING_PAID=true  → skip email + skip log (machine is paid-up; acceptance
                      is still stored for auditing unless you also want to
                      skip log in that case — currently we always log).

TODO: Replace sender domain noreply@saee.com.au with a Resend-verified
      sender domain. Check https://resend.com/domains for verified domains
      on this account. If saee.com.au is NOT verified, add it or use an
      already-verified domain (e.g. saebooks.com.au which likely is verified
      for existing transactional mail). Update RESEND_FROM in .env accordingly.
"""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"

# Acceptance log directory — override with ACCEPTANCE_LOG_DIR env var.
# Docker: mount a volume at /app/acceptance-logs/ so logs survive restarts.
_LOG_DIR = os.environ.get("ACCEPTANCE_LOG_DIR", "/app/acceptance-logs")

# Resend sender — TODO: verify domain in Resend dashboard first.
# If saee.com.au is not verified, switch to the verified domain below.
_RESEND_FROM = os.environ.get("RESEND_FROM", "noreply@saee.com.au")
# TODO: confirm saee.com.au is a verified sender domain in Resend.
#       If not, use: "noreply@saebooks.com.au" (likely already verified)

_RESEND_TO = "admin@saee.com.au"

_RESEND_API_KEY: Optional[str] = os.environ.get("RESEND_API_KEY")

_BILLING_PAID: bool = os.environ.get("BILLING_PAID", "false").lower() in ("true", "1", "yes")


def _today_log_path() -> Path:
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return Path(_LOG_DIR) / f"acceptance_{date_str}.jsonl"


def log_acceptance(machine_id: str) -> str:
    """
    Append a timestamped acceptance record to the daily JSONL log.
    Returns the ISO timestamp used.
    """
    ts = datetime.now(timezone.utc).isoformat()
    record = {"ts": ts, "machine_id": machine_id, "event": "operator_accepted"}

    try:
        Path(_LOG_DIR).mkdir(parents=True, exist_ok=True)
        path = _today_log_path()
        with open(path, "a") as f:
            f.write(json.dumps(record) + "\n")
        logger.info(f"Acceptance logged: {record}")
    except Exception as e:
        logger.error(f"Failed to write acceptance log: {e}")

    return ts


async def send_acceptance_email(machine_id: str, ts: str) -> bool:
    """
    Send an acceptance notification to admin@saee.com.au via Resend.
    Returns True if sent (or skipped due to BILLING_PAID), False on error.

    Skips silently if BILLING_PAID=true or RESEND_API_KEY is not set.
    """
    if _BILLING_PAID:
        logger.debug("BILLING_PAID=true — skipping acceptance email")
        return True

    if not _RESEND_API_KEY:
        # TODO: set RESEND_API_KEY in your .env — key is available in
        #       ~/.claude/secrets/resend.env on scada (RESEND_FULL_API_KEY)
        logger.warning("RESEND_API_KEY not set — acceptance email NOT sent")
        return False

    subject = f"BFD Dryer HMI — Operator Accepted Terms [{machine_id}]"
    body_html = f"""
<p>An operator has accepted the operating agreement on the BFD Dryer HMI.</p>
<ul>
  <li><strong>Machine ID:</strong> {machine_id}</li>
  <li><strong>Timestamp:</strong> {ts}</li>
</ul>
<p>This is an automated notification from the BFA Dryer HMI system.</p>
"""
    payload = {
        "from": _RESEND_FROM,
        "to": [_RESEND_TO],
        "subject": subject,
        "html": body_html,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                RESEND_API_URL,
                json=payload,
                headers={"Authorization": f"Bearer {_RESEND_API_KEY}"},
            )
        if resp.status_code in (200, 201):
            logger.info(f"Acceptance email sent to {_RESEND_TO} via Resend")
            return True
        else:
            logger.error(f"Resend API error {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        logger.error(f"Resend send failed: {e}")
        return False
