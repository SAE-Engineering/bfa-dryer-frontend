// Group of component tiles with a section heading.
// Fills the available column height — tiles laid out vertically, evenly distributed.

import { Component } from '../types'
import { ComponentTile } from './ComponentTile'

interface ComponentGroupProps {
  title: string
  components: Component[]
}

export const ComponentGroup = ({ title, components }: ComponentGroupProps) => {
  if (components.length === 0) return null

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-900 rounded-xl border border-gray-700"
         style={{ padding: '1vh 1vw' }}>
      {/* Column header */}
      <h2
        className="font-black uppercase tracking-widest text-gray-300 shrink-0 border-b border-gray-700"
        style={{ fontSize: 'clamp(13px, 1.4vh, 20px)', paddingBottom: '0.6vh', marginBottom: '0.8vh' }}
      >
        {title}
      </h2>

      {/* Tiles: each tile gets an equal share of remaining column height */}
      <div
        className="flex flex-col flex-1 min-h-0"
        style={{ gap: '0.6vh' }}
      >
        {components.map((c) => (
          <div key={c.id} className="flex-1 min-h-0">
            <ComponentTile component={c} />
          </div>
        ))}
      </div>
    </div>
  )
}
