// Typed REST helpers for the BFD Dryer backend API.
// All paths are same-origin (Vite dev proxy forwards /api → backend:8000).

import {
  CommandRequest,
  SpeedRequest,
  BurnerSetpointRequest,
  SetpointRequest,
  HealthResponse,
  DryerState,
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

async function postEmpty<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
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

  // Operator acceptance — POST on splash screen accept tap
  postAcceptance: () =>
    postEmpty<{ ok: boolean; ts: string; machine_id: string }>('/api/acceptance'),

  // PLC release — PIN-gated; disconnects UMAS so MEB can take the PLC
  plcRelease: (pin: string) =>
    post<{ ok: boolean; released: boolean; message: string }>('/api/plc/release', { pin }),

  // PLC take — attempt to re-acquire PLC after release; auto-retried by frontend
  plcTake: () =>
    postEmpty<{ ok: boolean; connected: boolean; message: string }>('/api/plc/take'),

  // PLC released status
  plcReleasedStatus: () =>
    get<{ released: boolean; connected: boolean }>('/api/plc/released'),
}
