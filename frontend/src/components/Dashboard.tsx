// Paged dashboard for the 10.1" FA1019 touch panel.
// Persistent: status bar (in App) + temperatures row (always visible).
// Below: big touch tabs — Heating / Feed / Discharge — each group on its OWN page,
// tiles laid out in a grid that fills the page (no scroll, no clipping).
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
  // up to 3 columns; rows auto-sized equal so tiles fill the page
  const cols = Math.min(3, Math.max(1, tiles.length === 4 ? 2 : tiles.length < 3 ? tiles.length : 3))

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ gap: '0.6vh', padding: '0.5vh 0.75vw' }}>
      {/* Temperatures — always visible */}
      <div style={{ flex: '0 0 20%', minHeight: 0 }}>
        <TempPanel temps={dryer.temps} />
      </div>

      {/* Page tabs — big touch targets */}
      <div className="flex shrink-0" style={{ gap: '0.6vw', height: 'clamp(54px, 8vh, 84px)' }}>
        {PAGES.map((p) => {
          const on = p.key === active
          const count = pick(dryer.components, p.ids).filter((c) => c.running).length
          return (
            <button
              key={p.key}
              onClick={() => setActive(p.key)}
              className={`flex-1 rounded-lg font-black tracking-wide transition-colors select-none touch-none border-2 ${
                on
                  ? 'bg-emerald-600 border-emerald-400 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}
              style={{ fontSize: 'clamp(18px, 2.4vh, 30px)' }}
              aria-pressed={on}
            >
              {p.title}
              <span
                className={`ml-2 font-mono ${on ? 'text-emerald-100' : 'text-emerald-400'}`}
                style={{ fontSize: 'clamp(13px, 1.6vh, 20px)' }}
              >
                {count}▶
              </span>
            </button>
          )
        })}
      </div>

      {/* Active group — grid fills the rest */}
      <div
        className="grid overflow-hidden"
        style={{
          flex: '1 1 0',
          minHeight: 0,
          gap: '0.8vh 0.8vw',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridAutoRows: 'minmax(0, 1fr)',
        }}
      >
        {tiles.map((c) => (
          <ComponentTile key={c.id} component={c} />
        ))}
      </div>
    </div>
  )
}
