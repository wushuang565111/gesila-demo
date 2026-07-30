import React, { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

export function WaveformPlayer({ player, seed, styleName, compact }) {
  const { loading, playing, progress, duration, peaks, play, pause } = player

  const fmt = s => {
    if (!s) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className={'player ' + (compact ? 'player-compact' : '')}>
      <button
        className="play-btn"
        onClick={() => (playing ? pause() : play(seed, styleName))}
        disabled={loading}
        aria-label={playing ? '暂停' : '播放'}
      >
        {loading ? <span className="spinner" /> : playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="wave-wrap">
        <div className="wave">
          {(peaks.length ? peaks : new Array(60).fill(0.15)).map((p, i) => {
            const active = i / (peaks.length || 60) <= progress
            return (
              <span
                key={i}
                className={'bar ' + (active ? 'bar-on' : '')}
                style={{ height: `${Math.max(8, p * 100)}%` }}
              />
            )
          })}
        </div>
        <div className="time-row">
          <span>{fmt(progress * duration)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
    </div>
  )
}

export function QRBox({ text, size = 168 }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    if (canvasRef.current && text) {
      QRCode.toCanvas(canvasRef.current, text, {
        width: size,
        margin: 1,
        color: { dark: '#12121a', light: '#ffffff' }
      }).catch(() => {})
    }
  }, [text, size])
  return <canvas ref={canvasRef} className="qr" width={size} height={size} />
}

function PlayIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
}
function PauseIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
}
