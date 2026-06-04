// Temperature panel — 4 readouts in °C to 1 decimal.
// Fixed height set by Dashboard (120px). Values large enough to read across the room.
// Colour cues: warm (>80°C) → amber, hot (>150°C) → red.

import { Temps } from '../types'

interface TempCardProps {
  label: string
  value: number
}

const TempCard = ({ label, value }: TempCardProps) => {
  let borderColor = '#1f2937'    // gray-800
  let bgColor = '#111827'        // gray-900
  let labelColor = '#6b7280'     // gray-500
  let valueColor = '#f9fafb'     // gray-50
  let unitColor = '#9ca3af'      // gray-400

  if (value > 150) {
    borderColor = '#dc2626'      // red-600
    bgColor = '#1a0505'
    labelColor = '#fca5a5'       // red-300
    valueColor = '#fecaca'       // red-200
    unitColor = '#f87171'        // red-400
  } else if (value > 80) {
    borderColor = '#d97706'      // amber-600
    bgColor = '#1a0e00'
    labelColor = '#fcd34d'       // amber-300
    valueColor = '#fef3c7'       // amber-100
    unitColor = '#fbbf24'        // amber-400
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '10px',
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Label */}
      <span style={{
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: labelColor,
        lineHeight: 1,
      }}>
        {label}
      </span>

      {/* Value + unit */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginTop: 'auto' }}>
        <span style={{
          fontFamily: 'monospace',
          fontWeight: 900,
          fontSize: '38px',
          lineHeight: 1,
          color: valueColor,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value.toFixed(1)}
        </span>
        <span style={{
          fontWeight: 700,
          fontSize: '20px',
          color: unitColor,
        }}>
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
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#0d1117',
      borderRadius: '12px',
      border: '1px solid #1f2937',
      padding: '10px 14px',
      gap: '8px',
      boxSizing: 'border-box',
    }}>
      {/* Section label */}
      <div style={{
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#4b5563',
        flexShrink: 0,
      }}>
        Temperatures
      </div>

      {/* Four temp cards in a row */}
      <div style={{ display: 'flex', gap: '10px', flex: 1, minHeight: 0 }}>
        <TempCard label="Burner" value={temps.burner} />
        <TempCard label="Product 1" value={temps.product1} />
        <TempCard label="Product 2" value={temps.product2} />
        <TempCard label="Exhaust" value={temps.exhaust} />
      </div>
    </div>
  )
}
