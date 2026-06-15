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
}
