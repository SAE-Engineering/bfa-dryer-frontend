// Single component tile — whole-tile tap to toggle on/off.
// has_speed components: shows speed readout in Hz; long-press (~500ms) opens speed modal.
// Sized for the FA1019 10.1" touch panel — big touch targets, large text.
//
// Speed is shown in Hz (1 dp).  The drive speed registers %MW40-44 are whole-Hz
// (0–50 on the AU grid), so the operator sets a whole number of Hz and the
// readout shows it to one decimal (e.g. "37.0 Hz").  The REST API still speaks
// 0–100 % (value_pct), so we convert Hz↔% at the modal boundary only.
//
// Commanded ≠ running (critic #2): the badge shows one derived state —
//   off · commanded(STARTING…) · running · faulted — instead of a green "RUN"
// the instant you tap (which used to lie about a blocked / not-yet-confirmed
// drive).  Fault overrides the label.
//
// Confirm-on-start (critic #6): high-consequence equipment (hot fan = heat
// source + burner enable, mill, conveyors) needs a two-step confirm before it
// will START.  STOP is always immediate and never gated.
//
// Licence lock: when `locked`, the tile may not START / change speed, but STOP
// is always permitted (no-sabotage). Indicator-only tiles are unaffected.

import { useCallback, useRef, useState } from 'react'
import { Component } from '../types'
import { api } from '../api/client'
import { useControlStore } from '../store/controlStore'

interface ComponentTileProps {
  component: Component
  locked?: boolean
}

// Drive speed-register ceiling (Hz). %MW40-44 are whole-Hz on the 50 Hz grid.
const MAX_HZ = 50
const pctToHz = (pct: number) => (pct * MAX_HZ) / 100
const hzToPct = (hz: number) => (hz / MAX_HZ) * 100

// High-consequence STARTS that require a two-step confirm (critic #6).
// The burner itself is automatic/indicator-only, so the heat-chain proxy is the
// Hot Fan (running it is what lets the burner fire); the mill and conveyors can
// drag/crush, so they confirm too.
const CONFIRM_START_IDS = new Set(['hot_fan', 'mill', 'disch_conv', 'load_conv'])

// ─── Speed Modal (Hz) ──────────────────────────────────────────────────────

interface SpeedModalProps {
  label: string
  currentHz: number
  onSave: (hz: number) => void
  onClose: () => void
}

const SpeedModal = ({ label, currentHz, onSave, onClose }: SpeedModalProps) => {
  const [value, setValue] = useState(Math.round(currentHz)) // whole-Hz setpoint

  const adjust = (delta: number) => {
    setValue((prev) => Math.max(0, Math.min(MAX_HZ, prev + delta)))
  }

  const handleSave = () => {
    onSave(value)
    onClose()
  }

  const stepBtn = (delta: number, big: boolean) => (
    <button
      onPointerDown={() => adjust(delta)}
      style={{
        width: '80px', height: '88px', fontSize: big ? '22px' : '42px', fontWeight: 700,
        background: '#1f2937', border: '2px solid #374151', borderRadius: '14px',
        color: '#f9fafb', cursor: 'pointer', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none', touchAction: 'manipulation',
      }}
    >
      {delta > 0 ? `+${big ? 5 : ''}` : `${big ? '−5' : '−'}`}
    </button>
  )

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#111827', border: '2px solid #374151', borderRadius: '18px',
          padding: '32px 36px', minWidth: '560px', maxWidth: '90vw',
          display: 'flex', flexDirection: 'column', gap: '28px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
        }}
      >
        <div style={{
          fontSize: '26px', fontWeight: 700, color: '#f3f4f6', letterSpacing: '0.03em',
          borderBottom: '1px solid #1f2937', paddingBottom: '18px',
        }}>
          {label} — Speed
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span style={{
            fontSize: '15px', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: '#9ca3af',
          }}>
            Speed Setpoint
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {stepBtn(-5, true)}
            {stepBtn(-1, false)}

            <div style={{
              flex: 1, textAlign: 'center', fontFamily: 'monospace',
              fontSize: '72px', fontWeight: 900, color: '#f9fafb',
              fontVariantNumeric: 'tabular-nums', lineHeight: 1,
            }}>
              {value.toFixed(1)}
              <span style={{ fontSize: '32px', color: '#9ca3af', marginLeft: '8px', fontWeight: 700 }}>Hz</span>
            </div>

            {stepBtn(1, false)}
            {stepBtn(5, true)}
          </div>
        </div>

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

// ─── Confirm-start Modal ─────────────────────────────────────────────────────

const ConfirmStartModal = ({ label, onConfirm, onClose }: {
  label: string; onConfirm: () => void; onClose: () => void
}) => (
  <div
    onClick={onClose}
    style={{
      position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.74)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: '#111827', border: '2px solid #b45309', borderRadius: '18px',
        padding: '34px 40px', minWidth: '520px', maxWidth: '90vw', textAlign: 'center',
        display: 'flex', flexDirection: 'column', gap: '26px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
      }}
    >
      <div style={{ fontSize: '30px', fontWeight: 800, color: '#fcd34d', letterSpacing: '0.02em' }}>
        Start {label}?
      </div>
      <div style={{ fontSize: '19px', color: '#d1d5db', lineHeight: 1.4 }}>
        This starts equipment with mechanical / heat consequences. Confirm you
        intend to start it.
      </div>
      <div style={{ display: 'flex', gap: '16px' }}>
        <button
          onClick={() => { onConfirm(); onClose() }}
          style={{
            flex: 1, height: '78px', fontSize: '24px', fontWeight: 800,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            background: '#7c2d12', border: '2px solid #ea580c', borderRadius: '12px',
            color: '#fed7aa', cursor: 'pointer', touchAction: 'manipulation',
          }}
        >
          ▶ Start
        </button>
        <button
          onClick={onClose}
          style={{
            flex: 1, height: '78px', fontSize: '24px', fontWeight: 800,
            letterSpacing: '0.05em', textTransform: 'uppercase',
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

// ─── Tile ─────────────────────────────────────────────────────────────────────

const LONG_PRESS_MS = 500

// Derived single state for a component — commanded ≠ running disambiguated.
type DrvState = 'off' | 'commanded' | 'running' | 'faulted'
function deriveState(cmd: boolean, running: boolean, fault: boolean): DrvState {
  if (fault) return 'faulted'
  if (running) return 'running'
  if (cmd) return 'commanded'
  return 'off'
}

export const ComponentTile = ({ component, locked = false }: ComponentTileProps) => {
  const setComponentCmd = useControlStore((s) => s.setComponentCmd)
  const { id, label, has_speed, manual, cmd, running, fault, speed_pct } = component

  const [speedModalOpen, setSpeedModalOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFiredRef = useRef(false)

  const state = deriveState(cmd, running, fault)
  const hz = pctToHz(speed_pct)

  const doStart = useCallback(() => {
    setComponentCmd(id, true)
    api.sendCommand({ id, on: true }).catch(() => setComponentCmd(id, false))
  }, [id, setComponentCmd])

  const doStop = useCallback(() => {
    setComponentCmd(id, false)
    api.sendCommand({ id, on: false }).catch(() => setComponentCmd(id, true))
  }, [id, setComponentCmd])

  const handleToggle = useCallback(() => {
    if (cmd) { doStop(); return }            // turning OFF — always immediate
    if (locked) return                        // licence lock blocks STARTS only
    if (CONFIRM_START_IDS.has(id)) { setConfirmOpen(true); return }
    doStart()
  }, [id, cmd, locked, doStart, doStop])

  const handleSpeedSave = useCallback((newHz: number) => {
    api.sendSpeed({ id, value_pct: hzToPct(newHz) }).catch(() => {})
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
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (!longFiredRef.current && manual) handleToggle()
  }, [manual, handleToggle])

  const onPointerCancel = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    longFiredRef.current = false
  }, [])

  const startDisabled = locked && !cmd

  // Border / background follow the derived state (fault > running > commanded > off)
  const borderColor =
    state === 'faulted' ? '#dc2626'
    : state === 'running' ? '#059669'
    : state === 'commanded' ? '#d97706'
    : '#1f2937'
  const cardBg =
    state === 'faulted' ? '#1a0505'
    : state === 'running' ? '#0a1f0f'
    : state === 'commanded' ? '#1a0e00'
    : '#111827'

  const tileInteractive = manual
  const tileCursor = tileInteractive ? (startDisabled ? 'not-allowed' : 'pointer') : 'default'

  // Big status badge content for manual tiles, by derived state.
  const badge = {
    off:       { text: 'STOP',        fg: '#6b7280', bd: '#374151', bgc: 'rgba(107,114,128,0.10)', pulse: false },
    commanded: { text: 'STARTING…',   fg: '#fcd34d', bd: '#b45309', bgc: 'rgba(217,119,6,0.14)',   pulse: true  },
    running:   { text: 'RUNNING',     fg: '#6ee7b7', bd: '#059669', bgc: 'rgba(16,185,129,0.12)',  pulse: false },
    faulted:   { text: 'FAULT',       fg: '#fecaca', bd: '#dc2626', bgc: 'rgba(220,38,38,0.16)',   pulse: true  },
  }[state]

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
            {/* Running LED — green only on real running feedback */}
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

        {/* Status badge */}
        {manual ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <span style={{
              fontSize: state === 'commanded' ? '36px' : '44px', fontWeight: 800,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              color: badge.fg, userSelect: 'none', lineHeight: 1,
              padding: '10px 24px', borderRadius: '14px',
              background: badge.bgc, border: `2px solid ${badge.bd}`,
              animation: badge.pulse ? 'pulse 1.4s ease-in-out infinite' : undefined,
            }}>
              {badge.text}
            </span>
            {/* Sub-label: make "commanded but not yet running" explicit */}
            {state === 'commanded' && (
              <span style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: '#d97706' }}>
                commanded — not&nbsp;running
              </span>
            )}
            {has_speed && !startDisabled && state !== 'commanded' && (
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
              color: fault ? '#fecaca' : running ? '#34d399' : '#6b7280', userSelect: 'none', lineHeight: 1,
              padding: '14px 30px', borderRadius: '14px',
              background: fault ? 'rgba(220,38,38,0.16)' : running ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.10)',
              border: `2px solid ${fault ? '#dc2626' : running ? '#059669' : '#374151'}`,
              animation: fault ? 'pulse 1.4s ease-in-out infinite' : undefined,
            }}>
              {fault ? 'FAULT' : running ? 'ON' : 'OFF'}
            </span>
            <span style={{
              fontSize: '15px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: '#6b7280', userSelect: 'none',
            }}>
              Auto · indication only
            </span>
          </div>
        )}

        {/* Speed readout (Hz, 1 dp) — VSD only */}
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
              {hz.toFixed(1)}
            </span>
            <span style={{ fontSize: '34px', fontWeight: 700, color: '#4b5563' }}>Hz</span>
          </div>
        )}
      </div>

      {/* Speed modal */}
      {speedModalOpen && (
        <SpeedModal
          label={label}
          currentHz={hz}
          onSave={handleSpeedSave}
          onClose={() => setSpeedModalOpen(false)}
        />
      )}

      {/* Confirm-start modal (high-consequence equipment) */}
      {confirmOpen && (
        <ConfirmStartModal
          label={label}
          onConfirm={doStart}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </>
  )
}
