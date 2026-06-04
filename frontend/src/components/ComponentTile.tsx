// Single component tile: label, ON/OFF toggle, running LED, fault indicator.
// For has_speed components: speed slider (debounced 300ms) + actual speed readout.
// Designed for Lilliput FA1019 1920×1200 @224 PPI — all touch targets ≥ 90×56 px.

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

  // Tile border colour: fault > running > commanded
  const tileBorder = fault
    ? 'border-red-600'
    : running
    ? 'border-emerald-600'
    : cmd
    ? 'border-emerald-800'
    : 'border-gray-700'

  const tileBg = fault ? 'bg-red-950' : 'bg-gray-900'

  // Toggle button colours
  const toggleBg = cmd
    ? 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 text-white'
    : 'bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-gray-200'

  return (
    <div
      className={`flex flex-col rounded-xl border-2 transition-colors h-full overflow-hidden ${tileBorder} ${tileBg}`}
      style={{ padding: '0.6vh 0.8vw', gap: '0.5vh' }}
    >
      {/* Header row: label + running LED + fault badge */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <span
          className="font-bold text-gray-100 leading-tight"
          style={{ fontSize: 'clamp(15px, 1.6vh, 22px)' }}
        >
          {label}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {fault && (
            <span
              className="rounded bg-red-600 text-red-100 font-black uppercase tracking-wide animate-pulse"
              style={{ fontSize: 'clamp(11px, 1.1vh, 14px)', padding: '2px 6px' }}
            >
              FAULT
            </span>
          )}
          {/* Running LED */}
          <span
            className={`inline-block rounded-full border-2 shrink-0 ${
              running
                ? 'bg-green-400 border-green-300 shadow-[0_0_8px_rgba(74,222,128,0.8)]'
                : 'bg-gray-700 border-gray-600'
            }`}
            style={{ width: 'clamp(14px, 1.6vh, 20px)', height: 'clamp(14px, 1.6vh, 20px)' }}
            title={running ? 'Running' : 'Stopped'}
          />
        </div>
      </div>

      {/* ON/OFF toggle — minimum 90×56 px hit area on 1920×1200 */}
      <button
        onClick={handleToggle}
        className={`w-full rounded-lg font-black tracking-widest transition-colors select-none touch-none ${toggleBg}`}
        style={{
          fontSize: 'clamp(18px, 2.2vh, 28px)',
          minHeight: '56px',
          flex: has_speed ? '0 0 auto' : '1 1 0',
        }}
        aria-pressed={cmd}
        aria-label={`${label} ${cmd ? 'ON' : 'OFF'}`}
      >
        {cmd ? 'ON' : 'OFF'}
      </button>

      {/* Speed section — only for VSD components */}
      {has_speed && (
        <div className="flex flex-col flex-1 min-h-0 justify-evenly" style={{ gap: '0.3vh' }}>
          {/* Readout row */}
          <div className="flex justify-between items-baseline shrink-0">
            <span
              className="font-bold uppercase tracking-widest text-gray-400"
              style={{ fontSize: 'clamp(11px, 1.1vh, 14px)' }}
            >
              Speed
            </span>
            <span
              className="font-mono font-bold tabular-nums text-gray-100"
              style={{ fontSize: 'clamp(14px, 1.6vh, 20px)' }}
            >
              {speed_pct.toFixed(1)}
              <span className="text-gray-500 ml-1" style={{ fontSize: 'clamp(11px, 1.1vh, 14px)' }}>
                % act
              </span>
            </span>
          </div>

          {/* Slider — track height 44px, thumb 44×44px */}
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={localSpeed}
            onChange={handleSpeedChange}
            className="w-full hmi-slider cursor-pointer touch-none"
            aria-label={`${label} speed setpoint`}
          />

          {/* Setpoint readout */}
          <div
            className="text-right font-mono font-bold tabular-nums text-emerald-400 shrink-0"
            style={{ fontSize: 'clamp(13px, 1.4vh, 18px)' }}
          >
            SP {localSpeed.toFixed(0)}%
          </div>
        </div>
      )}
    </div>
  )
}
