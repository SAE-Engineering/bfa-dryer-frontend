// PinModal.tsx — PIN pad modal for master PLC release.
//
// Used when the operator long-presses the SAE logo in the StatusBar.
// On correct PIN (default 8800) → POST /api/plc/release.
// After release: frontend auto-polls /api/plc/take every few seconds
// until PLC becomes available again (MEB has released it).

import { useCallback, useState } from 'react'
import { api } from '../api/client'

interface PinModalProps {
  onClose: () => void
  onReleased: () => void
}

export const PinModal = ({ onClose, onReleased }: PinModalProps) => {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const append = useCallback((d: string) => {
    setError('')
    setDigits((prev) => (prev.length < 8 ? prev + d : prev))
  }, [])

  const clear = useCallback(() => {
    setDigits('')
    setError('')
  }, [])

  const backspace = useCallback(() => {
    setDigits((prev) => prev.slice(0, -1))
    setError('')
  }, [])

  const submit = useCallback(async () => {
    if (!digits || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api.plcRelease(digits)
      if (result.ok) {
        onReleased()
        onClose()
      } else {
        setError('Release failed — try again')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('403')) {
        setError('Incorrect PIN')
      } else {
        setError('Connection error — try again')
      }
    } finally {
      setSubmitting(false)
    }
  }, [digits, submitting, onReleased, onClose])

  const PAD = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['CLR', '0', '⌫'],
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0,0,0,0.82)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0f172a',
          border: '2px solid #334155',
          borderRadius: '20px',
          padding: '36px 40px',
          minWidth: '380px',
          maxWidth: '90vw',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          alignItems: 'center',
          boxShadow: '0 28px 70px rgba(0,0,0,0.9)',
        }}
      >
        {/* Title */}
        <div style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '0.03em' }}>
          Master PLC Release
        </div>
        <div style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', lineHeight: 1.5 }}>
          Releasing the PLC allows MEB or other tools to connect.
          <br />
          The HMI will auto-resume when the PLC becomes free.
        </div>

        {/* PIN display */}
        <div style={{
          width: '100%',
          background: '#1e293b',
          border: `2px solid ${error ? '#dc2626' : '#334155'}`,
          borderRadius: '10px',
          padding: '14px 20px',
          textAlign: 'center',
          fontFamily: 'monospace',
          fontSize: '32px',
          fontWeight: 900,
          color: digits ? '#f8fafc' : '#475569',
          letterSpacing: '0.25em',
          minHeight: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
        }}>
          {digits ? '●'.repeat(digits.length) : '— — — —'}
        </div>

        {/* Error */}
        {error && (
          <div style={{ color: '#f87171', fontSize: '14px', fontWeight: 600, letterSpacing: '0.03em' }}>
            {error}
          </div>
        )}

        {/* Keypad */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          {PAD.map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: '10px' }}>
              {row.map((key) => {
                const isAction = key === 'CLR' || key === '⌫'
                return (
                  <button
                    key={key}
                    onPointerDown={() => {
                      if (key === 'CLR') clear()
                      else if (key === '⌫') backspace()
                      else append(key)
                    }}
                    style={{
                      flex: 1,
                      height: '72px',
                      fontSize: isAction ? '18px' : '28px',
                      fontWeight: 700,
                      background: isAction ? '#1e293b' : '#1e3a5f',
                      border: `2px solid ${isAction ? '#334155' : '#1d4ed8'}`,
                      borderRadius: '10px',
                      color: isAction ? '#94a3b8' : '#e2e8f0',
                      cursor: 'pointer',
                      userSelect: 'none',
                      touchAction: 'manipulation',
                      transition: 'background 0.1s',
                    }}
                  >
                    {key}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Submit / Cancel */}
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <button
            onClick={submit}
            disabled={!digits || submitting}
            style={{
              flex: 2,
              height: '64px',
              fontSize: '18px',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: (!digits || submitting) ? '#1e293b' : '#7c1d1d',
              border: `2px solid ${(!digits || submitting) ? '#334155' : '#dc2626'}`,
              borderRadius: '10px',
              color: (!digits || submitting) ? '#475569' : '#fca5a5',
              cursor: (!digits || submitting) ? 'not-allowed' : 'pointer',
              touchAction: 'manipulation',
            }}
          >
            {submitting ? 'Releasing…' : 'Release PLC'}
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              height: '64px',
              fontSize: '18px',
              fontWeight: 700,
              background: '#1e293b',
              border: '2px solid #334155',
              borderRadius: '10px',
              color: '#94a3b8',
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
