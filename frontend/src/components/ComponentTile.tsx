// Single component tile: label, running LED, big ON/OFF toggle switch, fault indicator.
// For has_speed components: chunky speed slider + actual/SP readout.
// Sized for the FA1019 10.1" touch panel — big touch targets, large text.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Component } from '../types'
import { api } from '../api/client'
import { useControlStore } from '../store/controlStore'

interface ComponentTileProps {
  component: Component
}

export const ComponentTile = ({ component }: ComponentTileProps) => {
  const setComponentCmd = useControlStore((s) => s.setComponentCmd)
  const { id, label, has_speed, cmd, running, fault, speed_pct } = component

  const [localSpeed, setLocalSpeed] = useState(speed_pct)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    if (!dragging.current) setLocalSpeed(speed_pct)
  }, [speed_pct])

  const handleToggle = useCallback(() => {
    const next = !cmd
    setComponentCmd(id, next)
    api.sendCommand({ id, on: next }).catch(() => setComponentCmd(id, cmd))
  }, [id, cmd, setComponentCmd])

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value)
      setLocalSpeed(val)
      dragging.current = true
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        dragging.current = false
        api.sendSpeed({ id, value_pct: val }).catch(() => {})
      }, 300)
    },
    [id]
  )

  const borderColor = fault ? '#dc2626' : running ? '#059669' : cmd ? '#065f46' : '#1f2937'
  const cardBg = fault ? '#1a0505' : '#111827'

  return (
    <div
      style={{
        width: '600px',
        background: cardBg,
        border: `2px solid ${borderColor}`,
        borderRadius: '16px',
        padding: '24px 30px',
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
        boxSizing: 'border-box',
      }}
    >
      {/* Header: name left, LED + fault badge right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <span style={{ fontSize: '30px', fontWeight: 700, color: '#f3f4f6', lineHeight: 1.15 }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          {fault && (
            <span style={{
              fontSize: '16px', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase',
              background: '#dc2626', color: '#fee2e2', borderRadius: '6px', padding: '4px 10px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}>FAULT</span>
          )}
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

      {/* Toggle switch row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
        <button
          onClick={handleToggle}
          aria-pressed={cmd}
          aria-label={`${label} ${cmd ? 'ON' : 'OFF'}`}
          className="hmi-toggle"
          data-on={cmd ? 'true' : 'false'}
        />
        <span style={{
          fontSize: '26px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: cmd ? '#6ee7b7' : '#6b7280', userSelect: 'none',
        }}>
          {cmd ? 'RUN' : 'STOP'}
        </span>
      </div>

      {/* Speed section — VSD only */}
      {has_speed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '16px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280' }}>
              Speed
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '28px', fontWeight: 700, color: '#e5e7eb' }}>
                {speed_pct.toFixed(1)}
                <span style={{ fontSize: '15px', color: '#6b7280', marginLeft: '4px' }}>% act</span>
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '24px', fontWeight: 700, color: '#34d399' }}>
                SP {localSpeed.toFixed(0)}%
              </span>
            </div>
          </div>
          <input
            type="range" min={0} max={100} step={1}
            value={localSpeed} onChange={handleSpeedChange}
            className="hmi-slider-slim"
            aria-label={`${label} speed setpoint`}
          />
        </div>
      )}
    </div>
  )
}
