// Typed REST helpers for the BFD Dryer backend API.
// All paths are same-origin (Vite dev proxy forwards /api → backend:8000).

import {
  CommandRequest,
  SpeedRequest,
  BurnerSetpointRequest,
  SetpointRequest,
  HealthResponse,
  DryerState,
  DiagState,
  DiagAuthResponse,
} from '../types'

// Deployment base path.  Vite injects BASE_URL from the build `base` option:
//   - real panel / dev  → "/"          → apiUrl('/api/x') === '/api/x'  (unchanged)
//   - bosun sim build    → "/bfa/sim/"  → apiUrl('/api/x') === '/bfa/sim/api/x'
// This lets the same SPA be served under a sub-path (behind the designpacks
// nginx) without hard-coding the prefix.  Trailing slash trimmed so we don't
// double up on the leading slash of the path argument.
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
export function apiUrl(path: string): string {
  return BASE + path
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const url = apiUrl(path)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`POST ${url} failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

async function get<T>(path: string): Promise<T> {
  const url = apiUrl(path)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

// In-memory diagnostics unlock token (issued by POST /api/diag-auth). Lives for
// the tab/session only — never persisted, never in the bundle. Cleared on tab
// close / reload. The real PIN is checked server-side; we only hold the token.
let diagToken: string | null = null
export function setDiagToken(t: string | null) { diagToken = t }
export function getDiagToken(): string | null { return diagToken }

export const api = {
  sendCommand: (req: CommandRequest) =>
    post<{ ok: boolean }>('/api/command', req),

  sendSpeed: (req: SpeedRequest) =>
    post<{ ok: boolean }>('/api/speed', req),

  setBurnerSetpoint: (req: BurnerSetpointRequest) =>
    post<{ ok: boolean }>('/api/burner_setpoint', req),

  setSetpoint: (req: SetpointRequest) =>
    post<{ ok: boolean; key: string; value_c: number; raw: number }>('/api/setpoint', req),

  getState: () => get<DryerState>('/api/state'),

  getHealth: () => get<HealthResponse>('/api/health'),

  // Hidden diagnostics — raw %MW / %M register dump (read-only).
  // PIN-gated: requires the unlock token issued by diagAuth (sent as a header).
  getDiag: async (): Promise<DiagState> => {
    const url = apiUrl('/api/diag')
    const res = await fetch(url, {
      headers: diagToken ? { 'X-Diag-Token': diagToken } : {},
    })
    if (!res.ok) {
      throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`)
    }
    return res.json() as Promise<DiagState>
  },

  // Diagnostics PIN check — server-side against env DIAG_PIN. Returns
  // {ok, token?}; the PIN itself never enters the JS bundle.
  diagAuth: (pin: string) =>
    post<DiagAuthResponse>('/api/diag-auth', { pin }),

  // PLC release/take — drop the HMI's PLC link so MEB can take it (PIN-gated).
  releasePlc: (pin: string) =>
    post<{ ok: boolean; released: boolean }>('/api/plc/release', { pin }),

  takePlc: () =>
    post<{ ok: boolean; released: boolean; connected: boolean }>('/api/plc/take', {}),

  getReleased: () =>
    get<{ released: boolean; connected: boolean }>('/api/plc/released'),

  // SIM-ONLY: engage/clear a simulated E-STOP (safety relay drop). Backend
  // refuses this unless it's running the in-process simulator.
  simEstop: (on: boolean) =>
    post<{ ok: boolean; estop: boolean }>('/api/sim/estop', { on }),
}
