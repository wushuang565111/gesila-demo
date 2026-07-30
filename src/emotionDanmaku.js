const EMOTION_PROFILES = {
  yearning: {
    label: '想念',
    tone: '轻声回望',
    color: '#a89cff',
    keywords: ['想', '念', '等', '梦', '回忆', '城市', '夜', '窗', '雨', '远方', '星', '月'],
    lines: [
      '太有画面感了！',
      '这句一出来就想起某个人',
      '好适合深夜听',
      '副歌真的很抓人',
      '听着听着就安静下来了'
    ]
  },
  healing: {
    label: '治愈',
    tone: '温柔安放',
    color: '#38d6b0',
    keywords: ['光', '风', '海', '晴', '温柔', '拥抱', '慢慢', '放下', '自由', '花', '春'],
    lines: [
      '好治愈！',
      '听完心里软软的',
      '这段好温柔啊',
      '太适合循环了',
      '有被安慰到'
    ]
  },
  lonely: {
    label: '孤独',
    tone: '冷色独白',
    color: '#62b6ff',
    keywords: ['孤独', '凌晨', '沉默', '一个人', '无人', '空', '冷', '失眠', '离开', '告别'],
    lines: [
      '太感人了！',
      '这一句有点想哭',
      '孤独感一下就出来了',
      '好戳心',
      '听到这里破防了'
    ]
  },
  excited: {
    label: '兴奋',
    tone: '高能上头',
    color: '#ffd166',
    keywords: ['跳', '燃', '热', '心跳', '奔跑', '夏日', '舞台', '飞', '自由', '闪耀', '派对'],
    lines: [
      '好有感染力！',
      '这个节奏太上头了',
      '副歌可以火！',
      '忍不住跟着晃',
      '这段舞台感很强'
    ]
  },
  determined: {
    label: '坚定',
    tone: '向前推进',
    color: '#ff875f',
    keywords: ['逆风', '不退', '勇敢', '冲', '破', '燃烧', '证明', '未来', '出发', '山河'],
    lines: [
      '好燃！',
      '这首很有力量',
      '听完想立刻出发',
      '副歌冲起来了',
      '这段很适合当主打'
    ]
  },
  romantic: {
    label: '浪漫',
    tone: '暧昧升温',
    color: '#f65c8f',
    keywords: ['爱', '心动', '拥抱', '吻', '靠近', '霓虹', '玫瑰', '甜', '浪漫', '晚风'],
    lines: [
      '好浪漫！',
      '这句太会了',
      '心动感来了',
      '有点甜但不腻',
      '很适合告白场景'
    ]
  }
}

const STYLE_HINTS = {
  '抒情 Ballad': 'lonely',
  '流行 Pop': 'healing',
  '电子 EDM': 'excited',
  '摇滚 Rock': 'determined',
  'R&B Soul': 'romantic',
  '中国风 Guofeng': 'yearning'
}

function scoreEmotion(text, styleName) {
  const scores = Object.fromEntries(Object.keys(EMOTION_PROFILES).map(key => [key, 0]))
  const haystack = `${text} ${styleName || ''}`.toLowerCase()

  Object.entries(EMOTION_PROFILES).forEach(([key, profile]) => {
    profile.keywords.forEach(keyword => {
      if (haystack.includes(keyword.toLowerCase())) scores[key] += 2
    })
  })

  const styleHint = STYLE_HINTS[styleName]
  if (styleHint) scores[styleHint] += 3

  return Object.entries(scores).sort((a, b) => b[1] - a[1])
}

function seededPick(list, seed, offset = 0) {
  const raw = String(seed || 'gesila')
  let hash = offset + 17
  for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) >>> 0
  return list[hash % list.length]
}

export function generateEmotionDanmaku({ title, lyrics, theme, styleName, seed, fullSong }) {
  const ranked = scoreEmotion(`${title || ''} ${theme || ''} ${lyrics || ''}`, styleName)
  const primaryKey = ranked[0]?.[0] || 'healing'
  const secondaryKey = ranked[1]?.[0] || 'yearning'
  const primary = EMOTION_PROFILES[primaryKey]
  const secondary = EMOTION_PROFILES[secondaryKey]
  const lyricLines = String(lyrics || '')
    .split(/\n+/)
    .map(line => line.replace(/\[[^\]]+\]/g, '').trim())
    .filter(line => line.length >= 4)

  const generated = [
    `AI 捕捉到主情绪：${primary.label}`,
    seededPick(primary.lines, seed, 1),
    seededPick(secondary.lines, seed, 2),
    theme ? `这个「${theme}」主题很打动人` : '情绪一下就进来了',
    styleName ? `${styleName} 这个方向很对味` : '这版很有记忆点',
    fullSong ? '人声一进来更有感觉了！' : '期待完整人声版',
    seededPick(primary.lines, seed, 3)
  ]

  lyricLines.slice(0, 3).forEach((line, index) => {
    generated.push(`「${line.slice(0, 18)}」这句好戳`)
  })

  const unique = [...new Set(generated)].slice(0, 10)
  return {
    emotion: {
      key: primaryKey,
      label: primary.label,
      tone: primary.tone,
      color: primary.color,
      secondary: secondary.label,
      confidence: Math.min(96, 68 + Math.max(0, ranked[0]?.[1] || 0) * 4)
    },
    bullets: unique.map((text, index) => ({
      id: `${primaryKey}-${index}-${String(seed || '').slice(0, 4)}`,
      text,
      lane: index % 4,
      delay: (index % 5) * 1.15,
      duration: 13 + (index % 4) * 1.4
    }))
  }
}
