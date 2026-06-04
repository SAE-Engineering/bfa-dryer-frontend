import { create } from 'zustand'
import { DryerState, Component, Temps } from '../types'

// Default / null state shown while connecting
const DEFAULT_TEMPS: Temps = {
  hotfan_motor: 0,
  burner: 0,
  product1: 0,
  product2: 0,
  exhaust: 0,
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
