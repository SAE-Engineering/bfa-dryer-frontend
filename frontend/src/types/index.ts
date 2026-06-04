// BFD Dryer HMI — type definitions
// Matches HMI_CONTRACT.md WebSocket / state JSON shape exactly.

export type ComponentKind = 'vsd' | 'dol' | 'burner'

export interface Component {
  id: string
  label: string
  kind: ComponentKind
  has_speed: boolean
  cmd: boolean
  running: boolean
  fault: boolean
  speed_pct: number   // 0.0–100.0; valid only when has_speed === true
}

export interface Temps {
  hotfan_motor: number
  burner: number
  product1: number
  product2: number
  exhaust: number
}

export interface DryerState {
  type: 'state'
  ts: string
  connected: boolean
  sim: boolean
  safety_ok: boolean
  fan_proven: boolean
  components: Component[]
  temps: Temps
}

// REST request / response shapes

export interface CommandRequest {
  id: string
  on: boolean
}

export interface SpeedRequest {
  id: string
  value_pct: number
}

export interface BurnerSetpointRequest {
  celsius: number
}

export interface HealthResponse {
  ok: boolean
  connected: boolean
  sim: boolean
}
