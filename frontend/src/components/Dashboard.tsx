// Main dashboard: temperatures row + three component group columns.
// Fills the available height (100% of flex-1 main) — no vertical scroll.
// Row split: temps ~24%, components ~76%.
// Group mapping per HMI_CONTRACT.md:
//   Heating:   hot_fan, burner, burner_high
//   Feed:      load_conv, spinner, agitator1, agitator2, trace_chain
//   Discharge: disch_agi, brush, disch_conv, mill, shaker

import { useControlStore } from '../store/controlStore'
import { TempPanel } from './TempPanel'
import { ComponentGroup } from './ComponentGroup'
import { Component } from '../types'

const HEATING_IDS = ['hot_fan', 'burner', 'burner_high']
const FEED_IDS = ['load_conv', 'spinner', 'agitator1', 'agitator2', 'trace_chain']
const DISCHARGE_IDS = ['disch_agi', 'brush', 'disch_conv', 'mill', 'shaker']

function pick(components: Component[], ids: string[]): Component[] {
  return ids.flatMap((id) => {
    const c = components.find((x) => x.id === id)
    return c ? [c] : []
  })
}

export const Dashboard = () => {
  const dryer = useControlStore((s) => s.dryer)
  const wsStatus = useControlStore((s) => s.wsStatus)

  if (wsStatus !== 'open' || dryer.components.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-2xl font-semibold">
        {wsStatus === 'connecting' ? 'Connecting to backend…' : 'Waiting for state…'}
      </div>
    )
  }

  const heating = pick(dryer.components, HEATING_IDS)
  const feed = pick(dryer.components, FEED_IDS)
  const discharge = pick(dryer.components, DISCHARGE_IDS)

  return (
    // Fills the full available height, no overflow, no padding that would cause scroll
    <div className="flex flex-col h-full overflow-hidden" style={{ gap: '0.5vh', padding: '0.5vh 0.75vw' }}>

      {/* Row 1 — Temperatures: ~24% of available height */}
      <div style={{ flex: '0 0 23%', minHeight: 0 }}>
        <TempPanel temps={dryer.temps} />
      </div>

      {/* Row 2 — Component groups: fill rest */}
      <div className="flex gap-x-[0.75vw] overflow-hidden" style={{ flex: '1 1 0', minHeight: 0 }}>
        <div className="flex-1 min-w-0 min-h-0">
          <ComponentGroup title="Heating" components={heating} />
        </div>
        <div className="flex-1 min-w-0 min-h-0">
          <ComponentGroup title="Feed" components={feed} />
        </div>
        <div className="flex-1 min-w-0 min-h-0">
          <ComponentGroup title="Discharge" components={discharge} />
        </div>
      </div>

    </div>
  )
}
