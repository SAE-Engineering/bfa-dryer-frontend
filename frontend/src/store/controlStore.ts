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
  faults: [],
  components: [],
  temps: DEFAULT_TEMPS,
  setpoints: DEFAULT_SETPOINTS,
  license: DEFAULT_LICENSE,
}

interface StoreState {
  dryer: DryerState
  wsStatus: 'connecting' | 'open' | 'closed'
  // Epoch ms when the last *fresh* state frame was applied. Drives staleness
  // detection (frame age). 0 until the first frame lands.
  lastUpdate: number
  // SIM-ONLY: when true, incoming frames are dropped (feed frozen) and the UI
  // treats the PLC link as lost — lets the operator demo the comms-loss /
  // staleness handling on the bosun sim. Never set on the real panel.
  simCommDrop: boolean
  // Set the entire state from a WS message or REST snapshot
  setDryerState: (state: DryerState) => void
  setWsStatus: (s: 'connecting' | 'open' | 'closed') => void
  // Optimistic update: flip cmd on a single component
  setComponentCmd: (id: string, on: boolean) => void
  // SIM-ONLY comms-drop test toggle
  setSimCommDrop: (on: boolean) => void
}

export const useControlStore = create<StoreState>((set) => ({
  dryer: DEFAULT_STATE,
  wsStatus: 'connecting',
  lastUpdate: 0,
  simCommDrop: false,

  setDryerState: (state) =>
    set((prev) => {
      // SIM comms-drop test: ignore fresh frames so the frame age climbs and the
      // comms-loss overlay / staleness UI engages exactly as it would on a real
      // PLC link loss. Releasing the toggle lets the next frame back in.
      if (prev.simCommDrop) return {}
      return { dryer: state, lastUpdate: Date.now() }
    }),

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

  setSimCommDrop: (on) => set({ simCommDrop: on }),
}))
