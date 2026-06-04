// Paged dashboard for the 10.1" FA1019 touch panel.
// Persistent: status bar (in App) + temperatures row (always visible).
// Below: segmented tabs — Heating / Feed / Discharge — each group on its OWN page.
// Cards are fixed-width, content-height, top-left aligned. Blank space is fine.
// Group mapping per HMI_CONTRACT.md.

import { useState } from 'react'
import { useControlStore } from '../store/controlStore'
import { TempPanel } from './TempPanel'
import { ComponentTile } from './ComponentTile'
import { Component } from '../types'

const PAGES: { key: string; title: string; ids: string[] }[] = [
  { key: 'heating', title: 'Heating', ids: ['hot_fan', 'burner', 'burner_high'] },
  { key: 'feed', title: 'Feed', ids: ['load_conv', 'spinner', 'agitator1', 'agitator2', 'trace_chain'] },
  { key: 'discharge', title: 'Discharge', ids: ['disch_agi', 'brush', 'disch_conv', 'mill', 'shaker'] },
]

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

  const page = PAGES.find((p) => p.key === active) ?? PAGES[0]
  const tiles = pick(dryer.components, page.ids)

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
          const count = pick(dryer.components, p.ids).filter((c) => c.running).length
          return (
            <button
              key={p.key}
              onClick={() => setActive(p.key)}
              className={`transition-all select-none touch-none font-semibold ${
                on
                  ? 'bg-gray-700 text-gray-100 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              style={{
                fontSize: '32px',
                padding: '18px 56px',
                borderRadius: '12px',
                border: on ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
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
            </button>
          )
        })}
      </div>

      {/* Component cards — VERTICAL flow: stack top→bottom, wrap into columns to the right */}
      <div
        className="flex flex-col flex-wrap content-start overflow-x-auto"
        style={{ gap: '22px', flex: '1 1 0', minHeight: 0 }}
      >
        {tiles.map((c) => (
          <ComponentTile key={c.id} component={c} />
        ))}
      </div>
      </div>
    </div>
  )
}
