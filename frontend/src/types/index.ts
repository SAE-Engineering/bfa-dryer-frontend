// BFD Dryer HMI — type definitions
// Matches HMI_CONTRACT.md WebSocket / state JSON shape exactly.

export type ComponentKind = 'vsd' | 'dol' | 'burner'

export interface Component {
  id: string
  label: string
  kind: ComponentKind
  has_speed: boolean
  manual: boolean     // false → indicator only (no operator toggle)
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

export interface Setpoints {
  burner_target: number
  burner_band: number
  product_max: number
}

export type LicenseStatusKind = 'ok' | 'warning' | 'expired' | 'invalid' | 'missing'

export interface License {
  status: LicenseStatusKind
  locked: boolean
  customer: string
  machine_id: string
  warn: string | null
  expires: string | null
  days_left: number | null
  message: string
}

export interface DryerState {
  type: 'state'
  ts: string
  connected: boolean
  released?: boolean   // true → HMI link dropped for MEB (PLC still running)
  sim: boolean
  safety_ok: boolean
  fan_proven: boolean
  components: Component[]
  temps: Temps
  setpoints: Setpoints
  license?: License
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

export interface SetpointRequest {
  key: string
  value_c: number
}

export interface HealthResponse {
  ok: boolean
  connected: boolean
  sim: boolean
}
