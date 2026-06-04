// Main dashboard: temperatures + three component groups.
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
      <div className="flex items-center justify-center h-64 text-gray-500 text-xl">
        {wsStatus === 'connecting' ? 'Connecting to backend…' : 'Waiting for state…'}
      </div>
    )
  }

  const heating = pick(dryer.components, HEATING_IDS)
  const feed = pick(dryer.components, FEED_IDS)
  const discharge = pick(dryer.components, DISCHARGE_IDS)

  return (
    <div className="flex flex-col gap-4">
      <TempPanel temps={dryer.temps} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ComponentGroup title="Heating" components={heating} />
        <ComponentGroup title="Feed" components={feed} />
        <ComponentGroup title="Discharge" components={discharge} />
      </div>
    </div>
  )
}
