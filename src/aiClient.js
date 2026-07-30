// 真 AI 写词客户端：调用 DeepSeek Chat Completions，让大模型真正读懂用户情感来写词。
// Key 从本地设置读取，绝不硬编码。失败时抛错，由上层降级到 mockAI 模板。
import { loadSettings } from './store.js'
import { STYLE_NAMES, hashStringToSeed } from './audioEngine.js'

const SYS_PROMPT = `你是一位顶尖的华语流行音乐作词人，擅长把零碎、口语化甚至模糊的灵感，转化为有画面感、有情感张力的中文歌词。
要求：
1. 深入理解用户输入里潜藏的情感、意象和故事，而不是堆砌辞藻。用户写到的具体人、事、物、场景，必须自然融入歌词。
2. 输出完整歌曲结构：主歌1、预副歌、副歌、主歌2、副歌、桥段、副歌、尾声。副歌要抓耳、可重复吟唱。
3. 语言凝练、有记忆点，避免陈词滥调和空洞口号。每段之间意境要递进，不要简单复制。
4. 根据指定曲风调整用词与节奏感（如电子偏律动、抒情偏细腻、摇滚偏张力、国风偏古典意象）。
5. 只输出 JSON，不要任何解释性文字或 markdown 代码块标记。`

function buildUserPrompt({ inspiration, style, hasAudio, fromImage }) {
  const styleLine = style && style !== '自动' ? style : '由你根据情感自行判断最合适的曲风'
  const src = []
  if (hasAudio) src.push('用户还哼唱了一段旋律（你收到的是文字描述，请据此推断情绪与节奏基调）')
  if (fromImage) src.push('灵感来自一张画面/图片的氛围描述')
  const srcLine = src.length ? `\n补充背景：${src.join('；')}。` : ''

  return `这是用户的原始灵感（请务必围绕它来写，让用户能认出这是"为他而写"）：
"""
${inspiration}
"""
指定曲风：${styleLine}。${srcLine}

请以严格 JSON 返回，字段如下（不要出现 JSON 以外的任何内容）：
{
  "title": "一个贴合情感的歌名（2-10字）",
  "theme": "用一个词概括情感主题（如 想念/热爱/城市/自由/温柔/孤独/治愈 等）",
  "style": "最终确定的曲风，必须是这些之一：${STYLE_NAMES.join('、')}",
  "lyrics": "完整歌词，用 \\n 换行，包含 [Verse 1] [Pre-Chorus] [Chorus] [Verse 2] [Chorus] [Bridge] [Chorus] [Outro] 段落标记"
}`
}

function normalizeStyle(s) {
  if (STYLE_NAMES.includes(s)) return s
  const t = (s || '')
  const hit = STYLE_NAMES.find(n => n.includes(t) || t.includes(n.split(' ')[0]))
  return hit || '流行 Pop'
}

function uniqueEmotionWords(words, used, index) {
  const fallbackWords = ['明亮', '隐忍', '澎湃', '释然', '失重', '温热', '锋利', '柔软', '辽阔', '微醺', '破碎', '新生']
  return (Array.isArray(words) ? words : [])
    .map(word => String(word || '').trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((word, wordIndex) => {
      if (!used.has(word)) {
        used.add(word)
        return word
      }
      const replacement = fallbackWords.find(item => !used.has(item)) || `${word}${index + wordIndex + 1}`
      used.add(replacement)
      return replacement
    })
}

const AI_TIMEOUT_MS = 45000

async function fetchWithTimeout(url, options = {}, timeoutMs = AI_TIMEOUT_MS) {
  const controller = new AbortController()
  const externalSignal = options.signal
  const abortFromCaller = () => controller.abort()
  externalSignal?.addEventListener('abort', abortFromCaller, { once: true })
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(externalSignal?.aborted ? 'AI 请求已取消' : 'AI 请求超时，请稍后重试')
    }
    throw error
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abortFromCaller)
  }
}

// 从模型返回文本里稳健提取 JSON
function extractJson(content) {
  if (!content) throw new Error('AI 返回为空')
  let txt = content.trim()
  txt = txt.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = txt.indexOf('{')
  const end = txt.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('AI 返回不含 JSON')
  return JSON.parse(txt.slice(start, end + 1))
}

// 主函数：调用 DeepSeek 写词，返回与 mockAI.generateDemoMeta 同结构的对象
export async function generateDemoMetaAI({ inspirationText, styleOverride, hasAudio, fromImage, nonce, signal }) {
  const { apiKey, baseUrl, model } = loadSettings()
  if (!apiKey) throw new Error('NO_API_KEY')

  const inspiration = inspirationText || '未命名灵感'
  const userPrompt = buildUserPrompt({ inspiration, style: styleOverride, hasAudio, fromImage })

  const resp = await fetchWithTimeout(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    signal,
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages: [
        { role: 'system', content: SYS_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: nonce ? 1.3 : 1.0,
      max_tokens: 1200,
      response_format: { type: 'json_object' }
    })
  })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    if (resp.status === 401) throw new Error('API Key 无效或未授权（401）')
    if (resp.status === 402) throw new Error('DeepSeek 账户余额不足（402）')
    if (resp.status === 429) throw new Error('请求过于频繁，请稍后再试（429）')
    throw new Error(`DeepSeek 调用失败（${resp.status}）：${errText.slice(0, 120)}`)
  }

  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content
  const obj = extractJson(content)

  const style = normalizeStyle(styleOverride && styleOverride !== '自动' ? styleOverride : obj.style)
  const seed = hashStringToSeed(inspiration + '|' + style + '|' + (obj.lyrics || '').slice(0, 40) + '|' + (nonce || ''))

  return {
    seed,
    style,
    styleName: style,
    lyrics: (obj.lyrics || '').trim(),
    theme: obj.theme || '灵感',
    title: obj.title || '未命名的旋律',
    source: 'ai'
  }
}

export async function generatePromptCandidatesAI({ inspirationText, styleOverride, signal }) {
  const { apiKey, baseUrl, model } = loadSettings()
  if (!apiKey) throw new Error('NO_API_KEY')
  const inspiration = inspirationText?.trim()
  if (!inspiration) return []
  const styleLine = styleOverride && styleOverride !== '自动' ? styleOverride : '不限定，由你自行扩展'

  const resp = await fetchWithTimeout(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    signal,
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `你是华语音乐创作策划，擅长从一个灵感词扩展出多角度歌曲 Prompt。只输出 JSON，不要 markdown。`
        },
        {
          role: 'user',
          content: `用户灵感词或短句：
"""
${inspiration}
"""
当前偏好曲风：${styleLine}

请生成 3 个彼此差异明显的歌曲创作 Prompt 候选，覆盖不同情绪、叙事视角、文风和表现手法。
要求：
1. 每个候选都必须紧扣用户输入，不要套用固定模板。
2. 每个候选给出 style、styleName、lens、emotions、references、promptText。
3. styleName 必须从这些曲风中选一个：${STYLE_NAMES.join('、')}。
4. 如果当前偏好曲风不是“不限定”，3 个候选都必须围绕该曲风生成，但情感理解、视角和文风要不同。
5. 三个候选的 emotions 数组里的每一个情绪词都不能重复，不能出现相同或近似词。
6. references 可以是“风格参考”而不是照抄对象；必须提醒不复刻旋律或歌词。
7. promptText 要可以直接用于后续歌词/歌曲生成，80-160 字。
8. lens 必须先提炼用户输入中的时间、地点、情绪或动作意象，再改写成自然的创作视角；不要把用户原句直接搬进 lens，尤其不要重复长句或口水词。比如输入“凌晨三点凌晨三点凌晨三点”，不要写“凌晨三点凌晨三点凌晨三点一起逃离人群”，要提炼成“深夜空街的出走”“天亮前重新出发”“未眠房间里的低声独白”。
9. lens 必须结合用户关键词和曲风命名，不能使用“失去后的独白”“追光的自我宣言”“亲密关系里的热与距离”等通用模板名。比如关键词“太阳”+“中国风 Guofeng”可以写“太阳落入长安旧梦”“借太阳问故人归期”“日轮照过旧山河”。
10. 三个 lens 之间不能重复或近似，且必须让用户一眼看出它们来自当前关键词但不是机械复读。

返回 JSON：
{
  "seed": "核心灵感词",
  "candidates": [
    {
      "style": "展示用风格名",
      "styleName": "曲风枚举",
      "lens": "创作视角",
      "emotions": ["情绪1", "情绪2", "情绪3", "情绪4"],
      "references": "风格参考",
      "promptText": "完整 Prompt"
    }
  ]
}`
        }
      ],
      temperature: 1.2,
      max_tokens: 1200,
      response_format: { type: 'json_object' }
    })
  }, 20000)

  if (!resp.ok) {
    if (resp.status === 401) throw new Error('API Key 无效或未授权（401）')
    if (resp.status === 402) throw new Error('DeepSeek 账户余额不足（402）')
    if (resp.status === 429) throw new Error('请求过于频繁，请稍后再试（429）')
    throw new Error(`DeepSeek 候选生成失败（${resp.status}）`)
  }

  const data = await resp.json()
  const obj = extractJson(data?.choices?.[0]?.message?.content)
  const seed = obj.seed || inspiration
  const usedEmotions = new Set()
  return (obj.candidates || []).slice(0, 3).map((item, index) => {
    const styleName = normalizeStyle(item.styleName || item.style)
    const emotions = uniqueEmotionWords(item.emotions, usedEmotions, index)
    return {
      id: `ai-${Date.now()}-${index}`,
      seed,
      style: item.style || styleName,
      styleName,
      lens: item.lens || '新的创作视角',
      emotions: emotions.length ? emotions : uniqueEmotionWords(['真实', '细腻', '有画面感'], usedEmotions, index),
      references: item.references || '由 AI 根据灵感自动生成',
      promptText: item.promptText || inspiration,
      source: 'ai'
    }
  })
}

// 轻量连通性测试：给设置弹窗的"测试连接"按钮用
export async function testConnection(settings) {
  const { apiKey, baseUrl, model } = settings
  if (!apiKey) throw new Error('请先填写 API Key')
  const resp = await fetchWithTimeout(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages: [{ role: 'user', content: '回复"ok"两个字即可' }],
      max_tokens: 10
    })
  }, 15000)
  if (!resp.ok) {
    if (resp.status === 401) throw new Error('Key 无效（401）')
    if (resp.status === 402) throw new Error('余额不足（402）')
    throw new Error(`连接失败（${resp.status}）`)
  }
  return true
}
