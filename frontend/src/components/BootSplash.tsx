// BootSplash.tsx — Full-screen operator acceptance modal shown on every session start.
//
// Flow:
//   1. Show on mount (session-scoped — sessionStorage key prevents re-show on re-render).
//   2. Operator reads safety banner + licence agreement.
//   3. "?" button opens Terms-of-Trade / Privacy Policy panels (scrollable).
//   4. Tap anywhere OR tap the explicit Accept button → POST /api/acceptance → dismiss.
//
// TODO: Replace all PLACEHOLDER text with real wording supplied by Richard.

import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

const SESSION_KEY = 'bfd_hmi_accepted'

// ─── Inner panel: Terms + Privacy (scrollable) ───────────────────────────────

interface InfoPanelProps {
  onClose: () => void
}

const InfoPanel = ({ onClose }: InfoPanelProps) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 600,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
    onClick={onClose}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: '#0f172a',
        border: '2px solid #334155',
        borderRadius: '20px',
        padding: '36px 40px',
        maxWidth: '780px',
        width: '90vw',
        maxHeight: '80vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '28px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.9)',
      }}
    >
      {/* Terms of Trade */}
      <section>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#f1f5f9', marginBottom: '12px' }}>
          Terms of Trade
        </h2>
        {/* TODO: Richard — insert real Terms-of-Trade text here */}
        <p style={{ color: '#94a3b8', fontSize: '15px', lineHeight: 1.65 }}>
          [PLACEHOLDER — Terms of Trade to be supplied by SAE Engineering. This section will
          describe the terms under which the BFA Dryer HMI software and control system is
          supplied, operated, and maintained. Topics will include: scope of supply, liability
          limitations, intellectual property, service obligations, and governing law.]
        </p>
      </section>

      <hr style={{ borderColor: '#1e293b', margin: 0 }} />

      {/* Privacy Policy */}
      <section>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#f1f5f9', marginBottom: '12px' }}>
          Privacy Policy
        </h2>
        {/* TODO: Richard — insert real Privacy Policy text here */}
        <p style={{ color: '#94a3b8', fontSize: '15px', lineHeight: 1.65 }}>
          [PLACEHOLDER — Privacy Policy to be supplied by SAE Engineering. This section will
          describe what operational data is collected (timestamps, acceptance events, run logs),
          how it is stored (on-device JSONL logs), who has access, and how long it is retained.
          No personal data is collected beyond the machine identifier and session timestamps.]
        </p>
      </section>

      <button
        onClick={onClose}
        style={{
          alignSelf: 'flex-end',
          padding: '12px 36px',
          fontSize: '16px',
          fontWeight: 700,
          background: '#1e293b',
          border: '2px solid #334155',
          borderRadius: '10px',
          color: '#cbd5e1',
          cursor: 'pointer',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        Close
      </button>
    </div>
  </div>
)

// ─── Boot Splash ──────────────────────────────────────────────────────────────

interface BootSplashProps {
  onAccepted: () => void
}

export const BootSplash = ({ onAccepted }: BootSplashProps) => {
  const [showInfo, setShowInfo] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const acceptingRef = useRef(false)

  // Check session storage so accept survives React re-renders but not page reload
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === 'true') {
      onAccepted()
    }
  }, [onAccepted])

  const doAccept = async () => {
    if (acceptingRef.current) return
    acceptingRef.current = true
    setAccepting(true)

    try {
      await api.postAcceptance()
    } catch {
      // Non-fatal — acceptance logging failure should not block operator access.
      // The splash dismisses regardless.
    }

    sessionStorage.setItem(SESSION_KEY, 'true')
    onAccepted()
  }

  const handleBackdropTap = (e: React.MouseEvent) => {
    // Only fire if the tap is on the backdrop, not the card content
    if (e.target === e.currentTarget) {
      doAccept()
    }
  }

  return (
    <>
      {/* Full-screen backdrop */}
      <div
        onClick={handleBackdropTap}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 500,
          background: 'rgba(2,6,23,0.97)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'manipulation',
        }}
      >
        {/* Main card */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#0f172a',
            border: '2px solid #1e293b',
            borderRadius: '24px',
            padding: '48px 52px',
            maxWidth: '760px',
            width: '92vw',
            maxHeight: '90vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '32px',
            alignItems: 'center',
            boxShadow: '0 40px 100px rgba(0,0,0,0.95)',
            position: 'relative',
          }}
        >
          {/* "?" info button — top right corner */}
          <button
            onClick={() => setShowInfo(true)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: '#1e293b',
              border: '2px solid #334155',
              color: '#94a3b8',
              fontSize: '20px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'manipulation',
            }}
            aria-label="Terms of Trade and Privacy Policy"
          >
            ?
          </button>

          {/* SAE logo */}
          <img
            src="/sae-logo.png"
            alt="SAE Engineering"
            style={{
              height: '80px',
              width: 'auto',
              filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.6))',
            }}
          />

          {/* Safety banner */}
          <div
            style={{
              background: '#431407',
              border: '3px solid #ea580c',
              borderRadius: '14px',
              padding: '18px 28px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <span style={{ fontSize: '32px', flexShrink: 0 }}>⚠</span>
            <span style={{
              fontSize: '20px',
              fontWeight: 800,
              color: '#fed7aa',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              lineHeight: 1.3,
            }}>
              Only trained personnel may operate this machine
            </span>
          </div>

          {/* Licence / operating agreement body */}
          <div
            style={{
              background: '#0a1628',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              padding: '24px 28px',
              width: '100%',
              boxSizing: 'border-box',
              maxHeight: '220px',
              overflowY: 'auto',
            }}
          >
            {/* TODO: Richard — replace this PLACEHOLDER with the real operating agreement text */}
            <p style={{ color: '#94a3b8', fontSize: '15px', lineHeight: 1.7, margin: 0 }}>
              <strong style={{ color: '#e2e8f0' }}>Operating Agreement — PLACEHOLDER</strong>
              <br /><br />
              [TODO: Richard's real operating agreement / licence text goes here. This should
              cover: authorised use by trained personnel only, liability for equipment damage
              resulting from incorrect operation, prohibition on unauthorised modification of
              control parameters, emergency stop procedures, and any site-specific operating
              requirements for the BFA banana dryer.]
              <br /><br />
              By tapping ACCEPT you confirm that you have read and understood this agreement,
              that you are a trained operator authorised to operate this equipment, and that
              you accept the Terms of Trade and Privacy Policy (accessible via the ? button).
            </p>
          </div>

          {/* Accept button */}
          <button
            onClick={doAccept}
            disabled={accepting}
            style={{
              width: '100%',
              padding: '24px',
              fontSize: '22px',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: accepting ? '#1e293b' : '#064e3b',
              border: `3px solid ${accepting ? '#334155' : '#059669'}`,
              borderRadius: '14px',
              color: accepting ? '#475569' : '#6ee7b7',
              cursor: accepting ? 'not-allowed' : 'pointer',
              touchAction: 'manipulation',
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            }}
          >
            {accepting ? 'Accepting…' : 'Tap anywhere to ACCEPT and continue'}
          </button>

          <p style={{
            color: '#475569',
            fontSize: '13px',
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.5,
          }}>
            Tap the ? button for Terms of Trade and Privacy Policy.
            <br />
            Tapping anywhere outside this panel also accepts.
          </p>
        </div>
      </div>

      {/* Terms / Privacy panel */}
      {showInfo && <InfoPanel onClose={() => setShowInfo(false)} />}
    </>
  )
}
