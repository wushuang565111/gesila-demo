import { useRef, useState, useCallback, useEffect } from 'react'
import { buildComposition, renderToBuffer, bufferToWav } from './audioEngine.js'

// 管理某个 demo（seed+style）的播放
export function usePlayer() {
  const ctxRef = useRef(null)
  const bufferRef = useRef(null)
  const srcRef = useRef(null)
  const startAtRef = useRef(0)
  const offsetRef = useRef(0)
  const rafRef = useRef(0)
  const keyRef = useRef('')

  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [peaks, setPeaks] = useState([])

  const ensureCtx = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    return ctxRef.current
  }

  const prepare = useCallback(async (seed, styleName) => {
    const key = seed + '|' + styleName
    if (keyRef.current === key && bufferRef.current) return bufferRef.current
    setLoading(true)
    const comp = buildComposition(seed, styleName)
    const buf = await renderToBuffer(comp)
    bufferRef.current = buf
    keyRef.current = key
    setDuration(buf.duration)
    setPeaks(computePeaks(buf, 90))
    setLoading(false)
    return buf
  }, [])

  const stopInternal = () => {
    if (srcRef.current) {
      try { srcRef.current.stop() } catch {}
      srcRef.current.disconnect()
      srcRef.current = null
    }
    cancelAnimationFrame(rafRef.current)
  }

  const tick = () => {
    const ctx = ctxRef.current
    if (!ctx || !bufferRef.current) return
    const elapsed = offsetRef.current + (ctx.currentTime - startAtRef.current)
    const p = Math.min(elapsed / bufferRef.current.duration, 1)
    setProgress(p)
    if (p >= 1) {
      setPlaying(false)
      offsetRef.current = 0
      setProgress(0)
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const play = useCallback(async (seed, styleName) => {
    const ctx = ensureCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    await prepare(seed, styleName)
    stopInternal()
    const src = ctx.createBufferSource()
    src.buffer = bufferRef.current
    src.connect(ctx.destination)
    const off = offsetRef.current >= bufferRef.current.duration ? 0 : offsetRef.current
    offsetRef.current = off
    startAtRef.current = ctx.currentTime
    src.start(0, off)
    srcRef.current = src
    setPlaying(true)
    rafRef.current = requestAnimationFrame(tick)
    src.onended = () => {}
  }, [prepare])

  const pause = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx || !bufferRef.current) return
    offsetRef.current += ctx.currentTime - startAtRef.current
    stopInternal()
    setPlaying(false)
  }, [])

  const seek = useCallback((ratio) => {
    if (!bufferRef.current) return
    const wasPlaying = playing
    stopInternal()
    offsetRef.current = ratio * bufferRef.current.duration
    setProgress(ratio)
    if (wasPlaying) {
      const ctx = ctxRef.current
      const src = ctx.createBufferSource()
      src.buffer = bufferRef.current
      src.connect(ctx.destination)
      startAtRef.current = ctx.currentTime
      src.start(0, offsetRef.current)
      srcRef.current = src
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [playing])

  const exportWav = useCallback(async (seed, styleName, filename = 'demo.wav') => {
    await prepare(seed, styleName)
    const blob = bufferToWav(bufferRef.current)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [prepare])

  useEffect(() => () => stopInternal(), [])

  return { loading, playing, progress, duration, peaks, prepare, play, pause, seek, exportWav }
}

function computePeaks(buffer, n) {
  const data = buffer.getChannelData(0)
  const block = Math.floor(data.length / n)
  const peaks = []
  for (let i = 0; i < n; i++) {
    let max = 0
    for (let j = 0; j < block; j++) {
      const v = Math.abs(data[i * block + j] || 0)
      if (v > max) max = v
    }
    peaks.push(max)
  }
  const norm = Math.max(...peaks, 0.01)
  return peaks.map(p => p / norm)
}
