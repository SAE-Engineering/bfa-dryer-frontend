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

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`POST ${path} failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`)
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
    const res = await fetch('/api/diag', {
      headers: diagToken ? { 'X-Diag-Token': diagToken } : {},
    })
    if (!res.ok) {
      throw new Error(`GET /api/diag failed: ${res.status} ${res.statusText}`)
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
}
