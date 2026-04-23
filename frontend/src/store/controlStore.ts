import { create } from 'zustand'
import { SensorData, ControlState, SystemStatus } from '../types'

interface State {
  sensors: SensorData
  controls: ControlState
  status: SystemStatus
  setSensors: (sensors: SensorData) => void
  setControl: (key: keyof ControlState, value: boolean) => void
  setStatus: (status: SystemStatus) => void
}

export const useControlStore = create<State>((set) => ({
  sensors: {
    heatInput: 0,
    product1: 0,
    product2: 0,
    exhaust: 0,
  },
  controls: {
    burner: false,
    fan: false,
    conveyorA1: false,
    conveyorA2: false,
    spin: false,
    hopper: false,
    mill: false,
  },
  status: {
    connected: false,
    plcReady: false,
    lastUpdate: new Date(),
  },
  setSensors: (sensors) => set({ sensors }),
  setControl: (key, value) =>
    set((state) => ({
      controls: { ...state.controls, [key]: value },
    })),
  setStatus: (status) => set({ status }),
}))
