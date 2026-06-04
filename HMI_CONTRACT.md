# BFD Dryer Operator HMI — BUILD CONTRACT (first production run)

Extend the EXISTING scaffold in this repo (`backend/` FastAPI+pymodbus+WS, `frontend/` React+TS+
Vite+Tailwind+Zustand). Keep its structure; replace the placeholder component list + the coil-based
Modbus with the real BFD components and the **holding-register** map below.

Scope = SIMPLE first run: **manual on/off per component, live temps + drive speeds, data logging.**
No automation/sequencing. Dark theme. Touch-friendly (this runs full-screen on the M700 HMI).

## Components (canonical — both backend and frontend use these ids/order)
| id | label | kind | has_speed | cmd_bit (%MW0) | status_bit (%MW20) | speed_sp_reg | speed_act_reg |
|----|-------|------|-----------|-----|-----|-----|-----|
| hot_fan | Hot Fan | vsd | yes | 0 | 0 | %MW1 | %MW22 |
| disch_agi | Discharge Agitator | vsd | yes | 1 | 1 | %MW6 | %MW27 |
| spinner | Spinner | vsd | yes | 2 | 2 | %MW3 | %MW24 |
| agitator1 | Agitator 1 | vsd | yes | 3 | 3 | %MW4 | %MW25 |
| agitator2 | Agitator 2 | vsd | yes | 4 | 4 | %MW5 | %MW26 |
| trace_chain | Trace Chain | vsd | yes | 5 | 5 | %MW2 | %MW23 |
| mill | Mill | dol | no | 6 | 6 | — | — |
| disch_conv | Discharge Conveyor | dol | no | 7 | 7 | — | — |
| load_conv | Loading Conveyor | dol | no | 8 | 8 | — | — |
| shaker | Shaker | dol | no | 9 | 9 | — | — |
| brush | Brush | dol | no | 10 | 10 | — | — |
| burner | Burner (enable/low) | burner | no | 11 | 11 | — | — |
| burner_high | Burner High | burner | no | 12 | 12 | — | — |

## Modbus register map (Modbus TCP, unit id 1, all HOLDING REGISTERS; addresses are 0-based)
- **Commands (HMI writes, FC06/FC16):**
  - `%MW0` = command word. Bit k (`%MW0:Xk`) = on/off request for the component with cmd_bit=k.
    HMI sets/clears a bit via **read-modify-write** of %MW0 (read FC03, flip bit, write FC16).
  - Speed setpoints `%MW1..%MW6` per table, scale **0–10000 = 0.00–100.00 %**.
  - `%MW7` = burner setpoint, **°C ×10**.
- **Status (HMI reads, FC03):**
  - `%MW20` = running/status word: bit k = running feedback for status_bit=k;
    **X13 = fan proven running, X14 = safety OK (I0.13)**.
  - `%MW21` = fault word (bit k = fault on component k). Any bit set → show that component faulted.
  - `%MW22..%MW27` = actual speeds (same 0–10000 = 0–100% scale).
  - Temps **°C ×10**: `%MW30` Hot Fan motor, `%MW31` Burner air, `%MW32` Product 1,
    `%MW33` Product 2, `%MW34` Exhaust. (value / 10 = °C.)

## Backend (FastAPI) requirements
- Config (`config.py` / .env): `PLC_HOST`, `PLC_PORT=502`, `MODBUS_UNIT_ID=1`, `POLL_MS=500`,
  `PLC_SIM=true|false`, `LOG_DIR=/data`, `LOG_INTERVAL_S=5`.
- Poll loop every POLL_MS: read %MW20, %MW21, %MW22-27, %MW30-34 → build a State object →
  broadcast over WebSocket (`/ws`) to all clients as JSON.
- Commands: `POST /api/command {id, on}` → read-modify-write the bit in %MW0.
  `POST /api/speed {id, value_pct}` → write the component's speed_sp_reg (value_pct*100 clamped 0..10000).
  `POST /api/burner_setpoint {celsius}` → write %MW7.
- `GET /api/health` → `{ok, connected, sim}`. `GET /api/state` → latest State (for initial load).
- **Data logging:** every LOG_INTERVAL_S append a row to `${LOG_DIR}/bfd_log_YYYY-MM-DD.csv`:
  `ts_iso, <each component running 0/1>, <each speed_act>, temp_hotfan_motor, temp_burner,
  temp_product1, temp_product2, temp_exhaust, fan_proven, safety_ok`. Create header if new file.
- **PLC_SIM mode:** an in-process fake holding-register bank (no hardware). Commands update %MW0;
  the sim reflects each commanded bit into %MW20 running after ~1s, ramps actual speed toward
  setpoint, and produces gently varying plausible temps (e.g. burner 600±, products rising). So the
  whole HMI works end-to-end with NO PLC for dev/demo. Default `PLC_SIM=true` until on-site.
- Use the existing `modbus_client.py` (extend it: add read-modify-write helper, FC16 multi-write).
- Resilience: if PLC unreachable, keep serving (connected=false), retry connect; never crash.

## WebSocket / state JSON shape (backend → frontend)
```json
{ "type":"state", "ts":"ISO", "connected":true, "sim":true, "safety_ok":true, "fan_proven":false,
  "components":[ {"id":"hot_fan","label":"Hot Fan","kind":"vsd","has_speed":true,
                  "cmd":false,"running":false,"fault":false,"speed_pct":0.0} , ... ],
  "temps":{ "hotfan_motor":0.0,"burner":0.0,"product1":0.0,"product2":0.0,"exhaust":0.0 } }
```

## Frontend (React) requirements
- Dark theme (default, follow scaffold's Tailwind). Big, touch-friendly tiles (HMI on a screen).
- **Status bar:** connection (green/red), SIM badge if sim, Safety OK, Fan proven, "logging ✓".
- **Component grid:** a tile per component — label, big ON/OFF toggle (sends POST /api/command),
  running indicator (LED from status), fault indicator (red). For `has_speed` components: a speed
  slider 0–100% (sends POST /api/speed, debounced) + actual-speed readout.
- **Temps panel:** 5 readouts (Hot Fan motor, Burner, Product 1, Product 2, Exhaust) in °C, 1 decimal,
  prominent (these matter most to the operator). Optional colour if very hot.
- Live updates via the existing `useWebSocket` hook (extend to the new state shape) + Zustand store.
- Group tiles sensibly: Heating (Hot Fan, Burner, Burner High), Feed (Loading Conv, Spinner,
  Agitator 1/2, Trace Chain), Discharge (Discharge Agitator, Brush, Discharge Conv, Mill, Shaker).

## Deploy
- `docker-compose.yml` already builds backend + frontend. Backend serves API+WS; frontend nginx
  serves SPA and proxies `/api` + `/ws` to backend. Keep that pattern. Bind-mount `./data:/data`
  for logs. Default to SIM so it runs anywhere.

## Verify before done
- Backend: `PLC_SIM=true` → `GET /api/health` ok; WS emits state; POST command flips a tile running
  within ~1s in sim; a CSV row appears in LOG_DIR. Frontend: `npm run build` clean.
