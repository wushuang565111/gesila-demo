import { loadSettings } from './store.js'

const MUSIC_TIMEOUT_MS = 180000

function hexToBlob(hex, type = 'audio/mpeg') {
  if (!hex || typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new Error('音乐接口返回的音频数据无效')
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    const value = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(value)) throw new Error('音乐接口返回的音频编码无效')
    bytes[i] = value
  }
  return new Blob([bytes], { type })
}

function buildInstrumentalPrompt({ styleName, theme }) {
  const parts = ['instrumental', styleName, 'backing track', theme, 'mood', 'clear melody line', 'professional arrangement', 'no vocals', 'no singing', '纯器乐伴奏']
  return parts.filter(Boolean).join(', ')
}

function buildMusicPrompt({ styleName, theme }) {
  const parts = [styleName, theme, '中文人声歌曲', '旋律清晰', '副歌有记忆点', '完整编曲']
  return parts.filter(Boolean).join(', ')
}

export async function generateFullSong({ lyrics, styleName, theme }) {
  const { musicApiKey, musicBaseUrl, musicModel } = loadSettings()
  if (!musicApiKey) throw new Error('未配置 MiniMax API Key')
  if (!lyrics?.trim()) throw new Error('当前版本没有可用于演唱的歌词')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MUSIC_TIMEOUT_MS)
  let response
  try {
    response = await fetch(`${musicBaseUrl.replace(/\/+$/, '')}/v1/music_generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${musicApiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: musicModel || 'music-3.0',
        prompt: buildMusicPrompt({ styleName, theme }),
        lyrics,
        audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' }
      })
    })
  } catch (error) {
    if (controller.signal.aborted) throw new Error('完整歌曲生成超时，请稍后重试')
    throw new Error(`无法连接音乐生成接口：${error.message}`)
  } finally {
    clearTimeout(timer)
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) throw new Error('MiniMax API Key 无效或未授权（401）')
    if (response.status === 429) throw new Error('音乐生成请求过于频繁，请稍后重试（429）')
    throw new Error(`音乐生成失败（${response.status}）：${data?.base_resp?.status_msg || '未知错误'}`)
  }
  if (data?.base_resp?.status_code !== 0 || !data?.data?.audio) {
    throw new Error(data?.base_resp?.status_msg || '音乐生成接口未返回音频')
  }

  return {
    blob: hexToBlob(data.data.audio),
    duration: data.extra_info?.music_duration || 0,
    provider: 'minimax',
    traceId: data.trace_id
  }
}

export async function generateInstrumental({ styleName, theme }) {
  const { musicApiKey, musicBaseUrl, musicModel } = loadSettings()
  if (!musicApiKey) throw new Error('未配置 MiniMax API Key')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MUSIC_TIMEOUT_MS)
  let response
  try {
    response = await fetch(`${musicBaseUrl.replace(/\/+$/, '')}/v1/music_generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${musicApiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: musicModel || 'music-3.0',
        prompt: buildInstrumentalPrompt({ styleName, theme }),
        instrumental: true,
        audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' }
      })
    })
  } catch (error) {
    if (controller.signal.aborted) throw new Error('伴奏生成超时，请稍后重试')
    throw new Error(`无法连接音乐生成接口：${error.message}`)
  } finally {
    clearTimeout(timer)
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) throw new Error('MiniMax API Key 无效或未授权（401）')
    if (response.status === 429) throw new Error('音乐生成请求过于频繁，请稍后重试（429）')
    throw new Error(`伴奏生成失败（${response.status}）：${data?.base_resp?.status_msg || '未知错误'}`)
  }
  if (data?.base_resp?.status_code !== 0 || !data?.data?.audio) {
    throw new Error(data?.base_resp?.status_msg || '伴奏生成接口未返回音频')
  }

  return {
    blob: hexToBlob(data.data.audio),
    duration: data.extra_info?.music_duration || 0,
    provider: 'minimax',
    traceId: data.trace_id
  }
}
