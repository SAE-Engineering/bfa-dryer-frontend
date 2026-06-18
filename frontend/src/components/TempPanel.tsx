// Temperature panel — 4 readouts in °C to 1 decimal.
// Values at 84px — readable across a workshop floor.
// Long-press (~550 ms) a card to open a setpoint modal.
// A quick tap does nothing so stray touches can't change setpoints.

import { useCallback, useRef, useState } from 'react'
import { Temps, Setpoints } from '../types'
import { api } from '../api/client'
import { useLinkHealth } from '../hooks/useLinkHealth'

// ─── Setpoint Modal ──────────────────────────────────────────────────────────

interface SetpointField {
  label: string
  key: string
  value: number
}

interface SetpointModalProps {
  title: string
  fields: SetpointField[]
  onSave: (updates: Record<string, number>) => void
  onClose: () => void
}

const SetpointModal = ({ title, fields, onSave, onClose }: SetpointModalProps) => {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.value]))
  )

  const adjust = (key: string, delta: number) => {
    setValues((prev) => ({ ...prev, [key]: Math.round((prev[key] + delta) * 10) / 10 }))
  }

  const handleSave = () => {
    onSave(values)
    onClose()
  }

  return (
    // Overlay — tap outside to cancel
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Modal panel — stop propagation so inner taps don't close */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#111827',
          border: '2px solid #374151',
          borderRadius: '18px',
          padding: '32px 36px',
          minWidth: '520px',
          maxWidth: '90vw',
          display: 'flex',
          flexDirection: 'column',
          gap: '28px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
        }}
      >
        {/* Modal title */}
        <div style={{
          fontSize: '26px',
          fontWeight: 700,
          color: '#f3f4f6',
          letterSpacing: '0.03em',
          borderBottom: '1px solid #1f2937',
          paddingBottom: '18px',
        }}>
          {title}
        </div>

        {/* Fields */}
        {fields.map((f) => (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{
              fontSize: '15px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#9ca3af',
            }}>
              {f.label}
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              {/* Minus */}
              <button
                onPointerDown={() => adjust(f.key, -1)}
                style={{
                  width: '88px',
                  height: '88px',
                  fontSize: '42px',
                  fontWeight: 700,
                  background: '#1f2937',
                  border: '2px solid #374151',
                  borderRadius: '14px',
                  color: '#f9fafb',
                  cursor: 'pointer',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  userSelect: 'none',
                  touchAction: 'manipulation',
                }}
              >
                −
              </button>

              {/* Value display */}
              <div style={{
                flex: 1,
                textAlign: 'center',
                fontFamily: 'monospace',
                fontSize: '56px',
                fontWeight: 900,
                color: '#f9fafb',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}>
                {values[f.key].toFixed(1)}
                <span style={{ fontSize: '26px', color: '#9ca3af', marginLeft: '6px', fontWeight: 700 }}>°C</span>
              </div>

              {/* Plus */}
              <button
                onPointerDown={() => adjust(f.key, 1)}
                style={{
                  width: '88px',
                  height: '88px',
                  fontSize: '42px',
                  fontWeight: 700,
                  background: '#1f2937',
                  border: '2px solid #374151',
                  borderRadius: '14px',
                  color: '#f9fafb',
                  cursor: 'pointer',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  userSelect: 'none',
                  touchAction: 'manipulation',
                }}
              >
                +
              </button>
            </div>
          </div>
        ))}

        {/* Save / Cancel */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              height: '72px',
              fontSize: '22px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: '#064e3b',
              border: '2px solid #059669',
              borderRadius: '12px',
              color: '#6ee7b7',
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            Save
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              height: '72px',
              fontSize: '22px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: '#1f2937',
              border: '2px solid #374151',
              borderRadius: '12px',
              color: '#9ca3af',
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Monitor-only tooltip ────────────────────────────────────────────────────

const MonitorOnlyNote = ({ onClose }: { onClose: () => void }) => (
  <div
    onClick={onClose}
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 200,
      background: 'rgba(0,0,0,0.72)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: '#111827',
        border: '2px solid #374151',
        borderRadius: '18px',
        padding: '36px 44px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      <span style={{ fontSize: '22px', fontWeight: 600, color: '#9ca3af' }}>
        Exhaust — monitor only
      </span>
      <span style={{ fontSize: '16px', color: '#6b7280' }}>No setpoint for this sensor.</span>
      <button
        onClick={onClose}
        style={{
          height: '64px',
          padding: '0 48px',
          fontSize: '20px',
          fontWeight: 700,
          background: '#1f2937',
          border: '2px solid #374151',
          borderRadius: '12px',
          color: '#9ca3af',
          cursor: 'pointer',
          touchAction: 'manipulation',
        }}
      >
        OK
      </button>
    </div>
  </div>
)

// ─── Individual temp card ────────────────────────────────────────────────────

type ModalKind = 'burner' | 'product' | 'exhaust' | null

interface TempCardProps {
  label: string
  value: number
  modalKind: ModalKind
  onLongPress: () => void
  unknown?: boolean
}

const LONG_PRESS_MS = 550

const TempCard = ({ label, value, modalKind, onLongPress, unknown = false }: TempCardProps) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  let borderColor = '#1f2937'
  let bgColor = '#111827'
  let labelColor = '#6b7280'
  let valueColor = '#f9fafb'
  let unitColor = '#9ca3af'

  if (unknown) {
    // State is stale / link lost — the reading is NOT trustworthy. Show neutral
    // grey and a "—" instead of a stale number that looks live (critic #1/#3).
    borderColor = '#4b5563'
    bgColor = '#0d1117'
    labelColor = '#6b7280'
    valueColor = '#6b7280'
    unitColor = '#4b5563'
  } else if (value > 150) {
    borderColor = '#dc2626'
    bgColor = '#1a0505'
    labelColor = '#fca5a5'
    valueColor = '#fecaca'
    unitColor = '#f87171'
  } else if (value > 80) {
    borderColor = '#d97706'
    bgColor = '#1a0e00'
    labelColor = '#fcd34d'
    valueColor = '#fef3c7'
    unitColor = '#fbbf24'
  }

  const startPress = useCallback(() => {
    firedRef.current = false
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      onLongPress()
    }, LONG_PRESS_MS)
  }, [onLongPress])

  const cancelPress = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const hasSetpoint = modalKind !== null && modalKind !== 'exhaust'

  return (
    <div
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
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
        cursor: hasSetpoint ? 'pointer' : 'default',
        userSelect: 'none',
        touchAction: 'none',
        WebkitUserSelect: 'none',
      } as React.CSSProperties}
    >
      {/* Label row with hint icon for settable cards */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: '18px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: labelColor,
          lineHeight: 1,
        }}>
          {label}
        </span>
        {hasSetpoint && (
          <span style={{
            fontSize: '11px',
            color: '#4b5563',
            letterSpacing: '0.06em',
            fontWeight: 600,
          }}>
            HOLD TO SET
          </span>
        )}
      </div>

      {/* Value + unit */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginTop: 'auto' }}>
        <span style={{
          fontFamily: 'monospace',
          fontWeight: 900,
          fontSize: '120px',
          lineHeight: 1,
          color: valueColor,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {unknown ? '—' : value.toFixed(1)}
        </span>
        <span style={{
          fontWeight: 700,
          fontSize: '46px',
          color: unitColor,
        }}>
          °C
        </span>
      </div>
    </div>
  )
}

// ─── Panel ───────────────────────────────────────────────────────────────────

interface TempPanelProps {
  temps: Temps
  setpoints: Setpoints
}

type OpenModal = { kind: 'burner' } | { kind: 'product' } | { kind: 'exhaust' } | null

export const TempPanel = ({ temps, setpoints }: TempPanelProps) => {
  const [openModal, setOpenModal] = useState<OpenModal>(null)
  const { unknown } = useLinkHealth()

  const handleSave = useCallback(
    async (updates: Record<string, number>) => {
      // Fire-and-forget — WS will reconcile the actual values within one poll cycle
      for (const [key, value_c] of Object.entries(updates)) {
        api.setSetpoint({ key, value_c }).catch(() => {})
      }
    },
    []
  )

  return (
    <>
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

        {/* Four temp cards stacked vertically */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0 }}>
          <TempCard
            label="Burner"
            value={temps.burner}
            modalKind="burner"
            unknown={unknown}
            onLongPress={() => setOpenModal({ kind: 'burner' })}
          />
          <TempCard
            label="Product 1"
            value={temps.product1}
            modalKind="product"
            unknown={unknown}
            onLongPress={() => setOpenModal({ kind: 'product' })}
          />
          <TempCard
            label="Product 2"
            value={temps.product2}
            modalKind="product"
            unknown={unknown}
            onLongPress={() => setOpenModal({ kind: 'product' })}
          />
          <TempCard
            label="Exhaust"
            value={temps.exhaust}
            modalKind="exhaust"
            unknown={unknown}
            onLongPress={() => setOpenModal({ kind: 'exhaust' })}
          />
        </div>
      </div>

      {/* Modals rendered into a portal-like position via fixed positioning */}
      {openModal?.kind === 'burner' && (
        <SetpointModal
          title="Burner Setpoints"
          fields={[
            { label: 'Burner target (°C)', key: 'burner_target', value: setpoints.burner_target },
            { label: 'Hysteresis band ± (°C)', key: 'burner_band', value: setpoints.burner_band },
          ]}
          onSave={handleSave}
          onClose={() => setOpenModal(null)}
        />
      )}

      {openModal?.kind === 'product' && (
        <SetpointModal
          title="Product Temperature Setpoint"
          fields={[
            { label: 'Product max — burner off (°C)', key: 'product_max', value: setpoints.product_max },
          ]}
          onSave={handleSave}
          onClose={() => setOpenModal(null)}
        />
      )}

      {openModal?.kind === 'exhaust' && (
        <MonitorOnlyNote onClose={() => setOpenModal(null)} />
      )}
    </>
  )
}
