// Single component tile — whole-tile tap to toggle on/off.
// has_speed components: shows speed readout prominently; long-press (~500ms) opens speed modal.
// Sized for the FA1019 10.1" touch panel — big touch targets, large text.
//
// Licence lock: when `locked`, the tile may not START (toggle to ON / change speed),
// but STOP is always permitted (no-sabotage). Indicator-only tiles are unaffected.

import { useCallback, useRef, useState } from 'react'
import { Component } from '../types'
import { api } from '../api/client'
import { useControlStore } from '../store/controlStore'

interface ComponentTileProps {
  component: Component
  locked?: boolean
}

// ─── Speed Modal ─────────────────────────────────────────────────────────────

interface SpeedModalProps {
  label: string
  currentSpeed: number
  onSave: (value: number) => void
  onClose: () => void
}

const SpeedModal = ({ label, currentSpeed, onSave, onClose }: SpeedModalProps) => {
  const [value, setValue] = useState(Math.round(currentSpeed))

  const adjust = (delta: number) => {
    setValue((prev) => Math.max(0, Math.min(100, prev + delta)))
  }

  const handleSave = () => {
    onSave(value)
    onClose()
  }

  return (
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
          padding: '32px 36px',
          minWidth: '560px',
          maxWidth: '90vw',
          display: 'flex',
          flexDirection: 'column',
          gap: '28px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
        }}
      >
        {/* Title */}
        <div style={{
          fontSize: '26px',
          fontWeight: 700,
          color: '#f3f4f6',
          letterSpacing: '0.03em',
          borderBottom: '1px solid #1f2937',
          paddingBottom: '18px',
        }}>
          {label} — Speed
        </div>

        {/* +/- stepper */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span style={{
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#9ca3af',
          }}>
            Speed Setpoint
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* Minus large step */}
            <button
              onPointerDown={() => adjust(-10)}
              style={{
                width: '80px', height: '88px', fontSize: '22px', fontWeight: 700,
                background: '#1f2937', border: '2px solid #374151', borderRadius: '14px',
                color: '#f9fafb', cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                userSelect: 'none', touchAction: 'manipulation',
              }}
            >
              −10
            </button>

            {/* Minus 1 */}
            <button
              onPointerDown={() => adjust(-1)}
              style={{
                width: '80px', height: '88px', fontSize: '42px', fontWeight: 700,
                background: '#1f2937', border: '2px solid #374151', borderRadius: '14px',
                color: '#f9fafb', cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                userSelect: 'none', touchAction: 'manipulation',
              }}
            >
              −
            </button>

            {/* Value display */}
            <div style={{
              flex: 1, textAlign: 'center',
              fontFamily: 'monospace', fontSize: '72px', fontWeight: 900,
              color: '#f9fafb', fontVariantNumeric: 'tabular-nums', lineHeight: 1,
            }}>
              {value}
              <span style={{ fontSize: '32px', color: '#9ca3af', marginLeft: '6px', fontWeight: 700 }}>%</span>
            </div>

            {/* Plus 1 */}
            <button
              onPointerDown={() => adjust(1)}
              style={{
                width: '80px', height: '88px', fontSize: '42px', fontWeight: 700,
                background: '#1f2937', border: '2px solid #374151', borderRadius: '14px',
                color: '#f9fafb', cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                userSelect: 'none', touchAction: 'manipulation',
              }}
            >
              +
            </button>

            {/* Plus large step */}
            <button
              onPointerDown={() => adjust(10)}
              style={{
                width: '80px', height: '88px', fontSize: '22px', fontWeight: 700,
                background: '#1f2937', border: '2px solid #374151', borderRadius: '14px',
                color: '#f9fafb', cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                userSelect: 'none', touchAction: 'manipulation',
              }}
            >
              +10
            </button>
          </div>
        </div>

        {/* Save / Cancel */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1, height: '72px', fontSize: '22px', fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              background: '#064e3b', border: '2px solid #059669', borderRadius: '12px',
              color: '#6ee7b7', cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            Set Speed
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1, height: '72px', fontSize: '22px', fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              background: '#1f2937', border: '2px solid #374151', borderRadius: '12px',
              color: '#9ca3af', cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

const LONG_PRESS_MS = 500

export const ComponentTile = ({ component, locked = false }: ComponentTileProps) => {
  const setComponentCmd = useControlStore((s) => s.setComponentCmd)
  const { id, label, has_speed, manual, cmd, running, fault, speed_pct } = component

  const [speedModalOpen, setSpeedModalOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFiredRef = useRef(false)

  const handleToggle = useCallback(() => {
    const next = !cmd
    // Licence lock blocks STARTS only; STOP always allowed.
    if (locked && next) return
    setComponentCmd(id, next)
    api.sendCommand({ id, on: next }).catch(() => setComponentCmd(id, cmd))
  }, [id, cmd, locked, setComponentCmd])

  const handleSpeedSave = useCallback((value: number) => {
    api.sendSpeed({ id, value_pct: value }).catch(() => {})
  }, [id])

  // Pointer handlers — short tap = toggle, long press = speed modal (if has_speed)
  const onPointerDown = useCallback(() => {
    longFiredRef.current = false
    if (has_speed && manual) {
      timerRef.current = setTimeout(() => {
        longFiredRef.current = true
        if (!locked) setSpeedModalOpen(true)
      }, LONG_PRESS_MS)
    }
  }, [has_speed, manual, locked])

  const onPointerUp = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    // Only fire toggle if it was NOT a long press
    if (!longFiredRef.current && manual) {
      handleToggle()
    }
  }, [manual, handleToggle])

  const onPointerCancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    longFiredRef.current = false
  }, [])

  const startDisabled = locked && !cmd

  const borderColor = fault ? '#dc2626' : running ? '#059669' : cmd ? '#065f46' : '#1f2937'
  const cardBg = fault ? '#1a0505' : running ? '#0a1f0f' : '#111827'

  // Tile is interactive (tappable) for manual components
  const tileInteractive = manual
  const tileCursor = tileInteractive
    ? startDisabled
      ? 'not-allowed'
      : 'pointer'
    : 'default'

  return (
    <>
      <div
        onPointerDown={tileInteractive ? onPointerDown : undefined}
        onPointerUp={tileInteractive ? onPointerUp : undefined}
        onPointerLeave={tileInteractive ? onPointerCancel : undefined}
        onPointerCancel={tileInteractive ? onPointerCancel : undefined}
        style={{
          width: '600px',
          background: cardBg,
          border: `2px solid ${borderColor}`,
          borderRadius: '16px',
          padding: '24px 30px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxSizing: 'border-box',
          cursor: tileCursor,
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchAction: 'manipulation',
          opacity: startDisabled ? 0.55 : 1,
          transition: 'border-color 0.15s, background 0.15s',
        } as React.CSSProperties}
      >
        {/* Header: name left, indicators right */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ fontSize: '30px', fontWeight: 700, color: '#f3f4f6', lineHeight: 1.15 }}>
            {label}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            {startDisabled && (
              <span style={{
                fontSize: '15px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: '#f87171', userSelect: 'none',
              }}>
                LOCKED
              </span>
            )}
            {fault && (
              <span style={{
                fontSize: '16px', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase',
                background: '#dc2626', color: '#fee2e2', borderRadius: '6px', padding: '4px 10px',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}>FAULT</span>
            )}
            {/* Running LED */}
            <span
              style={{
                display: 'inline-block', width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                background: running ? '#4ade80' : '#374151',
                border: `2px solid ${running ? '#86efac' : '#4b5563'}`,
                boxShadow: running ? '0 0 10px rgba(74,222,128,0.8)' : 'none',
              }}
              title={running ? 'Running' : 'Stopped'}
            />
          </div>
        </div>

        {/* ON / OFF status badge */}
        {manual ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <span style={{
              fontSize: '44px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
              color: cmd ? '#6ee7b7' : '#6b7280', userSelect: 'none', lineHeight: 1,
              padding: '10px 28px', borderRadius: '14px',
              background: cmd ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.10)',
              border: `2px solid ${cmd ? '#059669' : '#374151'}`,
            }}>
              {cmd ? 'RUN' : 'STOP'}
            </span>
            {has_speed && !startDisabled && (
              <span style={{
                fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: '#4b5563', marginLeft: 'auto',
              }}>
                HOLD TO SET SPEED
              </span>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <span style={{
              fontSize: '40px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
              color: running ? '#34d399' : '#6b7280', userSelect: 'none', lineHeight: 1,
              padding: '14px 30px', borderRadius: '14px',
              background: running ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.10)',
              border: `2px solid ${running ? '#059669' : '#374151'}`,
            }}>
              {running ? 'ON' : 'OFF'}
            </span>
            <span style={{
              fontSize: '15px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: '#6b7280', userSelect: 'none',
            }}>
              Auto · indication only
            </span>
          </div>
        )}

        {/* Speed readout — VSD only, same visual weight as temp readouts */}
        {has_speed && (
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: '8px',
            borderTop: '1px solid #1f2937', paddingTop: '14px',
          }}>
            <span style={{
              fontFamily: 'monospace', fontSize: '72px', fontWeight: 900,
              color: running ? '#34d399' : '#6b7280',
              fontVariantNumeric: 'tabular-nums', lineHeight: 1,
            }}>
              {speed_pct.toFixed(0)}
            </span>
            <span style={{ fontSize: '34px', fontWeight: 700, color: '#4b5563' }}>%</span>
          </div>
        )}
      </div>

      {/* Speed modal — rendered into fixed position overlay */}
      {speedModalOpen && (
        <SpeedModal
          label={label}
          currentSpeed={speed_pct}
          onSave={handleSpeedSave}
          onClose={() => setSpeedModalOpen(false)}
        />
      )}
    </>
  )
}
