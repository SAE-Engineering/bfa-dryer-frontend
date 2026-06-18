// Paged dashboard for the 10.1" FA1019 touch panel.
// Persistent: status bar (in App) + temperatures row (always visible).
// Below: segmented tabs — Heating / Feed / Discharge — each group on its OWN page.
// Feed: tiles in defined order. Discharge: two-column layout.
// Group mapping per HMI_CONTRACT.md.

import { useState } from 'react'
import { useControlStore } from '../store/controlStore'
import { TempPanel } from './TempPanel'
import { ComponentTile } from './ComponentTile'
import { Component } from '../types'

const PAGES: { key: string; title: string; ids: string[] }[] = [
  { key: 'heating', title: 'Heating', ids: ['hot_fan', 'burner', 'burner_high'] },
  // Feed order: load_conv → spinner → trace_chain → agitator1 → agitator2
  { key: 'feed', title: 'Feed', ids: ['load_conv', 'spinner', 'trace_chain', 'agitator1', 'agitator2'] },
  // Discharge: col1 = disch_agi, disch_conv, brush; col2 = mill, shaker
  { key: 'discharge', title: 'Discharge', ids: ['disch_agi', 'disch_conv', 'brush', 'mill', 'shaker'] },
]

// Column split for Discharge page
const DISCHARGE_COL1 = ['disch_agi', 'disch_conv', 'brush']
const DISCHARGE_COL2 = ['mill', 'shaker']

function pick(components: Component[], ids: string[]): Component[] {
  return ids.flatMap((id) => {
    const c = components.find((x) => x.id === id)
    return c ? [c] : []
  })
}

export const Dashboard = () => {
  const dryer = useControlStore((s) => s.dryer)
  const wsStatus = useControlStore((s) => s.wsStatus)
  const [active, setActive] = useState('heating')

  if (wsStatus !== 'open' || dryer.components.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-2xl font-semibold">
        {wsStatus === 'connecting' ? 'Connecting to backend…' : 'Waiting for state…'}
      </div>
    )
  }

  const locked = dryer.license?.locked ?? false
  const page = PAGES.find((p) => p.key === active) ?? PAGES[0]
  const tiles = pick(dryer.components, page.ids)

  const isDischarge = active === 'discharge'

  return (
    <div className="flex h-full overflow-hidden" style={{ gap: '16px', padding: '12px 16px' }}>

      {/* Temperatures — wider vertical column down the left */}
      <div className="shrink-0 h-full" style={{ width: '560px' }}>
        <TempPanel temps={dryer.temps} setpoints={dryer.setpoints} />
      </div>

      {/* Right column: tabs + component cards */}
      <div className="flex flex-col" style={{ flex: '1 1 0', minHeight: 0, gap: '12px' }}>

        {/* Segmented tab control */}
        <div className="shrink-0 flex" style={{ gap: '4px', padding: '3px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)', width: 'fit-content' }}>
          {PAGES.map((p) => {
            const on = p.key === active
            const pageComps = pick(dryer.components, p.ids)
            const count = pageComps.filter((c) => c.running).length
            // Cross-tab fault annunciation (critic #4): faults on an inactive
            // page are otherwise invisible. Show a red count badge on the tab.
            const faultCount = pageComps.filter((c) => c.fault).length
            return (
              <button
                key={p.key}
                onClick={() => setActive(p.key)}
                className={`relative transition-all select-none touch-none font-semibold ${
                  on
                    ? 'bg-gray-700 text-gray-100 shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                style={{
                  fontSize: '32px',
                  padding: '18px 56px',
                  borderRadius: '12px',
                  border: faultCount > 0
                    ? '2px solid #ef4444'
                    : on ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                  minHeight: '88px',
                  letterSpacing: '0.02em',
                }}
                aria-pressed={on}
              >
                {p.title}
                {count > 0 && (
                  <span
                    className="ml-2 font-mono text-emerald-400"
                    style={{ fontSize: '24px' }}
                  >
                    {count}
                  </span>
                )}
                {faultCount > 0 && (
                  <span
                    className="absolute -top-2 -right-2 flex items-center justify-center rounded-full bg-red-600 text-white font-black animate-pulse shadow-lg"
                    style={{ minWidth: '34px', height: '34px', padding: '0 8px', fontSize: '20px', border: '2px solid #fecaca' }}
                    title={`${faultCount} fault${faultCount > 1 ? 's' : ''} on this page`}
                  >
                    ⚠{faultCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Component cards */}
        {isDischarge ? (
          // Discharge: two explicit columns
          <div
            className="flex overflow-auto"
            style={{ gap: '22px', flex: '1 1 0', minHeight: 0, alignItems: 'flex-start' }}
          >
            {/* Column 1: Discharge Agitator, Discharge Conveyor, Brush */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', flexShrink: 0 }}>
              {pick(dryer.components, DISCHARGE_COL1).map((c) => (
                <ComponentTile key={c.id} component={c} locked={locked} />
              ))}
            </div>
            {/* Column 2: Mill, Shaker */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', flexShrink: 0 }}>
              {pick(dryer.components, DISCHARGE_COL2).map((c) => (
                <ComponentTile key={c.id} component={c} locked={locked} />
              ))}
            </div>
          </div>
        ) : (
          // Heating / Feed: vertical flow, wraps into columns to the right
          <div
            className="flex flex-col flex-wrap content-start overflow-x-auto"
            style={{ gap: '22px', flex: '1 1 0', minHeight: 0 }}
          >
            {tiles.map((c) => (
              <ComponentTile key={c.id} component={c} locked={locked} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
