// Group of component tiles with a section heading.

import { Component } from '../types'
import { ComponentTile } from './ComponentTile'

interface ComponentGroupProps {
  title: string
  components: Component[]
}

export const ComponentGroup = ({ title, components }: ComponentGroupProps) => {
  if (components.length === 0) return null

  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {components.map((c) => (
          <ComponentTile key={c.id} component={c} />
        ))}
      </div>
    </div>
  )
}
