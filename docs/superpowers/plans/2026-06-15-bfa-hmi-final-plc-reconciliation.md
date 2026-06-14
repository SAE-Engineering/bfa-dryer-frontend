# BFA HMI — Final-PLC Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the existing bfa-dryer-frontend HMI run correctly live against the final PLC program `BFD_final.smbp`, manual-only.

**Architecture:** Reconcile the HMI's register contract to the PLC (the PLC is source of truth), extend the UMAS client to read `%M` (safety/faults) so no PLC change is needed (Approach A), wire real safety + fault annunciation, set the live config. Speeds shown = commanded; actual-RPM (`%IW`) deferred.

**Tech Stack:** FastAPI + asyncio + a hand-rolled UMAS client (Python); React 18 + TypeScript + Vite + Tailwind + Zustand.

**Repo:** bfa-dryer-frontend on bosun, branch `feat/plc-release`. Reference: `make_final.py` / `captures/BFD_final.smbp` in `~/projects/bfa-plc-cli` on scada for the authoritative register map. Spec: `docs/superpowers/specs/2026-06-15-bfa-hmi-final-plc-reconciliation-design.md`.

**Working agreement:** Run the backend test suite + the sim path after each task; commit per task. The live-PLC checks (Task 0 descriptor confirm, read-protect read) are flagged — do the code against sim now, verify on hardware later.

---

### Task 1: Canonical register/component map (source of truth)

**Files:** Modify `backend/app/components.py`; Modify `HMI_CONTRACT.md`.

The final PLC map (from `make_final.py` `ATV12_DRIVES` + the DOL/burner rungs):
- `%MW0` command bits: X0 fan, X1 disch-agitator, X2 spinner, X3 ag1, X4 mill, X5 disch-conv, X6 loading, X7 brush, X8 shaker, X9 ag2, X10 trace, X11 burner.
- Drive Hz setpoints (HMI writes): `%MW40` spinner, `%MW41` ag1, `%MW42` ag2, `%MW43` trace, `%MW44` hot-fan.
- Temps (°C×10, HMI reads): `%MW31` burner, `%MW32` prod1, `%MW33` prod2, `%MW34` exhaust.
- Burner setpoints (HMI writes): `%MW45` target, `%MW46` band, `%MW47`/`%MW49` over-temp/scorch (per the loaded ladder — verify exact addresses against `make_final.py` first-scan defaults).
- Safety: `%M4` (active-high OK). Faults: `%M20` fire-trip, `%M21` over-temp, `%M22` scorch.

- [ ] Audit `components.py` `cmd_bit`/`status_bit`/speed-reg fields against the list above; fix every mismatch. Speed setpoint regs become `%MW40-44`; remove the old `%MW1-6` / `%MW23-26` speed-actual fields (temps are read directly now).
- [ ] Update `HMI_CONTRACT.md` to this map; note speeds=commanded, actual-RPM deferred.
- [ ] Commit.

### Task 2: UMAS client — `read_bits` for `%M`

**Files:** Modify `backend/app/umas_client.py`; Test `backend/tests/test_umas_client.py`.

The existing `read_many` reads `%MW` via func `0x24` with per-item descriptor `[2, 3, addr_lo, addr_hi, 1, 0]` (the `3` = `%MW` object class). `%M` (memory bit) uses the same `0x24` call with the `%M` object-class byte.

- [ ] **Task 0 (do first):** determine the `%M` object-class descriptor byte. Source order: (a) our UMAS RE notes in `~/projects/bfa-plc-cli/UMAS_PROTOCOL.md` / captures; (b) a read-only probe of the live PLC (`%M4` should track `%I0.13`). If undeterminable now, implement with the best candidate and mark the call `# TODO confirm %M class byte against live PLC`; fallback documented = a PLC `%MW` status-mirror (Approach B). Do NOT block the rest of the build on this.
- [ ] Add `async def read_bits(self, addrs: list[int]) -> Optional[dict[int,bool]]` mirroring `read_many` but with the `%M` descriptor; decode each returned word's low bit to bool.
- [ ] Unit test against a fake socket replaying a known `0x24` `%M` response frame; assert the bit decode.
- [ ] Commit.

### Task 3: poll_loop — real safety, faults, temps, fan_proven

**Files:** Modify `backend/app/poll_loop.py`; remove `poll_loop.py.bak-safetyok`.

- [ ] Replace the hardcoded `safety_ok = True` with a live read of `%M4` via `read_bits` (UMAS path). Sim path: keep the simulated safety bit.
- [ ] Build a `faults` list from `%M20/21/22` (fire-trip/over-temp/scorch) read via `read_bits`; surface in the State JSON (`"faults": [...]` + per-component fault where mappable).
- [ ] Read temps from `%MW31-34` directly (already in the read burst); drop any reliance on `%MW23-26`.
- [ ] Fix `fan_proven` to read the status source, not the command bit (`%MW0:X0`). For now derive from `%M23` (hot-fan-on) if exposed, else mark commanded; document.
- [ ] Run the poll loop against the simulator; confirm State JSON shape unchanged except added `faults` + real `safety_ok` path. Commit.

### Task 4: Live config profile

**Files:** Modify `backend/config.py`; Create `backend/.env.panel.example`; update `deploy/panel/README.md`.

- [ ] Add a documented live profile: `PLC_HOST=10.10.10.10`, `PLC_PORT=502`, `PLC_PROTO=umas`, `PLC_SIM=false`, plus `LOG_DIR=/data`. Keep sim defaults for dev.
- [ ] Reference it from the panel deploy README. Commit.

### Task 5: Fault annunciation UI

**Files:** Modify `frontend/src/components/StatusBar.tsx` (or add `FaultBanner.tsx`); Modify `ComponentTile.tsx` if needed; Modify the store/types for the new `faults` field.

- [ ] Add a fault summary banner (amber/red) that lists active faults from the State JSON; clears when none. Per-component fault LEDs already exist — wire them to the new fault data.
- [ ] Verify against sim (inject a fault via the simulator). Commit.

### Task 6: VSD-commissioning modal

**Files:** Modify `frontend/src/components/VsdPrograms.tsx`.

- [ ] Flesh the placeholder into a usable reference screen: per-drive (spinner ATV320 / ag1/ag2/trace ATV12) the Modbus node (1-4), baud 19200 8E1, command/ref = Modbus, and the commissioning checklist (nameplate, accel/decel, V/f). Read-only reference; no drive writes from the HMI.
- [ ] Build the frontend; confirm it renders. Commit.

### Task 7: Regression + deploy readiness

- [ ] Run the full backend test suite + a sim smoke test (toggle a component, set a speed, see it reflect). 
- [ ] `docker compose build` the panel stack to confirm it builds. Do NOT deploy to the live kiosk yet (await Richard).
- [ ] Commit any fixes.

---

## Deferred / hardware-gated (NOT in this plan)
- Actual-RPM feedback (`%IW` IOScanner readback).
- Live `%M` descriptor confirmation + read-protect read (needs the live PLC at the panel).
- Kiosk deploy + on-site live test (needs the physical VSDs, Tue/Wed).
