// Single component tile: label, ON/OFF toggle, running LED, fault indicator.
// For has_speed components: speed slider (debounced 300ms) + actual speed readout.

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

  // Sync slider when WS delivers a new actual speed (don't stomp while dragging)
  const dragging = useRef(false)
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

  const toggleBg = cmd
    ? 'bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-500'
    : 'bg-gray-700 hover:bg-gray-600 active:bg-gray-500'

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl p-4 border transition-colors ${
        fault
          ? 'border-red-600 bg-red-950'
          : cmd
          ? 'border-emerald-700 bg-gray-900'
          : 'border-gray-700 bg-gray-900'
      }`}
    >
      {/* Header row: label + running LED + fault badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-100 leading-tight">{label}</span>
        <div className="flex items-center gap-2 shrink-0">
          {fault && (
            <span className="px-1.5 py-0.5 rounded bg-red-600 text-red-100 text-xs font-bold uppercase tracking-wide animate-pulse">
              FAULT
            </span>
          )}
          {/* Running LED */}
          <span
            className={`inline-block w-4 h-4 rounded-full border ${
              running
                ? 'bg-green-400 border-green-300 shadow-[0_0_6px_rgba(74,222,128,0.7)]'
                : 'bg-gray-700 border-gray-600'
            }`}
            title={running ? 'Running' : 'Stopped'}
          />
        </div>
      </div>

      {/* ON/OFF toggle — big touch target */}
      <button
        onClick={handleToggle}
        className={`w-full py-4 rounded-lg font-bold text-lg tracking-wide transition-colors select-none touch-none ${toggleBg}`}
        aria-pressed={cmd}
        aria-label={`${label} ${cmd ? 'ON' : 'OFF'}`}
      >
        {cmd ? 'ON' : 'OFF'}
      </button>

      {/* Speed section — only for VSD components */}
      {has_speed && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Speed</span>
            <span className="font-mono text-sm text-gray-200 tabular-nums">
              {speed_pct.toFixed(1)}%
              <span className="text-gray-500 ml-1 text-xs">act</span>
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={localSpeed}
            onChange={handleSpeedChange}
            className="w-full h-8 accent-emerald-500 cursor-pointer touch-none"
            aria-label={`${label} speed setpoint`}
          />
          <div className="text-right font-mono text-xs text-emerald-400 tabular-nums">
            SP {localSpeed.toFixed(0)}%
          </div>
        </div>
      )}
    </div>
  )
}
