# BFA Dryer HMI — Final-PLC Reconciliation & Completion

**Date:** 2026-06-15
**Status:** design (awaiting review)
**Repo:** bfa-dryer-frontend (`feat/plc-release`)

## Goal

Make the existing HMI run correctly **live against the final, MEB-validated PLC program** (`BFD_final.smbp`): 4 drives on the Modbus Serial IOScanner (ATV320 spinner + 3× ATV12), original Q-map, PLC e-stop on `%Q0.9`. First-run scope = **manual** on/off per component + live temps + VSD speeds + data logging from day one.

The HMI is already ~90% built (React/Tailwind kiosk, FastAPI/UMAS backend, CSV logging, M700 Docker deploy). This is **reconciliation + wiring the live-hardware gaps**, not new UI.

## Non-goals

- **No automation.** No cook-off→production state machine, no auto sequencing. Client wants it manual for now. (Deferred, not deleted.)
- **No PLC program changes.** Approach A keeps all work in the HMI; the PLC stays as the protected, MEB-validated `BFD_final.smbp`.
- Actual-RPM speed feedback (`%IW` IOScanner read words) is **deferred** — first run shows commanded speed.

## Approach A (approved)

Extend the HMI's UMAS client to read the objects the HMI is currently missing — **safety (`%M4`) and fault trip-bits (`%M20/21/22`)** — directly via UMAS func `0x24` (already a `%M`/coil/`%MW` bulk read), instead of mirroring them into `%MW` in the PLC. Zero PLC churn: no regenerate, no recompile, no re-applying the `BFAplc` read-protect.

## Transport / read-protect

- Poll via UMAS `0x24` (bulk read) + `0x25` (`%MW` write); single TCP to `10.10.10.10:502`, no reservation.
- The `BFAplc` read-protect gates `0x28` (program-block upload — the err 0x87 we saw), **not** runtime `0x24`/`0x25`. So polling survives the password. **Verify once live** (HMI shows data with protection on).

## Reconciled register map (HMI conforms to the PLC — the PLC is source of truth)

| PLC register | Meaning | HMI action |
|---|---|---|
| `%MW0` bits X0..X11 | component on/off command (X0 fan, X1 disch-agi, X2 spinner, X3 ag1, X4 mill, X5 disch-conv, X6 loading, X7 brush, X8 shaker, X9 ag2, X10 trace, X11 burner) | write (read-modify-write) — **audit each bit vs `make_final.py`** |
| `%MW40/41/42/43` | drive Hz setpoints: spinner / ag1 / ag2 / trace | **write** (replaces old `%MW1–6`) |
| `%MW44` | hot-fan speed setpoint | write |
| `%MW31/32/33/34` | temps °C×10: burner / prod1 / prod2 / exhaust | **read directly** (drop the `%MW23–26` mirrors — they collide with the old speed-actual map) |
| `%M4` | safety OK (mirrors `%I0.13`, active-high) | **read via `0x24` (%M)** — replaces hardcoded `safety_ok=True` |
| `%M20/21/22` | fire-trip / over-temp / scorch | **read via `0x24` (%M)** → fault annunciation |
| `%MW45–49` | burner setpoints (target/band/product-max) | write (existing) |
| `%MW2` | mode (1=manual) | read (display) |
| `%MW10/11` | heartbeat watchdog | keep |

Speeds displayed = **commanded** (the `%MW40–43` the HMI wrote). Actual RPM via IOScanner read `%IWN10x` (RFRD) = deferred phase-2.

## Units of work

**Backend**
1. `umas_client.py` — add `read_bits([%M addrs])` via `0x24` with the `%M` object descriptor. *Task 0:* confirm the descriptor bytes (UMAS capture / read-only probe against the live PLC); fallback = a PLC `%MW` status-mirror (Approach B) for any object that proves unreadable.
2. `components.py` — re-derive the canonical component map from `BFD_final.smbp` (cmd bits + setpoint regs `%MW40–44`). Single source of truth.
3. `poll_loop.py` — read real safety (`%M4`); build the fault list from `%M20/21/22` (+ drive comms-fault); read temps `%MW31–34`; speeds = commanded; **remove** hardcoded `safety_ok=True`; fix `fan_proven` to read the status, not the command bit.
4. `config.py` / `.env` — live profile: `PLC_HOST=10.10.10.10`, `PLC_PORT=502`, `PLC_PROTO=umas`, `PLC_SIM=false` (keep sim default for dev).

**Frontend**
5. Fault annunciation UI — surface the fault list (per-component fault LEDs exist; wire them to the new fault data + add a fault summary banner).
6. `VsdPrograms` modal — flesh the commissioning placeholder into a usable screen.
7. Tiles/labels — ensure component tiles + speed setpoints reflect the reconciled map.

**Tests**
- Sim path keeps working (regression).
- Live: trace-chain test (drive at slave 1 = `%DRV0`) through the HMI — toggle on, set speed, confirm command reaches the drive; confirm temps + safety read live with protection on.

## Data flow

PLC `10.10.10.10` ⇄ UMAS (`umas_client`) → `poll_loop` (500 ms) → State JSON → WebSocket → Zustand → React tiles/temps/faults. Commands: tile tap → `/api/command` → `set_bit %MW0`. Speed: modal → `/api/speed` → write `%MW40–43`. Setpoint: modal → `/api/setpoint` → `%MW45–49`.

## Risks / open items

- **`%M` descriptor bytes for `0x24`** — confirm first (Task 0); B fallback if unreadable.
- **Live read-protect confirm** — 10-sec panel check that the HMI still reads with `BFAplc` set.
- **Command-bit audit** — `components.py` vs `make_final.py` must be exact; a wrong bit toggles the wrong machine.
- Actual-RPM feedback deferred — first run shows commanded speed.
