import { create } from 'zustand'
import { DryerState, Component, Temps, Setpoints, License } from '../types'

// Default / null state shown while connecting
const DEFAULT_TEMPS: Temps = {
  hotfan_motor: 0,
  burner: 0,
  product1: 0,
  product2: 0,
  exhaust: 0,
}

const DEFAULT_SETPOINTS: Setpoints = {
  burner_target: 85.0,
  burner_band: 2.0,
  product_max: 92.0,
}

const DEFAULT_LICENSE: License = {
  status: 'ok',
  locked: false,
  customer: '',
  machine_id: '',
  warn: null,
  expires: null,
  days_left: null,
  message: '',
}

const DEFAULT_STATE: DryerState = {
  type: 'state',
  ts: '',
  connected: false,
  sim: false,
  safety_ok: false,
  fan_proven: false,
  components: [],
  temps: DEFAULT_TEMPS,
  setpoints: DEFAULT_SETPOINTS,
  license: DEFAULT_LICENSE,
}

interface StoreState {
  dryer: DryerState
  wsStatus: 'connecting' | 'open' | 'closed'
  // Set the entire state from a WS message or REST snapshot
  setDryerState: (state: DryerState) => void
  setWsStatus: (s: 'connecting' | 'open' | 'closed') => void
  // Optimistic update: flip cmd on a single component
  setComponentCmd: (id: string, on: boolean) => void
}

export const useControlStore = create<StoreState>((set) => ({
  dryer: DEFAULT_STATE,
  wsStatus: 'connecting',

  setDryerState: (state) => set({ dryer: state }),

  setWsStatus: (s) => set({ wsStatus: s }),

  setComponentCmd: (id, on) =>
    set((prev) => ({
      dryer: {
        ...prev.dryer,
        components: prev.dryer.components.map((c: Component) =>
          c.id === id ? { ...c, cmd: on } : c
        ),
      },
    })),
}))
