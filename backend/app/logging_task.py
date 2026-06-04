"""
Data logging task — appends one CSV row every LOG_INTERVAL_S.

File: ${LOG_DIR}/bfd_log_YYYY-MM-DD.csv

Header (per HMI_CONTRACT.md):
  ts_iso,
  <component_id>_running  (0/1) for each component,
  <component_id>_speed    for each VSD component,
  temp_hotfan_motor, temp_burner, temp_product1, temp_product2, temp_exhaust,
  fan_proven, safety_ok
"""

import asyncio
import csv
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from app.components import COMPONENTS
from app.poll_loop import get_latest_state

logger = logging.getLogger(__name__)

# Build header once — matches the row-building logic below
_HEADER: list[str] = (
    ["ts_iso"]
    + [f"{c.id}_running" for c in COMPONENTS]
    + [f"{c.id}_speed" for c in COMPONENTS if c.has_speed]
    + ["temp_hotfan_motor", "temp_burner", "temp_product1", "temp_product2", "temp_exhaust"]
    + ["fan_proven", "safety_ok"]
)


def _today_path(log_dir: str) -> Path:
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return Path(log_dir) / f"bfd_log_{date_str}.csv"


def _state_to_row(state: dict) -> list:
    """Convert a state dict to a CSV row in header order."""
    comp_map = {c["id"]: c for c in state.get("components", [])}

    row = [state.get("ts", "")]

    # running bits
    for comp in COMPONENTS:
        c = comp_map.get(comp.id, {})
        row.append(1 if c.get("running") else 0)

    # speed actuals (VSD only)
    for comp in COMPONENTS:
        if comp.has_speed:
            c = comp_map.get(comp.id, {})
            row.append(round(c.get("speed_pct", 0.0), 2))

    # temps
    temps = state.get("temps", {})
    row.append(temps.get("hotfan_motor", 0.0))
    row.append(temps.get("burner", 0.0))
    row.append(temps.get("product1", 0.0))
    row.append(temps.get("product2", 0.0))
    row.append(temps.get("exhaust", 0.0))

    # flags
    row.append(1 if state.get("fan_proven") else 0)
    row.append(1 if state.get("safety_ok") else 0)

    return row


async def logging_task(settings):
    """
    Asyncio task: every LOG_INTERVAL_S seconds, grab the latest state and
    append a CSV row to today's log file, creating it with header if new.
    """
    os.makedirs(settings.LOG_DIR, exist_ok=True)

    while True:
        await asyncio.sleep(settings.LOG_INTERVAL_S)
        try:
            state = get_latest_state()
            if not state:
                continue  # No data yet

            path = _today_path(settings.LOG_DIR)
            write_header = not path.exists() or path.stat().st_size == 0

            with open(path, "a", newline="") as f:
                writer = csv.writer(f)
                if write_header:
                    writer.writerow(_HEADER)
                writer.writerow(_state_to_row(state))

            logger.debug(f"Log row written to {path}")

        except Exception as e:
            logger.error(f"Logging task error: {e}")
