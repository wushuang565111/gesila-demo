// 确定性音频合成引擎：同一 seed 永远生成同一段音乐
// 这样分享只需传 seed+参数，对方端本地重合成即可听到相同 demo，无需后端存音频

// ---- 伪随机数（可复现）----
export function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashStringToSeed(str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

// ---- 曲风预设 ----
export const STYLES = {
  '流行 Pop': { bpm: 96, bpmSpread: 8, waveA: 'triangle', waveB: 'sawtooth', scale: 'major', reverb: 0.25, drum: 'pop', rhythm: 'medium' },
  '抒情 Ballad': { bpm: 72, bpmSpread: 6, waveA: 'sine', waveB: 'triangle', scale: 'major', reverb: 0.4, drum: 'soft', rhythm: 'sparse' },
  '电子 EDM': { bpm: 124, bpmSpread: 5, waveA: 'sawtooth', waveB: 'square', scale: 'minor', reverb: 0.15, drum: 'edm', rhythm: 'driving' },
  '中国风 Guofeng': { bpm: 84, bpmSpread: 7, waveA: 'sine', waveB: 'triangle', scale: 'penta', reverb: 0.35, drum: 'soft', rhythm: 'ornamented' },
  'R&B Soul': { bpm: 90, bpmSpread: 7, waveA: 'sine', waveB: 'sawtooth', scale: 'minor', reverb: 0.3, drum: 'pop', rhythm: 'syncopated' },
  '摇滚 Rock': { bpm: 128, bpmSpread: 8, waveA: 'sawtooth', waveB: 'square', scale: 'minor', reverb: 0.1, drum: 'rock', rhythm: 'driving' }
}
export const STYLE_NAMES = Object.keys(STYLES)

// 音名 -> 频率
const A4 = 440
function midiToFreq(m) { return A4 * Math.pow(2, (m - 69) / 12) }

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  penta: [0, 2, 4, 7, 9]
}

// 使用音阶级数表示和弦根音。不同调式使用独立的候选池。
const PROGRESSIONS = {
  major: [
    [0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 1, 4],
    [0, 2, 3, 4], [3, 4, 2, 5], [1, 4, 0, 5], [0, 4, 3, 3]
  ],
  minor: [
    [0, 5, 2, 6], [0, 3, 6, 2], [0, 6, 5, 6], [5, 6, 0, 0],
    [0, 2, 5, 4], [0, 4, 5, 3], [3, 6, 0, 5], [0, 5, 3, 4]
  ],
  penta: [
    [0, 3, 4, 3], [0, 2, 3, 1], [4, 3, 0, 2], [0, 1, 4, 0],
    [3, 4, 2, 0], [0, 4, 3, 2]
  ]
}

// 每项为 [起拍, 时值]，同一动机会在后四小节中做移位与节奏变奏。
const RHYTHMS = {
  sparse: [
    [[0, 1.5], [2, 0.75], [3, 0.8]],
    [[0, 0.75], [1, 1.5], [3, 0.75]],
    [[0.5, 0.5], [1, 1], [2.5, 1.25]]
  ],
  medium: [
    [[0, 0.75], [1, 0.45], [1.5, 0.45], [2.5, 0.45], [3, 0.8]],
    [[0, 0.45], [0.5, 0.45], [1.5, 0.8], [2.5, 0.45], [3, 0.8]],
    [[0.5, 0.45], [1, 0.8], [2, 0.45], [2.5, 0.45], [3.5, 0.4]]
  ],
  driving: [
    [[0, 0.4], [0.5, 0.4], [1, 0.4], [1.5, 0.4], [2, 0.4], [2.5, 0.4], [3, 0.4], [3.5, 0.4]],
    [[0, 0.7], [0.75, 0.2], [1, 0.7], [2, 0.7], [2.75, 0.2], [3, 0.7]],
    [[0, 0.4], [0.5, 0.4], [1.5, 0.4], [2, 0.4], [2.5, 0.4], [3.5, 0.4]]
  ],
  syncopated: [
    [[0, 0.45], [0.75, 0.7], [1.75, 0.45], [2.5, 0.7], [3.5, 0.4]],
    [[0.5, 0.7], [1.5, 0.45], [2, 0.7], [3.25, 0.6]],
    [[0, 0.7], [1.25, 0.45], [2, 0.45], [2.75, 0.45], [3.5, 0.4]]
  ],
  ornamented: [
    [[0, 0.7], [1, 0.3], [1.5, 0.3], [2, 0.8], [3.25, 0.6]],
    [[0.5, 0.3], [0.75, 0.3], [1, 0.8], [2.5, 0.3], [2.75, 0.3], [3, 0.8]],
    [[0, 0.45], [0.5, 0.45], [1.5, 0.8], [2.75, 0.3], [3, 0.8]]
  ]
}

function degreeToSemitone(scale, degree) {
  const octave = Math.floor(degree / scale.length)
  const index = ((degree % scale.length) + scale.length) % scale.length
  return scale[index] + octave * 12
}

function buildMotif(rnd, scaleLength) {
  const motif = []
  let degree = Math.floor(rnd() * Math.min(5, scaleLength))
  for (let i = 0; i < 16; i++) {
    const step = [-2, -1, 0, 1, 1, 2][Math.floor(rnd() * 6)]
    degree = Math.max(0, Math.min(scaleLength + 3, degree + step))
    motif.push(degree)
  }
  return motif
}

// 根据 seed 生成一份乐曲结构（谱面）
export function buildComposition(seed, styleName) {
  const rnd = mulberry32(seed)
  const baseStyle = STYLES[styleName] || STYLES['流行 Pop']
  const bpmOffset = Math.round((rnd() * 2 - 1) * baseStyle.bpmSpread)
  const style = { ...baseStyle, bpm: baseStyle.bpm + bpmOffset }
  const scale = SCALES[style.scale]
  const rootMidi = 43 + Math.floor(rnd() * 12)
  const progressions = PROGRESSIONS[style.scale]
  const prog = progressions[Math.floor(rnd() * progressions.length)]
  const bars = 8
  const beatsPerBar = 4
  const secPerBeat = 60 / style.bpm
  const rhythmPool = RHYTHMS[style.rhythm] || RHYTHMS.medium
  const rhythmOffset = Math.floor(rnd() * rhythmPool.length)
  const motif = buildMotif(rnd, scale.length)
  const variationShift = rnd() > 0.5 ? 1 : -1

  // 前四小节建立动机，后四小节保留辨识度并做音高、节奏和收束变奏。
  const melody = []
  for (let bar = 0; bar < bars; bar++) {
    const degreeRoot = prog[bar % prog.length]
    const pattern = rhythmPool[(rhythmOffset + (bar % 4) + (bar >= 4 ? 1 : 0)) % rhythmPool.length]
    for (let i = 0; i < pattern.length; i++) {
      const [beat, beatDuration] = pattern[i]
      const motifIndex = (bar % 4) * 4 + i
      let degree = motif[motifIndex % motif.length]
      if (bar >= 4 && (i + bar) % 3 === 0) degree += variationShift
      if (rnd() < 0.28) degree = degreeRoot + [0, 2, 4][Math.floor(rnd() * 3)]
      if (bar === bars - 1 && i === pattern.length - 1) degree = 0
      degree = Math.max(0, Math.min(scale.length + 4, degree))
      const midi = rootMidi + 12 + degreeToSemitone(scale, degree)
      melody.push({
        time: (bar * beatsPerBar + beat) * secPerBeat,
        dur: beatDuration * secPerBeat * 0.92,
        freq: midiToFreq(midi),
        gain: i === 0 ? 0.18 : 0.13 + rnd() * 0.04
      })
    }
  }

  // 和弦垫底
  const chords = []
  for (let bar = 0; bar < bars; bar++) {
    const degreeRoot = prog[bar % prog.length]
    const triad = [0, 2, 4].map(step => degreeToSemitone(scale, degreeRoot + step))
    const inversion = (Math.floor(rnd() * 3) + bar) % 3
    for (let i = 0; i < inversion; i++) triad[i] += 12
    chords.push({
      time: bar * beatsPerBar * secPerBeat,
      dur: beatsPerBar * secPerBeat,
      freqs: triad.map(s => midiToFreq(rootMidi + s))
    })
  }

  const duration = bars * beatsPerBar * secPerBeat
  return { style, styleName, bpm: style.bpm, rootMidi, progression: prog, secPerBeat, bars, beatsPerBar, duration, melody, chords }
}

// ---- 离线渲染成 AudioBuffer（可播放/可导出 WAV）----
export async function renderToBuffer(comp) {
  const sampleRate = 44100
  const length = Math.ceil(comp.duration * sampleRate)
  const ctx = new OfflineAudioContext(2, length, sampleRate)

  const master = ctx.createGain()
  master.gain.value = 0.9
  const comp2 = ctx.createDynamicsCompressor()
  master.connect(comp2)
  comp2.connect(ctx.destination)

  // 简易混响（噪声脉冲卷积）
  const reverb = ctx.createConvolver()
  reverb.buffer = makeImpulse(ctx, 1.8, comp.style.reverb)
  const wet = ctx.createGain()
  wet.gain.value = comp.style.reverb
  reverb.connect(wet)
  wet.connect(master)

  // 和弦 pad
  comp.chords.forEach(ch => {
    ch.freqs.forEach(f => {
      const o = ctx.createOscillator()
      o.type = comp.style.waveA
      o.frequency.value = f
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, ch.time)
      g.gain.linearRampToValueAtTime(0.08, ch.time + 0.15)
      g.gain.linearRampToValueAtTime(0.05, ch.time + ch.dur * 0.7)
      g.gain.linearRampToValueAtTime(0.0001, ch.time + ch.dur)
      o.connect(g)
      g.connect(master)
      g.connect(reverb)
      o.start(ch.time)
      o.stop(ch.time + ch.dur)
    })
  })

  // 主旋律 lead
  comp.melody.forEach(n => {
    const o = ctx.createOscillator()
    o.type = comp.style.waveB
    o.frequency.value = n.freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, n.time)
    g.gain.linearRampToValueAtTime(n.gain || 0.16, n.time + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, n.time + n.dur)
    o.connect(g)
    g.connect(master)
    g.connect(reverb)
    o.start(n.time)
    o.stop(n.time + n.dur + 0.05)
  })

  // 鼓组
  renderDrums(ctx, comp, master)

  const buffer = await ctx.startRendering()
  return buffer
}

function renderDrums(ctx, comp, dest) {
  const secPerBeat = comp.secPerBeat
  const totalBeats = comp.bars * comp.beatsPerBar
  const pattern = comp.style.drum
  for (let b = 0; b < totalBeats; b++) {
    const t = b * secPerBeat
    const inBar = b % comp.beatsPerBar
    // kick
    if (pattern === 'edm' || inBar === 0 || inBar === 2) kick(ctx, dest, t)
    // snare backbeat
    if (inBar === 1 || inBar === 3) snare(ctx, dest, t)
    // hihat
    if (pattern !== 'soft') {
      hihat(ctx, dest, t)
      hihat(ctx, dest, t + secPerBeat / 2)
    }
  }
}

function kick(ctx, dest, t) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.frequency.setValueAtTime(150, t)
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  g.gain.setValueAtTime(0.9, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
  o.connect(g); g.connect(dest)
  o.start(t); o.stop(t + 0.2)
}

function snare(ctx, dest, t) {
  const noise = ctx.createBufferSource()
  noise.buffer = whiteNoise(ctx, 0.2)
  const bp = ctx.createBiquadFilter()
  bp.type = 'highpass'; bp.frequency.value = 1200
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.5, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
  noise.connect(bp); bp.connect(g); g.connect(dest)
  noise.start(t); noise.stop(t + 0.2)
}

function hihat(ctx, dest, t) {
  const noise = ctx.createBufferSource()
  noise.buffer = whiteNoise(ctx, 0.05)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'; hp.frequency.value = 7000
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.15, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
  noise.connect(hp); hp.connect(g); g.connect(dest)
  noise.start(t); noise.stop(t + 0.06)
}

function whiteNoise(ctx, dur) {
  const len = Math.ceil(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

function makeImpulse(ctx, dur, decay) {
  const len = Math.ceil(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c)
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5 + decay * 3)
    }
  }
  return buf
}

// ---- AudioBuffer -> WAV Blob（用于下载/分享兜底）----
export function bufferToWav(buffer) {
  const numCh = buffer.numberOfChannels
  const len = buffer.length * numCh * 2 + 44
  const ab = new ArrayBuffer(len)
  const view = new DataView(ab)
  const channels = []
  let offset = 0
  function writeStr(s) { for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i)) }
  function writeU32(v) { view.setUint32(offset, v, true); offset += 4 }
  function writeU16(v) { view.setUint16(offset, v, true); offset += 2 }

  writeStr('RIFF'); writeU32(len - 8); writeStr('WAVE')
  writeStr('fmt '); writeU32(16); writeU16(1); writeU16(numCh)
  writeU32(buffer.sampleRate); writeU32(buffer.sampleRate * numCh * 2)
  writeU16(numCh * 2); writeU16(16)
  writeStr('data'); writeU32(buffer.length * numCh * 2)

  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c))
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([ab], { type: 'audio/wav' })
}
