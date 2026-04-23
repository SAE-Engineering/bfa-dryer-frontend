export interface SensorData {
  heatInput: number
  product1: number
  product2: number
  exhaust: number
}

export interface ControlState {
  burner: boolean
  fan: boolean
  conveyorA1: boolean
  conveyorA2: boolean
  spin: boolean
  hopper: boolean
  mill: boolean
}

export interface SystemStatus {
  connected: boolean
  plcReady: boolean
  lastUpdate: Date
}
