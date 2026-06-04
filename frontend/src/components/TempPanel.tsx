// Temperature panel — 5 readouts in °C to 1 decimal.
// Colour cues: warm (>80°C) → amber, hot (>150°C) → red.

import { Temps } from '../types'

interface TempCardProps {
  label: string
  value: number
}

const TempCard = ({ label, value }: TempCardProps) => {
  let bgClass = 'bg-gray-800'
  let textClass = 'text-gray-100'
  let valueClass = 'text-white'

  if (value > 150) {
    bgClass = 'bg-red-950 border border-red-700'
    textClass = 'text-red-300'
    valueClass = 'text-red-200'
  } else if (value > 80) {
    bgClass = 'bg-amber-950 border border-amber-700'
    textClass = 'text-amber-300'
    valueClass = 'text-amber-200'
  }

  return (
    <div className={`${bgClass} rounded-lg px-4 py-3 flex flex-col gap-1`}>
      <span className={`text-xs font-medium uppercase tracking-wider ${textClass}`}>{label}</span>
      <span className={`text-3xl font-bold font-mono tabular-nums ${valueClass}`}>
        {value.toFixed(1)}
        <span className="text-lg font-normal ml-1">°C</span>
      </span>
    </div>
  )
}

interface TempPanelProps {
  temps: Temps
}

export const TempPanel = ({ temps }: TempPanelProps) => {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
        Temperatures
      </h2>
      <div className="grid grid-cols-5 gap-2">
        <TempCard label="Hot Fan motor" value={temps.hotfan_motor} />
        <TempCard label="Burner" value={temps.burner} />
        <TempCard label="Product 1" value={temps.product1} />
        <TempCard label="Product 2" value={temps.product2} />
        <TempCard label="Exhaust" value={temps.exhaust} />
      </div>
    </div>
  )
}
