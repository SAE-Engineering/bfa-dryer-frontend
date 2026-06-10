"""
run_logger.py — Background 2-minute operational run logger.

Every RUN_LOG_INTERVAL_S (default 120) seconds, reads the current dryer state
via get_latest_state() and appends a JSON line to the daily run log.

Log location: RUN_LOG_DIR (default /app/run-logs/)
Daily file:   run_YYYY-MM-DD.jsonl

Each record captures:
  ts           ISO8601 UTC timestamp
  connected    PLC connected flag
  safety_ok    safety relay state
  fan_proven   fan proven flag
  temps        {burner, product1, product2, exhaust, hotfan_motor} in °C
  status_word  %MW20 (0 or 1 per-bit running flags as hex string)
  components   list of {id, cmd, running, fault} for each component
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from app.poll_loop import get_latest_state

logger = logging.getLogger(__name__)

_LOG_DIR = os.environ.get("RUN_LOG_DIR", "/app/run-logs")
_INTERVAL_S = int(os.environ.get("RUN_LOG_INTERVAL_S", "120"))


def _today_path() -> Path:
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return Path(_LOG_DIR) / f"run_{date_str}.jsonl"


def _build_record(state: dict) -> dict:
    """Extract the fields we care about from the full state dict."""
    components = [
        {
            "id": c.get("id"),
            "cmd": c.get("cmd", False),
            "running": c.get("running", False),
            "fault": c.get("fault", False),
        }
        for c in state.get("components", [])
    ]
    return {
        "ts": datetime.now(timezone.utc).isoformat(),
        "state_ts": state.get("ts"),
        "connected": state.get("connected", False),
        "safety_ok": state.get("safety_ok", False),
        "fan_proven": state.get("fan_proven", False),
        "temps": state.get("temps", {}),
        "setpoints": state.get("setpoints", {}),
        "components": components,
    }


async def run_logger_task():
    """
    Asyncio background task: every RUN_LOG_INTERVAL_S seconds, grab the
    latest state and append a JSON line to today's run log.
    """
    logger.info(f"Run logger started — interval={_INTERVAL_S}s, dir={_LOG_DIR}")
    Path(_LOG_DIR).mkdir(parents=True, exist_ok=True)

    while True:
        await asyncio.sleep(_INTERVAL_S)
        try:
            state = get_latest_state()
            if not state:
                logger.debug("Run logger: no state yet, skipping")
                continue

            record = _build_record(state)
            path = _today_path()

            with open(path, "a") as f:
                f.write(json.dumps(record) + "\n")

            logger.debug(f"Run log record written to {path}")

        except Exception as e:
            logger.error(f"Run logger error: {e}")
