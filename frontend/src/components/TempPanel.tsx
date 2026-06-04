// Temperature panel — 5 readouts in °C to 1 decimal.
// Fills its row completely. Values are large enough to read from several metres.
// Colour cues: warm (>80°C) → amber, hot (>150°C) → red.

import { Temps } from '../types'

interface TempCardProps {
  label: string
  value: number
}

const TempCard = ({ label, value }: TempCardProps) => {
  let borderClass = 'border-gray-700'
  let bgClass = 'bg-gray-800'
  let labelClass = 'text-gray-400'
  let valueClass = 'text-gray-50'
  let unitClass = 'text-gray-400'

  if (value > 150) {
    borderClass = 'border-red-600'
    bgClass = 'bg-red-950'
    labelClass = 'text-red-300'
    valueClass = 'text-red-200'
    unitClass = 'text-red-400'
  } else if (value > 80) {
    borderClass = 'border-amber-600'
    bgClass = 'bg-amber-950'
    labelClass = 'text-amber-300'
    valueClass = 'text-amber-100'
    unitClass = 'text-amber-400'
  }

  return (
    <div
      className={`flex flex-col justify-between rounded-xl border-2 ${borderClass} ${bgClass} overflow-hidden`}
      style={{ padding: '1.2vh 1.2vw', height: '100%' }}
    >
      {/* Label */}
      <span
        className={`font-bold uppercase tracking-widest leading-tight ${labelClass}`}
        style={{ fontSize: 'clamp(14px, 1.3vh, 20px)' }}
      >
        {label}
      </span>

      {/* Value */}
      <div className="flex items-baseline gap-1 mt-auto">
        <span
          className={`font-black font-mono tabular-nums leading-none ${valueClass}`}
          style={{ fontSize: 'clamp(36px, 5.5vh, 72px)' }}
        >
          {value.toFixed(1)}
        </span>
        <span
          className={`font-bold ${unitClass}`}
          style={{ fontSize: 'clamp(18px, 2.5vh, 32px)' }}
        >
          °C
        </span>
      </div>
    </div>
  )
}

interface TempPanelProps {
  temps: Temps
}

export const TempPanel = ({ temps }: TempPanelProps) => {
  return (
    // Fills its container height entirely — flex children fill vertically
    <div className="h-full flex flex-col overflow-hidden bg-gray-900 rounded-xl border border-gray-700"
         style={{ padding: '1vh 1vw' }}>
      {/* Section label */}
      <div
        className="font-bold uppercase tracking-widest text-gray-500 shrink-0"
        style={{ fontSize: 'clamp(11px, 1.1vh, 15px)', marginBottom: '0.7vh' }}
      >
        Temperatures
      </div>

      {/* 5 cards in a row, each taking equal width, filling remaining height */}
      <div className="flex gap-x-[0.75vw] flex-1 min-h-0">
        <div className="flex-1 min-w-0">
          <TempCard label="Hot Fan Motor" value={temps.hotfan_motor} />
        </div>
        <div className="flex-1 min-w-0">
          <TempCard label="Burner" value={temps.burner} />
        </div>
        <div className="flex-1 min-w-0">
          <TempCard label="Product 1" value={temps.product1} />
        </div>
        <div className="flex-1 min-w-0">
          <TempCard label="Product 2" value={temps.product2} />
        </div>
        <div className="flex-1 min-w-0">
          <TempCard label="Exhaust" value={temps.exhaust} />
        </div>
      </div>
    </div>
  )
}
