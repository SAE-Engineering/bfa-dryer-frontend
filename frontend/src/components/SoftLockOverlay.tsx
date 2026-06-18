// Soft-lockout = MAINTENANCE MODE. Same popup style as the e-stop, but it carries
// the only two controls allowed while locked out: Trace Chain (fixed 50 Hz, no
// speed control) and Hot Fan, each on/off. Everything else is forced off and held
// off (like the e-stop) until the soft-lockout switch is released.
//
// Shown whenever state.soft_lock is true.

import { useControlStore } from '../store/controlStore'
import { api } from '../api/client'
import { Component } from '../types'

export const SoftLockOverlay = () => {
  const dryer = useControlStore((s) => s.dryer)
  const setComponentCmd = useControlStore((s) => s.setComponentCmd)

  if (!dryer.soft_lock) return null

  const find = (id: string): Component | undefined => dryer.components.find((c) => c.id === id)
  const tc = find('trace_chain')
  const fan = find('hot_fan')

  const toggle = (id: string, on: boolean) => {
    setComponentCmd(id, on)
    api.sendCommand({ id, on }).catch(() => setComponentCmd(id, !on))
  }

  const ctrlBtn = (comp: Component | undefined, label: string, sub: string) => {
    if (!comp) return null
    const on = comp.running || comp.cmd
    const state = comp.running ? 'RUNNING' : comp.cmd ? 'STARTING…' : 'OFF'
    return (
      <button
        onClick={() => toggle(comp.id, !on)}
        style={{
          width: '320px', minHeight: '220px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px',
          background: comp.running ? '#0a1f0f' : comp.cmd ? '#1a0e00' : '#161b22',
          border: `3px solid ${comp.running ? '#059669' : comp.cmd ? '#d97706' : '#4b5563'}`,
          borderRadius: '18px', cursor: 'pointer', touchAction: 'manipulation', userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '30px', fontWeight: 800, color: '#f3f4f6' }}>{label}</span>
        <span style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' }}>{sub}</span>
        <span style={{
          fontSize: '40px', fontWeight: 900, letterSpacing: '0.05em',
          color: comp.running ? '#6ee7b7' : comp.cmd ? '#fcd34d' : '#6b7280',
        }}>{state}</span>
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 440,    // below e-stop (450) + main-off (500)
        background: 'rgba(26,14,0,0.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '24px', textAlign: 'center', padding: '40px',
      }}
    >
      <div style={{ fontSize: '90px', lineHeight: 1, animation: 'pulse 1.6s ease-in-out infinite' }}>🔒</div>
      <div style={{ fontSize: '52px', fontWeight: 900, letterSpacing: '0.05em', color: '#fde68a',
        textShadow: '0 0 22px rgba(245,158,11,0.5)' }}>
        SOFT&#8209;LOCKOUT
      </div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: '#fcd34d', maxWidth: '760px' }}>
        Maintenance mode — all drives, conveyors and the burner are locked out.
        Only the trace chain and hot fan can be run.
      </div>
      <div style={{ display: 'flex', gap: '26px', marginTop: '10px' }}>
        {ctrlBtn(tc, 'Trace Chain', '50 Hz · clean / clear')}
        {ctrlBtn(fan, 'Hot Fan', 'air / dry out')}
      </div>
      <div style={{ fontSize: '18px', color: '#9ca3af' }}>
        Release the soft-lockout switch to return to normal operation.
      </div>
    </div>
  )
}
