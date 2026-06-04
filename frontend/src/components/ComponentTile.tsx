// Single component tile: label, running LED, ON/OFF toggle switch, fault indicator.
// For has_speed components: slim speed slider + actual/SP readout.
// Cards are fixed-width, content-height — they do NOT stretch to fill the page.
// Touch targets: toggle track 72×36px, slider thumb 28px — adequate without being chunky.

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

  // Local slider state so the thumb moves immediately
  const [localSpeed, setLocalSpeed] = useState(speed_pct)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragging = useRef(false)

  // Sync slider when WS delivers a new actual speed (don't stomp while dragging)
  useEffect(() => {
    if (!dragging.current) {
      setLocalSpeed(speed_pct)
    }
  }, [speed_pct])

  const handleToggle = useCallback(() => {
    const next = !cmd
    setComponentCmd(id, next) // optimistic
    api.sendCommand({ id, on: next }).catch(() => {
      setComponentCmd(id, cmd) // revert on error
    })
  }, [id, cmd, setComponentCmd])

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value)
      setLocalSpeed(val)
      dragging.current = true
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        dragging.current = false
        api.sendSpeed({ id, value_pct: val }).catch(() => {
          // non-fatal; WS will reconcile
        })
      }, 300)
    },
    [id]
  )

  // Card border: fault > running > commanded > idle
  const borderColor = fault
    ? '#dc2626'   // red-600
    : running
    ? '#059669'   // emerald-600
    : cmd
    ? '#065f46'   // emerald-900 faint glow
    : '#1f2937'   // gray-800

  const cardBg = fault ? '#1a0505' : '#111827'  // red-950 tinted vs gray-900

  return (
    <div
      style={{
        width: '280px',
        background: cardBg,
        border: `1px solid ${borderColor}`,
        borderRadius: '12px',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxSizing: 'border-box',
        // height is content-driven — no min-h, no flex-grow
      }}
    >
      {/* Header: name left, LED + fault badge right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{
          fontSize: '16px',
          fontWeight: 700,
          color: '#f3f4f6',
          lineHeight: 1.2,
          letterSpacing: '0.01em',
        }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {fault && (
            <span style={{
              fontSize: '10px',
              fontWeight: 900,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: '#dc2626',
              color: '#fee2e2',
              borderRadius: '4px',
              padding: '2px 6px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              FAULT
            </span>
          )}
          {/* Running LED */}
          <span
            style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              flexShrink: 0,
              background: running ? '#4ade80' : '#374151',
              border: `1.5px solid ${running ? '#86efac' : '#4b5563'}`,
              boxShadow: running ? '0 0 6px rgba(74,222,128,0.7)' : 'none',
            }}
            title={running ? 'Running' : 'Stopped'}
          />
        </div>
      </div>

      {/* Toggle switch row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* The switch itself — clicking the whole row area toggles */}
        <button
          onClick={handleToggle}
          aria-pressed={cmd}
          aria-label={`${label} ${cmd ? 'ON' : 'OFF'}`}
          className="hmi-toggle"
          data-on={cmd ? 'true' : 'false'}
          style={{
            // no extra styles — all in CSS
          }}
        />
        <span style={{
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: cmd ? '#6ee7b7' : '#6b7280',
          userSelect: 'none',
        }}>
          {cmd ? 'RUN' : 'STOP'}
        </span>
      </div>

      {/* Speed section — only for VSD components */}
      {has_speed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Readout row: actual speed + setpoint */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280' }}>
              Speed
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: '#e5e7eb', tabularNums: true } as React.CSSProperties}>
                {speed_pct.toFixed(1)}
                <span style={{ fontSize: '10px', color: '#6b7280', marginLeft: '3px' }}>% act</span>
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#34d399' }}>
                SP {localSpeed.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Slim speed slider */}
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={localSpeed}
            onChange={handleSpeedChange}
            className="hmi-slider-slim"
            aria-label={`${label} speed setpoint`}
          />
        </div>
      )}
    </div>
  )
}
