import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { getRoute, navigate, loadProjects, saveProjects, uid, encodeShare, decodeShare, shareUrl, loadFeedback, addFeedback, loadSettings, saveSettings, hasApiKey, hasMusicApiKey, loadFolders, addFolder, renameFolder, removeFolder, setProjectFolder, loadUnsortedVisible, saveUnsortedVisible } from './store.js'
import { generateDemoMeta, STYLE_NAMES } from './mockAI.js'
import { generateDemoMetaAI, generatePromptCandidatesAI, testConnection } from './aiClient.js'
import { usePlayer } from './usePlayer.js'
import { useRecorder } from './useRecorder.js'
import { WaveformPlayer, QRBox } from './components.jsx'
import { generateFullSong, generateInstrumental } from './musicClient.js'
import { loadSongAudio, saveSongAudio, loadCoverImage, saveCoverImage, loadInstrumentalAudio, saveInstrumentalAudio } from './songStore.js'
import { generateCover, normalizeCoverFile } from './coverGenerator.js'
import { generateEmotionDanmaku } from './emotionDanmaku.js'

const STYLE_PROMPT_BLUEPRINTS = {
  '流行 Pop': {
    style: '流行叙事',
    references: '华语流行叙事歌、城市流行歌',
    crafts: ['用清晰主副歌结构推进情绪', '副歌保留一句容易跟唱的短句', '主歌写具体日常场景']
  },
  '抒情 Ballad': {
    style: '抒情慢歌',
    references: '钢琴抒情、细腻人声、深夜独白',
    crafts: ['用钢琴与低音长音铺底', '副歌克制但要有情绪坠落点', '尾声留出长呼吸感']
  },
  '电子 EDM': {
    style: '电子流行',
    references: '电子流行、舞台 Drop、合成器律动',
    crafts: ['用四拍推进制造上升感', '副歌设计短句重复和 Drop 入口', '桥段加入失重感独白']
  },
  '中国风 Guofeng': {
    style: '国风叙事',
    references: '五声音阶、笛箫、留白意象',
    crafts: ['把灵感词化为自然与命运意象', '主歌采用诗性画面', '副歌兼顾古典意象和现代情绪']
  },
  'R&B Soul': {
    style: 'R&B',
    references: 'R&B Soul、Lo-fi 鼓组、七和弦氛围',
    crafts: ['用七和弦和切分节奏制造暧昧', '歌词写触感、距离和呼吸', '副歌用假声或气声增强亲密感']
  },
  '摇滚 Rock': {
    style: '流行摇滚',
    references: '流行摇滚、强鼓点、吉他推进',
    crafts: ['用鼓点和电吉他积蓄能量', '副歌写成宣言式爆发', '桥段留一段低声自问再冲回副歌']
  }
}

const STYLE_THEME_DIRECTIONS = {
  '流行 Pop': [
    '{seed}照进日常的瞬间',
    '把{seed}唱成一句告白',
    '和{seed}一起逃离人群',
    '{seed}之后重新出发'
  ],
  '抒情 Ballad': [
    '{seed}落在旧伤口',
    '{seed}之后的沉默',
    '把{seed}留给昨晚',
    '关于{seed}的未寄出信'
  ],
  '电子 EDM': [
    '{seed}点亮夜场',
    '{seed}引爆心跳',
    '在{seed}里重启',
    '追着{seed}冲进光里'
  ],
  '中国风 Guofeng': [
    '{seed}入旧梦',
    '借{seed}写山河',
    '{seed}落在长街',
    '以{seed}问故人'
  ],
  'R&B Soul': [
    '{seed}贴近皮肤',
    '{seed}里的暧昧距离',
    '把{seed}唱得很慢',
    '{seed}停在呼吸之间'
  ],
  '摇滚 Rock': [
    '追着{seed}冲出去',
    '{seed}烧过废墟',
    '把{seed}喊成答案',
    '{seed}撞开黑夜'
  ]
}

const STYLE_EMOTION_POOLS = {
  '流行 Pop': [
    ['明亮', '心动', '轻盈', '期待'],
    ['酸涩', '温柔', '靠近', '怦然'],
    ['自由', '释然', '勇敢', '松弛'],
    ['新生', '笃定', '告别', '晴朗']
  ],
  '抒情 Ballad': [
    ['隐忍', '遗憾', '失眠', '空落'],
    ['想念', '脆弱', '克制', '缓慢'],
    ['低回', '疼痛', '留白', '不舍'],
    ['释怀', '安静', '潮湿', '柔软']
  ],
  '电子 EDM': [
    ['炽热', '兴奋', '失重', '闪烁'],
    ['爆发', '无畏', '速度', '眩晕'],
    ['重启', '跃动', '锋利', '未来感'],
    ['沸腾', '释放', '高亮', '冲刺']
  ],
  '中国风 Guofeng': [
    ['孤鸿', '余晖', '旧梦', '宿命'],
    ['清冷', '牵挂', '烟雨', '悠远'],
    ['离别', '风骨', '回望', '苍茫'],
    ['留白', '月色', '惆怅', '归途']
  ],
  'R&B Soul': [
    ['暧昧', '慵懒', '贴近', '微醺'],
    ['燥热', '试探', '潮湿', '私密'],
    ['松弛', '迷离', '低温', '拉扯'],
    ['亲密', '迟疑', '呼吸', '暗涌']
  ],
  '摇滚 Rock': [
    ['锋利', '倔强', '爆裂', '不服'],
    ['热血', '挣脱', '燃烧', '破局'],
    ['嘶喊', '反叛', '粗粝', '冲撞'],
    ['坚定', '逆风', '重生', '高亢']
  ]
}

const PROMPT_STOPWORDS = new Set([
  '以',
  '从',
  '一首',
  '主题',
  '核心',
  '核心意象',
  '核心种子',
  '情绪核心',
  '风格参考',
  '歌词',
  '中文歌',
  '创作',
  '用户',
  '灵感',
  '画面氛围',
  '图片灵感',
  '选中模板歌曲'
])

const STARTER_INSPIRATIONS = [
  '太阳',
  '凌晨三点',
  '雨后的窗',
  '海边告别',
  '旧照片',
  '逆风奔跑',
  '夏天的风',
  '没说出口的爱'
]

const SCENE_TEMPLATES = [
  {
    id: 'midnight-emotion',
    icon: '月',
    title: '深夜·情绪所',
    scene: '孤独、深沉、自省，适合深夜独自聆听的情绪向歌曲。',
    styleName: 'R&B Soul',
    prompt: '一首 R&B 风格的慢情歌，主题是城市里的孤独。歌词要有一盏路灯、末班地铁、雨后的街道等意象，Bridge 部分加入自白式说唱。',
    colors: ['#1b2440', '#7b6cf6', '#38d6b0'],
    samples: [
      ['末班车以后', 'R&B Soul', '城市孤独'],
      ['雨停在三点', '抒情 Ballad', '失眠想念'],
      ['路灯没睡', 'R&B Soul', '冷色独白'],
      ['无人认领的月光', '流行 Pop', '深夜自省']
    ]
  },
  {
    id: 'morning-heal',
    icon: '日',
    title: '晨曦·治愈系',
    scene: '温暖、舒缓、疗愈，适合清晨或放松时刻聆听的歌曲。',
    styleName: '流行 Pop',
    prompt: '一首温暖治愈的流行民谣，主题是与自己和解。歌词要有清晨阳光洒进房间的画面感，副歌重复一句鼓励自己的话，旋律简单但动人。',
    colors: ['#13332f', '#38d6b0', '#ffd166'],
    samples: [
      ['把窗打开', '流行 Pop', '自我和解'],
      ['今天会变好', '抒情 Ballad', '轻柔鼓励'],
      ['晨光便利店', '流行 Pop', '日常治愈'],
      ['慢慢醒来', 'R&B Soul', '柔软呼吸']
    ]
  },
  {
    id: 'energy-station',
    icon: '火',
    title: '燃动·能量站',
    scene: '热血、激昂、充满力量，适合运动、通勤或需要打气时聆听。',
    styleName: '电子 EDM',
    prompt: '一首电子摇滚风格的燃曲，主题是打破束缚。主歌低沉蓄力，副歌爆发高亢，歌词要有冲破、燃烧、重生等意象，节奏明快带动。',
    colors: ['#3b1827', '#f65c8f', '#ffd166'],
    samples: [
      ['冲出噪音', '电子 EDM', '破局重启'],
      ['再快一点', '摇滚 Rock', '通勤燃曲'],
      ['心跳过载', '电子 EDM', '舞台爆发'],
      ['逆风加速', '摇滚 Rock', '热血宣言']
    ]
  },
  {
    id: 'guofeng-landscape',
    icon: '莲',
    title: '国风·山水间',
    scene: '古韵、诗意、典雅，适合国风、古风类歌曲。',
    styleName: '中国风 Guofeng',
    prompt: '一首古风流行歌曲，主题是江南旧梦。歌词化用古诗词意象，要有烟雨、小桥、纸伞、青石板等元素，副歌加入戏腔吟唱，编曲以琵琶和古筝为主。',
    colors: ['#152838', '#62b6ff', '#38d6b0'],
    samples: [
      ['江南旧梦', '中国风 Guofeng', '烟雨离别'],
      ['纸伞下', '中国风 Guofeng', '古韵相思'],
      ['青石板月色', '抒情 Ballad', '诗意独白'],
      ['山河入梦', '中国风 Guofeng', '辽阔宿命']
    ]
  },
  {
    id: 'party-night',
    icon: '星',
    title: '派对·狂欢夜',
    scene: '欢快、活力、热闹，适合聚会、节日、舞曲类歌曲。',
    styleName: '电子 EDM',
    prompt: '一首 Funk/Disco 风格的复古舞曲，主题是周末释放。歌词充满邀请感与互动性，副歌简单上口适合跟唱，编曲要有跳跃贝斯线和铜管点缀。',
    colors: ['#27163f', '#7b6cf6', '#f65c8f'],
    samples: [
      ['周末解放', '电子 EDM', '复古舞曲'],
      ['别停下灯球', '流行 Pop', '派对邀请'],
      ['今晚多一点', 'R&B Soul', '律动暧昧'],
      ['人群发光', '电子 EDM', '热闹合唱']
    ]
  }
]

function getSceneTemplate(id) {
  return SCENE_TEMPLATES.find(item => item.id === id) || null
}

function getTemplateSongs(template) {
  const extras = [
    ['未命名清晨', template.styleName, '新鲜开场'],
    ['人群之外', template.styleName, '独处视角'],
    ['心事留白', template.styleName, '内心独白'],
    ['下一站见', template.styleName, '转场叙事']
  ]
  return [...template.samples, ...extras]
}

function getPromptSeed(raw) {
  const original = (raw || '').trim()
  if (!original) return ''

  const exactPatterns = [
    /以[「“"]([^」”"]{1,24})[」”"]为核心(?:意象|种子)?/,
    /灵感词[:：]\s*([^，。,.\n；;！!？?]{1,24})/,
    /核心种子[:：]\s*([^，。,.\n；;！!？?]{1,24})/,
    /选中模板歌曲[:：]?[《「“"]([^》」”"]{1,24})[》」”"]/
  ]
  for (const pattern of exactPatterns) {
    const hit = original.match(pattern)
    const value = hit?.[1]?.trim()
    if (value && !PROMPT_STOPWORDS.has(value)) return compactPromptSeed(value)
  }

  const cleaned = original
    .replace(/画面氛围[:：]?/g, ' ')
    .replace(/图片灵感[:：]?/g, ' ')
    .replace(/（含哼唱录音）/g, ' ')
    .replace(/以[「“"]?|[」”"]为核心(?:意象|种子)?/g, ' ')
    .replace(/从[「“"][^」”"]{1,30}[」”"]视角/g, ' ')
    .replace(/情绪核心[:：][^。.\n]*/g, ' ')
    .replace(/风格参考[:：][^。.\n]*/g, ' ')
    .replace(/只借鉴[^。.\n]*/g, ' ')
    .replace(/不复刻[^。.\n]*/g, ' ')
    .replace(/一首[^。.\n]{0,20}中文歌/g, ' ')
    .replace(/选中模板歌曲[:：]?[《「“"][^》」”"]+[》」”"]/g, ' ')
    .trim()
  const first = cleaned
    .split(/[\n，。,.\s、！!？?~～\-—:：;；"'“”‘’《》]+/)
    .map(word => compactPromptSeed(word.trim()))
    .find(word => word && word.length <= 24 && !PROMPT_STOPWORDS.has(word))
  return first || ''
}

function compactPromptSeed(seed) {
  const value = (seed || '').trim()
  if (!value) return ''
  for (let size = 2; size <= Math.min(8, Math.floor(value.length / 2)); size++) {
    const unit = value.slice(0, size)
    if (unit.repeat(Math.ceil(value.length / size)).slice(0, value.length) === value) return unit
  }
  const known = ['凌晨三点', '凌晨', '深夜', '雨后的窗', '雨后', '太阳', '海边', '旧照片', '逆风', '夏天', '告别', '想念', '城市', '月光']
  const hit = known.find(word => value.includes(word))
  if (hit) return hit
  return value.length > 10 ? value.slice(0, 8) : value
}

function pickVariant(list, nonce = 0, offset = 0) {
  return list[(Math.abs(nonce) + offset) % list.length]
}

function getPromptMotif(seed, rawText = '', nonce = 0) {
  const haystack = `${seed || ''} ${rawText || ''}`
  if (/凌晨|三点|深夜|夜/.test(haystack)) return pickVariant([
    { core: '深夜', scene: '空街', action: '未眠', turn: '天亮前' },
    { core: '凌晨三点', scene: '房间', action: '醒着', turn: '城市睡去后' },
    { core: '夜色', scene: '末班车', action: '独行', turn: '灯光熄灭前' },
    { core: '未眠', scene: '窗边', action: '等待', turn: '第一束光来时' }
  ], nonce)
  if (/雨|窗/.test(haystack)) return pickVariant([
    { core: '雨后', scene: '窗边', action: '回望', turn: '雨停后' },
    { core: '湿润街道', scene: '玻璃窗', action: '想起', turn: '水汽散开时' },
    { core: '落雨', scene: '屋檐下', action: '停留', turn: '伞收起来后' },
    { core: '窗外雨声', scene: '旧房间', action: '告别', turn: '天色变浅时' }
  ], nonce)
  if (/太阳|光|清晨/.test(haystack)) return pickVariant([
    { core: '晨光', scene: '日常', action: '醒来', turn: '照进来时' },
    { core: '太阳', scene: '屋顶', action: '抬头', turn: '云散开后' },
    { core: '热光', scene: '街角', action: '奔向', turn: '影子变短时' },
    { core: '清晨', scene: '窗台', action: '重新开始', turn: '第一口呼吸里' }
  ], nonce)
  if (/海|海边/.test(haystack)) return pickVariant([
    { core: '海风', scene: '岸边', action: '告别', turn: '潮声之后' },
    { core: '浪声', scene: '码头', action: '回头', turn: '船灯远去后' },
    { core: '海平线', scene: '黄昏', action: '放手', turn: '风停下来时' },
    { core: '盐味夏天', scene: '沙滩', action: '奔跑', turn: '浪花追上来前' }
  ], nonce)
  if (/旧照片|照片|回忆/.test(haystack)) return pickVariant([
    { core: '旧照', scene: '抽屉', action: '回放', turn: '翻开那刻' },
    { core: '泛黄相纸', scene: '书桌', action: '触碰', turn: '灰尘落下时' },
    { core: '旧影像', scene: '走廊', action: '停步', turn: '名字被想起后' },
    { core: '相册', scene: '午后', action: '沉默', turn: '光斑移动时' }
  ], nonce)
  if (/逆风|奔跑|冲/.test(haystack)) return pickVariant([
    { core: '逆风', scene: '路口', action: '冲出去', turn: '迎风那秒' },
    { core: '风口', scene: '旷野', action: '加速', turn: '喘息变热时' },
    { core: '反方向', scene: '人群边缘', action: '挣脱', turn: '回头之前' },
    { core: '奔跑', scene: '终点线外', action: '再出发', turn: '鞋带系紧后' },
    { core: '顶风', scene: '高架桥', action: '咬牙', turn: '灯牌亮起时' }
  ], nonce)
  return pickVariant([
    { core: seed || '此刻', scene: '日常', action: '转身', turn: '下一刻' },
    { core: seed || '心事', scene: '人群', action: '靠近', turn: '沉默之后' },
    { core: seed || '片刻', scene: '街角', action: '停留', turn: '风吹过时' },
    { core: seed || '答案', scene: '路上', action: '出发', turn: '抬头那秒' }
  ], nonce)
}

function buildFlexibleLens({ seed, styleName, index, nonce, rawText }) {
  const motif = getPromptMotif(seed, rawText, nonce + index)
  const templates = {
    '流行 Pop': [`${motif.core}${motif.scene}的日常切片`, `${motif.turn}重新出发`, `把${motif.action}唱成一句告白`, `${motif.scene}里的轻快转身`, `${motif.core}照进副歌里`],
    '抒情 Ballad': [`${motif.scene}里的低声独白`, `${motif.turn}没有说出口`, `${motif.core}落进旧心事`, `${motif.action}之后的空白`, `${motif.scene}尽头的慢镜头`],
    '电子 EDM': [`${motif.core}点亮节拍`, `${motif.action}之前的倒计时`, `${motif.turn}重启心跳`, `${motif.scene}里的高亮瞬间`, `${motif.core}推开合成器浪潮`],
    '中国风 Guofeng': [`借${motif.core}问归期`, `${motif.scene}落入旧梦`, `${motif.turn}一纸未寄信`, `${motif.action}写成山河回声`, `${motif.core}照过长街`],
    'R&B Soul': [`${motif.core}贴近呼吸`, `${motif.scene}里的暧昧距离`, `把${motif.action}唱得很慢`, `${motif.turn}的低温心跳`, `${motif.core}滑进夜色褶皱`],
    '摇滚 Rock': [`${motif.turn}撞开黑夜`, `${motif.core}烧过沉默`, `追着${motif.action}冲出去`, `${motif.scene}上的嘶喊`, `${motif.core}撕开旧规则`]
  }
  const pool = templates[styleName] || templates['流行 Pop']
  return pool[(index * 2 + nonce) % pool.length]
}

function buildPromptSummary(seed, rawText = '', nonce = 0) {
  const motif = getPromptMotif(seed, rawText, nonce)
  return `${motif.core} / ${motif.scene} / ${motif.action}`
}

function buildPromptCandidates({ text, imgHint, style, nonce = 0 }) {
  const rawPromptText = [text, imgHint].filter(Boolean).join(' ')
  const seed = getPromptSeed(rawPromptText)
  if (!seed) return []
  const selectedStyle = style === '自动' ? null : style
  const seedHash = Math.abs([...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0)) + nonce * 7
  const stylePlans = [
    [0, 2, 4],
    [1, 3, 5],
    [2, 5, 0],
    [3, 1, 4],
    [4, 0, 2],
    [5, 3, 1]
  ]
  const stylePlan = stylePlans[nonce % stylePlans.length]
  const styleNames = selectedStyle
    ? [selectedStyle, selectedStyle, selectedStyle]
    : stylePlan.map(offset => STYLE_NAMES[(seedHash + offset) % STYLE_NAMES.length])
  const usedEmotions = new Set()

  return styleNames.map((styleName, index) => {
    const blueprint = STYLE_PROMPT_BLUEPRINTS[styleName] || STYLE_PROMPT_BLUEPRINTS['流行 Pop']
    const emotionPool = STYLE_EMOTION_POOLS[styleName] || STYLE_EMOTION_POOLS['流行 Pop']
    const variantNonce = nonce * 3 + index
    const lens = buildFlexibleLens({ seed, styleName, index, nonce: variantNonce, rawText: rawPromptText })
    const summary = buildPromptSummary(seed, rawPromptText, variantNonce)
    const pool = emotionPool[(seedHash + index * 2 + nonce * 3) % emotionPool.length]
    const emotions = pool.map((word, wordIndex) => {
      if (!usedEmotions.has(word)) {
        usedEmotions.add(word)
        return word
      }
      const allWords = Object.values(STYLE_EMOTION_POOLS).flat(2)
      const fallback = allWords.find(item => !usedEmotions.has(item)) || `${word}${wordIndex + index + 1}`
      usedEmotions.add(fallback)
      return fallback
    })
    const craft = blueprint.crafts[(index + nonce) % blueprint.crafts.length]
    const promptText = `围绕用户输入中「${seed}」的意象和情绪线索，展开成「${lens}」这个创作视角，写一首${blueprint.style}中文歌。情绪底色：${emotions.join('、')}。风格参考：${blueprint.references}，只借鉴气质和编曲质感，不复刻旋律或歌词。${craft} 歌词要有具体场景、动作和一句可记住的副歌。`
    return {
      id: `local-${styleName}-${index}-${seed}-${nonce}`,
      seed,
      style: blueprint.style,
      styleName,
      lens,
      summary,
      emotions,
      references: blueprint.references,
      promptText,
      source: 'local'
    }
  })
}

// 统一生成入口：有 Key 走 DeepSeek，失败/无 Key 降级模板。返回 {meta, source, warn}
async function generateSmart(opts) {
  if (hasApiKey()) {
    try {
      const meta = await generateDemoMetaAI(opts)
      if (!meta.lyrics || meta.lyrics.length < 10) throw new Error('AI 歌词为空')
      return { meta, source: 'ai' }
    } catch (e) {
      if (e.message === 'NO_API_KEY') {
        const meta = generateDemoMeta(opts)
        return { meta: { ...meta, source: 'template' }, source: 'template' }
      }
      const meta = generateDemoMeta(opts)
      return { meta: { ...meta, source: 'template' }, source: 'template', warn: e.message }
    }
  }
  const meta = generateDemoMeta(opts)
  return { meta: { ...meta, source: 'template' }, source: 'template' }
}

export default function App() {
  const [route, setRoute] = useState(getRoute())
  useEffect(() => {
    const onHash = () => setRoute(getRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const { path, params } = route
  let page
  if (path === '/s') page = <SharePage token={params.get('t')} sid={params.get('sid')} />
  else if (path === '/create') page = <CreatePage />
  else if (path === '/songs') page = <AllSongsPage />
  else if (path.startsWith('/templates/')) page = <TemplateLibraryPage id={path.split('/')[2]} />
  else if (path.startsWith('/project/')) page = <ProjectPage id={path.split('/')[2]} />
  else page = <Workbench />

  return (
    <div className="app">
      <TopBar onShare={path === '/s'} />
      <div className="container">{page}</div>
      <footer className="foot">歌斯拉 GESILA · AI 词曲 demo 创作 · 本地旋律预览 / AI 完整歌曲</footer>
    </div>
  )
}

function TopBar({ onShare }) {
  const [showSettings, setShowSettings] = useState(false)
  const [aiOn, setAiOn] = useState(hasApiKey() || hasMusicApiKey())
  return (
    <header className="topbar">
      <div className="brand" onClick={() => !onShare && navigate('/')}>
        <span className="logo">♪</span>
        <span className="brand-name">歌斯拉</span>
        <span className="brand-sub">GESILA</span>
      </div>
      {!onShare && (
        <div className="topbar-actions">
          <button className="btn-ghost sm" onClick={() => window.openShare?.()}>🔗 分享页面</button>
          <button className="btn-ghost sm" onClick={() => setShowSettings(true)}>
            {aiOn ? '⚙️ AI 已接入' : '⚙️ AI 设置'}
          </button>
          <button className="btn-primary sm" onClick={() => navigate('/create')}>+ 新灵感</button>
        </div>
      )}
      {showSettings && <SettingsModal onClose={() => { setShowSettings(false); setAiOn(hasApiKey() || hasMusicApiKey()) }} />}
    </header>
  )
}

function SettingsModal({ onClose }) {
  const init = loadSettings()
  const [apiKey, setApiKey] = useState(init.apiKey)
  const [baseUrl, setBaseUrl] = useState(init.baseUrl)
  const [model, setModel] = useState(init.model)
  const [musicApiKey, setMusicApiKey] = useState(init.musicApiKey)
  const [musicBaseUrl, setMusicBaseUrl] = useState(init.musicBaseUrl)
  const [musicModel, setMusicModel] = useState(init.musicModel)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState(null) // {ok, text}

  const save = () => {
    saveSettings({
      apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim(),
      musicApiKey: musicApiKey.trim(), musicBaseUrl: musicBaseUrl.trim(), musicModel: musicModel.trim()
    })
    onClose()
  }
  const clear = () => {
    setApiKey(''); saveSettings({
      apiKey: '', baseUrl: baseUrl.trim(), model: model.trim(),
      musicApiKey: musicApiKey.trim(), musicBaseUrl: musicBaseUrl.trim(), musicModel: musicModel.trim()
    })
    setMsg({ ok: true, text: '已清除 DeepSeek Key，恢复模板模式' })
  }
  const test = async () => {
    setTesting(true); setMsg(null)
    try {
      await testConnection({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim() })
      setMsg({ ok: true, text: '连接成功，可以真 AI 写词了 🎉' })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally { setTesting(false) }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose}>×</button>
        <h2>AI 能力设置</h2>
        <p className="muted">API Key 仅保存在当前浏览器，用于调用对应的 AI 服务。</p>

        <h3 className="set-section-title">歌词创作 · DeepSeek</h3>

        <div className="set-field">
          <label>DeepSeek API Key</label>
          <input type="password" placeholder="sk-..." value={apiKey} onChange={e => setApiKey(e.target.value)} />
          <p className="hint">在 platform.deepseek.com → API Keys 创建。</p>
        </div>

        <div className="set-field">
          <label>接口地址 Base URL</label>
          <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
        </div>
        <div className="set-field">
          <label>模型</label>
          <div className="chips">
            {['deepseek-chat', 'deepseek-reasoner'].map(m => (
              <button key={m} className={'chip ' + (model === m ? 'chip-on' : '')} onClick={() => setModel(m)}>{m}</button>
            ))}
          </div>
        </div>

        <h3 className="set-section-title">完整歌曲 · MiniMax Music</h3>
        <div className="set-field">
          <label>MiniMax API Key</label>
          <input type="password" placeholder="MiniMax API Key" value={musicApiKey} onChange={e => setMusicApiKey(e.target.value)} />
        </div>
        <div className="set-field">
          <label>音乐接口 Base URL</label>
          <input type="text" value={musicBaseUrl} onChange={e => setMusicBaseUrl(e.target.value)} />
        </div>
        <div className="set-field">
          <label>音乐模型</label>
          <input type="text" value={musicModel} onChange={e => setMusicModel(e.target.value)} />
        </div>

        {msg && <p className={'set-msg ' + (msg.ok ? 'ok' : 'bad')}>{msg.text}</p>}

        <div className="set-actions">
          <button className="btn-ghost sm" onClick={test} disabled={testing || !apiKey.trim()}>{testing ? '测试中…' : '测试连接'}</button>
          {init.apiKey && <button className="btn-ghost sm" onClick={clear}>清除 Key</button>}
          <button className="btn-primary sm" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  )
}

// ---------------- 工作台 ----------------
const HOME_PROJECT_LIMIT = 3
const HOME_FOLDER_SONG_LIMIT = 5

function Workbench() {
  const [projects, setProjects] = useState(loadProjects())
  const [folders, setFolders] = useState(loadFolders())
  const [unsortedVisible, setUnsortedVisible] = useState(loadUnsortedVisible())
  const [activeFolderId, setActiveFolderId] = useState('all')
  const [showAddSongModal, setShowAddSongModal] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFolderId, setEditingFolderId] = useState(null)
  const [folderNameDraft, setFolderNameDraft] = useState('')
  const [editingProjectId, setEditingProjectId] = useState(null)
  const [titleDraft, setTitleDraft] = useState('')
  useEffect(() => { setProjects(loadProjects()); setFolders(loadFolders()); setUnsortedVisible(loadUnsortedVisible()) }, [])

  const folderName = (id) => folders.find(f => f.id === id)?.name
  const countIn = (id) => projects.filter(p => p.folderId === id).length
  const isAll = activeFolderId === 'all'
  const isUnsorted = activeFolderId === 'unsorted'
  const activeFolder = folders.find(f => f.id === activeFolderId) || null
  const folderSongs = isAll
    ? projects
    : isUnsorted
      ? projects.filter(p => !p.folderId || !folders.some(f => f.id === p.folderId))
      : projects.filter(p => p.folderId === activeFolderId)
  const unsortedCount = projects.filter(p => !p.folderId || !folders.some(f => f.id === p.folderId)).length
  const homeProjects = projects.slice(0, HOME_PROJECT_LIMIT)
  const homeFolderSongs = folderSongs.slice(0, HOME_FOLDER_SONG_LIMIT)
  const folderMorePath = `/songs?folder=${encodeURIComponent(activeFolderId)}`

  const remove = (id) => {
    const next = projects.filter(p => p.id !== id)
    saveProjects(next); setProjects(next)
  }

  const refreshFolders = () => setFolders(loadFolders())

  const createFolder = () => {
    const f = addFolder(newFolderName)
    if (!f) return
    refreshFolders()
    setNewFolderName('')
    setShowNewFolder(false)
    setActiveFolderId(f.id)
  }

  const saveFolderName = () => {
    if (!editingFolderId) return
    renameFolder(editingFolderId, folderNameDraft)
    refreshFolders()
    setEditingFolderId(null)
    setFolderNameDraft('')
  }

  const deleteFolder = (id) => {
    const folder = folders.find(f => f.id === id)
    if (!folder) return
    const ok = window.confirm(`确定删除文件夹「${folder.name}」吗？文件夹里的歌曲会移到「未整理」，歌曲本身不会删除。`)
    if (!ok) return
    removeFolder(id)
    refreshFolders()
    setProjects(loadProjects())
    if (activeFolderId === id) setActiveFolderId('all')
  }

  const deleteUnsortedFolder = () => {
    const ok = window.confirm('确定删除「未整理」入口吗？歌曲本身不会删除，仍可在「全部」中查看和重新分配文件夹。')
    if (!ok) return
    saveUnsortedVisible(false)
    setUnsortedVisible(false)
    setActiveFolderId('all')
  }

  const moveProject = (projectId, folderId) => {
    setProjects([...setProjectFolder(projectId, folderId)])
  }

  const startEditTitle = (event, project) => {
    event.stopPropagation()
    setEditingProjectId(project.id)
    setTitleDraft(project.title)
  }

  const saveProjectTitle = (event, projectId) => {
    event.stopPropagation()
    const nextTitle = titleDraft.trim().slice(0, 24)
    if (!nextTitle) return
    const next = projects.map(project => project.id === projectId ? { ...project, title: nextTitle } : project)
    saveProjects(next)
    setProjects(next)
    setEditingProjectId(null)
  }

  return (
    <div className="page">
      <div className="hero">
        <h1>把一闪而过的灵感，变成能听的 demo</h1>
        <p>哼一句、写一句，AI 帮你补全词曲、生成可试听 demo，并一键分享给合作方接力完善。</p>
        <button className="btn-primary" onClick={() => navigate('/create')}>开始创作 →</button>
      </div>

      <div className="section-title">
        <h2>我的创作</h2>
        <div className="section-title-actions">
          <span className="muted">首页展示 {Math.min(projects.length, HOME_PROJECT_LIMIT)} / {projects.length} 个项目</span>
          {projects.length > HOME_PROJECT_LIMIT && <button className="link" onClick={() => navigate('/songs')}>查看更多</button>}
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">🎧</div>
          <p>还没有作品。点击「开始创作」记录你的第一段灵感。</p>
        </div>
      ) : (
        <div className="grid">
          {homeProjects.map(p => {
            const latest = p.demos[p.demos.length - 1]
            const fname = folderName(p.folderId)
            return (
              <div key={p.id} className="card proj-card" onClick={() => navigate('/project/' + p.id)}>
                <div className="proj-top">
                  <span className="style-tag">{latest.styleName}</span>
                  <span className="ver-count">{p.demos.length} 版本</span>
                </div>
                <div className="proj-title-row">
                  {editingProjectId === p.id ? (
                    <input
                      className="title-edit-input card-title-input"
                      value={titleDraft}
                      maxLength={24}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                      onChange={e => setTitleDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveProjectTitle(e, p.id)
                        if (e.key === 'Escape') {
                          e.stopPropagation()
                          setEditingProjectId(null)
                          setTitleDraft('')
                        }
                      }}
                    />
                  ) : (
                    <h3>{p.title}</h3>
                  )}
                  {editingProjectId === p.id ? (
                    <div className="card-title-actions">
                      <button className="link" onClick={e => saveProjectTitle(e, p.id)}>保存</button>
                      <button className="link" onClick={e => { e.stopPropagation(); setEditingProjectId(null); setTitleDraft('') }}>取消</button>
                    </div>
                  ) : (
                    <button className="title-edit-btn compact" onClick={e => startEditTitle(e, p)}>修改</button>
                  )}
                </div>
                <p className="proj-insp">{p.inspiration.slice(0, 40) || '（哼唱灵感）'}</p>
                {fname && <p className="proj-template">📁 {fname}</p>}
                <div className="proj-foot">
                  <span className="muted">{new Date(p.createdAt).toLocaleDateString()}</span>
                  <button className="link-del" onClick={(e) => { e.stopPropagation(); remove(p.id) }}>删除</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="template-section">
        <div className="section-title">
          <h2>文件夹整理</h2>
          <span className="muted">用文件夹归类你的歌曲，支持新建、重命名与删除</span>
        </div>
        <div className="template-workbench">
          <div className="template-tabs folder-tabs">
            <button
              className={'template-tab ' + (isAll ? 'template-tab-on' : '')}
              onClick={() => setActiveFolderId('all')}
            >
              <span>🎧</span>
              <strong>全部</strong>
              <em className="folder-count">{projects.length}</em>
            </button>
            {folders.map(folder => (
              <button
                key={folder.id}
                className={'template-tab ' + (folder.id === activeFolderId ? 'template-tab-on' : '')}
                onClick={() => setActiveFolderId(folder.id)}
              >
                <span>{folder.icon || '📁'}</span>
                <strong>{folder.name}</strong>
                <em className="folder-count">{countIn(folder.id)}</em>
              </button>
            ))}
            {unsortedVisible && unsortedCount > 0 && (
              <button
                className={'template-tab ' + (isUnsorted ? 'template-tab-on' : '')}
                onClick={() => setActiveFolderId('unsorted')}
              >
                <span>🗂</span>
                <strong>未整理</strong>
                <em className="folder-count">{unsortedCount}</em>
              </button>
            )}
            {showNewFolder ? (
              <div className="folder-new-row">
                <input
                  autoFocus
                  maxLength={16}
                  placeholder="文件夹名称"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') createFolder()
                    if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') }
                  }}
                />
                <div className="folder-new-actions">
                  <button className="link" onClick={createFolder}>创建</button>
                  <button className="link" onClick={() => { setShowNewFolder(false); setNewFolderName('') }}>取消</button>
                </div>
              </div>
            ) : (
              <button className="folder-add-tab" onClick={() => setShowNewFolder(true)}>＋ 新建文件夹</button>
            )}
          </div>

          <div className="template-detail">
            <div className="template-detail-head">
              <div className="folder-detail-title">
                {editingFolderId === activeFolderId && activeFolder ? (
                  <input
                    className="title-edit-input"
                    autoFocus
                    maxLength={16}
                    value={folderNameDraft}
                    onChange={e => setFolderNameDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveFolderName()
                      if (e.key === 'Escape') { setEditingFolderId(null); setFolderNameDraft('') }
                    }}
                  />
                ) : (
                  <h3>{activeFolder ? `${activeFolder.icon || '📁'} ${activeFolder.name}` : isUnsorted ? '🗂 未整理' : '🎧 全部歌曲'}</h3>
                )}
                <p>{folderSongs.length} 首歌曲{activeFolder?.builtin ? ' · 初始默认，可删除' : isUnsorted ? ' · 可删除入口' : ''}</p>
              </div>
              <div className="template-actions">
                {activeFolder && editingFolderId === activeFolder.id ? (
                  <>
                    <button className="btn-ghost sm" onClick={saveFolderName}>保存</button>
                    <button className="link" onClick={() => { setEditingFolderId(null); setFolderNameDraft('') }}>取消</button>
                  </>
                ) : (
                  <>
                    {activeFolder && (
                      <button className="btn-ghost sm" onClick={() => { setEditingFolderId(activeFolder.id); setFolderNameDraft(activeFolder.name) }}>重命名</button>
                    )}
                    {activeFolder && (
                      <button className="btn-ghost sm" onClick={() => deleteFolder(activeFolder.id)}>删除文件夹</button>
                    )}
                    {isUnsorted && (
                      <button className="btn-ghost sm" onClick={deleteUnsortedFolder}>删除文件夹</button>
                    )}
                    {folderSongs.length > HOME_FOLDER_SONG_LIMIT && (
                      <button className="btn-ghost sm" onClick={() => navigate(folderMorePath)}>查看更多</button>
                    )}
                    {!isAll && !isUnsorted && (
                      <button className="btn-primary sm" onClick={() => setShowAddSongModal(true)} disabled={!projects.length}>+ 添加歌曲</button>
                    )}
                  </>
                )}
              </div>
            </div>

            {folderSongs.length === 0 ? (
              <div className="folder-empty">
                <p>{isAll ? '还没有歌曲，去创作第一首吧。' : '这个文件夹还是空的。点击「添加歌曲」把作品放进来。'}</p>
                {!isAll && !isUnsorted && projects.length > 0 && (
                  <button className="btn-ghost sm" onClick={() => setShowAddSongModal(true)}>+ 添加歌曲</button>
                )}
              </div>
            ) : (
              <div className="folder-song-list">
                {homeFolderSongs.map(project => {
                  const latest = project.demos[project.demos.length - 1]
                  return (
                    <div key={project.id} className="folder-song-item">
                      <div className="folder-song-main" onClick={() => navigate('/project/' + project.id)}>
                        <strong>{project.title}</strong>
                        <small>{latest?.styleName} · V{latest?.version} · {project.inspiration.slice(0, 24) || '（哼唱灵感）'}</small>
                      </div>
                      <div className="folder-song-ctrl" onClick={e => e.stopPropagation()}>
                        <select
                          value={folders.some(f => f.id === project.folderId) ? project.folderId : ''}
                          onChange={e => moveProject(project.id, e.target.value || null)}
                        >
                          <option value="">未整理</option>
                          {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        {project.folderId && <button className="link" onClick={() => moveProject(project.id, null)}>移出</button>}
                      </div>
                    </div>
                  )
                })}
                {folderSongs.length > HOME_FOLDER_SONG_LIMIT && (
                  <button className="folder-more" onClick={() => navigate(folderMorePath)}>查看更多全部歌曲</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddSongModal && activeFolder && (
        <FolderAddSongModal
          folder={activeFolder}
          projects={projects.filter(p => p.folderId !== activeFolder.id)}
          onAdd={(pid) => { moveProject(pid, activeFolder.id) }}
          onClose={() => setShowAddSongModal(false)}
        />
      )}
    </div>
  )
}

function FolderAddSongModal({ folder, projects, onAdd, onClose }) {
  const [added, setAdded] = useState([])
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal submit-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose}>×</button>
        <h2>添加歌曲到「{folder.name}」</h2>
        <p className="muted">点击歌曲即可放入该文件夹</p>
        <div className="submit-project-list">
          {projects.length === 0 ? (
            <p className="muted">没有可添加的歌曲了。</p>
          ) : projects.map(project => {
            const latest = project.demos[project.demos.length - 1]
            const done = added.includes(project.id)
            return (
              <button
                key={project.id}
                className={'submit-project-item ' + (done ? 'submit-project-on' : '')}
                onClick={() => { onAdd(project.id); setAdded(prev => [...prev, project.id]) }}
              >
                <div>
                  <strong>{project.title}</strong>
                  <small>{latest?.styleName} · V{latest?.version}</small>
                  <small>{project.inspiration.slice(0, 42) || '（哼唱灵感）'}</small>
                </div>
                <span>{done ? '已添加' : '添加'}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AllSongsPage() {
  const route = getRoute()
  const folderParam = route.params.get('folder') || 'all'
  const [projects, setProjects] = useState(loadProjects())
  const [folders] = useState(loadFolders())
  const unsortedVisible = loadUnsortedVisible()
  const folderName = (id) => folders.find(f => f.id === id)?.name
  const unsortedCount = projects.filter(p => !p.folderId || !folders.some(f => f.id === p.folderId)).length
  const activeFolder = folders.find(f => f.id === folderParam) || null
  const isAll = folderParam === 'all'
  const isUnsorted = folderParam === 'unsorted'
  const shownProjects = isAll
    ? projects
    : isUnsorted
      ? projects.filter(p => !p.folderId || !folders.some(f => f.id === p.folderId))
      : projects.filter(p => p.folderId === folderParam)
  const title = isUnsorted ? '未整理歌曲' : activeFolder ? `${activeFolder.name}歌曲` : '全部歌曲'

  const remove = (id) => {
    const next = projects.filter(p => p.id !== id)
    saveProjects(next)
    setProjects(next)
  }

  const goFolder = (id) => navigate(id === 'all' ? '/songs' : `/songs?folder=${encodeURIComponent(id)}`)

  return (
    <div className="page">
      <button className="back" onClick={() => navigate('/')}>← 返回首页</button>
      <div className="all-songs-head">
        <div>
          <h1 className="page-h1">{title}</h1>
          <p className="muted">共 {shownProjects.length} 首歌曲，可从这里查看全部创作。</p>
        </div>
        <button className="btn-primary sm" onClick={() => navigate('/create')}>+ 新灵感</button>
      </div>

      <div className="all-folder-filter">
        <button className={'folder-filter-chip ' + (isAll ? 'folder-filter-on' : '')} onClick={() => goFolder('all')}>全部 <span>{projects.length}</span></button>
        {folders.map(folder => (
          <button
            key={folder.id}
            className={'folder-filter-chip ' + (folder.id === folderParam ? 'folder-filter-on' : '')}
            onClick={() => goFolder(folder.id)}
          >
            {folder.icon || '📁'} {folder.name} <span>{projects.filter(p => p.folderId === folder.id).length}</span>
          </button>
        ))}
        {unsortedVisible && unsortedCount > 0 && (
          <button className={'folder-filter-chip ' + (isUnsorted ? 'folder-filter-on' : '')} onClick={() => goFolder('unsorted')}>🗂 未整理 <span>{unsortedCount}</span></button>
        )}
      </div>

      {shownProjects.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">🎧</div>
          <p>当前没有歌曲。</p>
        </div>
      ) : (
        <div className="grid all-songs-grid">
          {shownProjects.map(p => {
            const latest = p.demos[p.demos.length - 1]
            const fname = folderName(p.folderId)
            return (
              <div key={p.id} className="card proj-card" onClick={() => navigate('/project/' + p.id)}>
                <div className="proj-top">
                  <span className="style-tag">{latest.styleName}</span>
                  <span className="ver-count">{p.demos.length} 版本</span>
                </div>
                <h3>{p.title}</h3>
                <p className="proj-insp">{p.inspiration.slice(0, 56) || '（哼唱灵感）'}</p>
                {fname && <p className="proj-template">📁 {fname}</p>}
                <div className="proj-foot">
                  <span className="muted">{new Date(p.createdAt).toLocaleDateString()}</span>
                  <button className="link-del" onClick={(e) => { e.stopPropagation(); remove(p.id) }}>删除</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TemplateLibraryPage({ id }) {
  const template = getSceneTemplate(id) || SCENE_TEMPLATES[0]
  const songs = getTemplateSongs(template)
  return (
    <div className="page">
      <button className="back" onClick={() => navigate('/')}>← 返回首页</button>
      <div className="template-library-head">
        <span className="style-tag">{template.styleName}</span>
        <h1 className="page-h1">{template.title}</h1>
        <p>{template.scene}</p>
      </div>
      <div className="template-library-grid">
        {songs.map(([title, styleName, mood], index) => (
          <button
            key={`${title}-${index}`}
            type="button"
            className="template-library-song"
            onClick={() => navigate(`/create?template=${template.id}&sample=${index}`)}
            style={{
              '--cover-a': template.colors[0],
              '--cover-b': template.colors[1],
              '--cover-c': template.colors[2],
              '--cover-rot': `${index * 29 + 22}deg`
            }}
          >
            <div className="template-cover template-library-cover">
              <span>{template.icon}</span>
            </div>
            <div>
              <strong>{title}</strong>
              <small>{styleName}</small>
              <small>{mood}</small>
            </div>
            <em>选择创作</em>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------- 创作页 ----------------
function CreatePage() {
  const templateParam = getRoute().params.get('template')
  const sampleParam = Number.parseInt(getRoute().params.get('sample') || '0', 10)
  const projectParam = getRoute().params.get('project')
  const initialTemplateRef = useRef(getSceneTemplate(templateParam))
  const initialSubmittedProjectRef = useRef(projectParam ? loadProjects().find(project => project.id === projectParam) : null)
  const initialSubmittedDemoRef = useRef(initialSubmittedProjectRef.current?.demos?.[initialSubmittedProjectRef.current.demos.length - 1] || null)
  const initialTemplateSampleRef = useRef(initialTemplateRef.current ? getTemplateSongs(initialTemplateRef.current)?.[Number.isFinite(sampleParam) ? sampleParam : 0] : null)
  const initialPrompt = initialSubmittedProjectRef.current
    ? `以已投稿作品《${initialSubmittedProjectRef.current.title}》作为场景承接参考，延展到「${initialTemplateRef.current?.title || '场景模板'}」方向。\n\n原始灵感：${initialSubmittedProjectRef.current.inspiration || '（哼唱灵感）'}\n最新主题：${initialSubmittedDemoRef.current?.theme || '情绪表达'}\n参考歌词片段：${(initialSubmittedDemoRef.current?.lyrics || '').split('\n').filter(Boolean).slice(0, 6).join(' / ')}\n\n请保留这首作品的情绪核心和记忆点，生成一个适配该场景的新版本，不复刻原歌词和旋律。`
    : initialTemplateRef.current
    ? `${initialTemplateRef.current.prompt}\n\n选中模板歌曲：《${initialTemplateSampleRef.current?.[0] || initialTemplateRef.current.title}》，曲风：${initialTemplateSampleRef.current?.[1] || initialTemplateRef.current.styleName}，情绪方向：${initialTemplateSampleRef.current?.[2] || initialTemplateRef.current.scene}。请以这首示范歌作为内容气质和场景承接参考，不复刻旋律或歌词。`
    : ''
  const [mode, setMode] = useState('text')
  const [text, setText] = useState(initialPrompt)
  const [style, setStyle] = useState(initialSubmittedDemoRef.current?.styleName || initialTemplateSampleRef.current?.[1] || initialTemplateRef.current?.styleName || '自动')
  const [imgHint, setImgHint] = useState('')
  const [imageInspiration, setImageInspiration] = useState(null)
  const rec = useRecorder()
  const [generating, setGenerating] = useState(false)
  const [stage, setStage] = useState('')
  const [generateError, setGenerateError] = useState('')
  const [aiPromptCandidates, setAiPromptCandidates] = useState([])
  const [promptCandidateState, setPromptCandidateState] = useState('idle')
  const [promptCandidateError, setPromptCandidateError] = useState('')
  const [promptCandidateNonce, setPromptCandidateNonce] = useState(0)
  const aiOn = hasApiKey()
  const localPromptCandidates = useMemo(() => buildPromptCandidates({ text, imgHint, style, nonce: promptCandidateNonce }), [text, imgHint, style, promptCandidateNonce])
  const promptCandidates = aiPromptCandidates.length ? aiPromptCandidates : localPromptCandidates

  const canGenerate = text.trim() || rec.audioUrl || imgHint || imageInspiration

  useEffect(() => {
    const inspiration = [text, imgHint && `画面氛围：${imgHint}`].filter(Boolean).join(' ').trim()
    setAiPromptCandidates([])
    if (!inspiration || !hasApiKey()) {
      setPromptCandidateState(inspiration ? 'local' : 'idle')
      setPromptCandidateError(inspiration ? '未接入 DeepSeek，当前显示本地候选。点右上角「AI 设置」填写 Key 后，会自动改用 AI 生成。' : '')
      return undefined
    }
    const controller = new AbortController()
    setPromptCandidateState('loading')
    setPromptCandidateError('')
    const timer = setTimeout(async () => {
      try {
        const candidates = await generatePromptCandidatesAI({
          inspirationText: inspiration,
          styleOverride: style,
          signal: controller.signal
        })
        if (!controller.signal.aborted) {
          setAiPromptCandidates(candidates)
          setPromptCandidateState(candidates.length ? 'ai' : 'local')
          setPromptCandidateError(candidates.length ? '' : 'DeepSeek 没有返回候选，当前显示本地候选。')
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn('AI Prompt 候选生成失败，使用本地兜底', error)
          setPromptCandidateState('local')
          setPromptCandidateError(`DeepSeek 候选生成失败：${error?.message || '未知错误'}，当前显示本地候选。`)
        }
      }
    }, 800)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [text, imgHint, style, promptCandidateNonce])

  const doGenerate = async () => {
    if (generating) return
    setGenerating(true)
    setGenerateError('')
    const inspiration = [
      text,
      imgHint && `画面氛围：${imgHint}`,
      imageInspiration && `图片灵感：${imageInspiration.name}`,
      rec.audioUrl && '（含哼唱录音）'
    ]
      .filter(Boolean).join(' ')
    const opts = {
      inspirationText: inspiration || '未命名灵感',
      styleOverride: style === '自动' ? null : style,
      hasAudio: !!rec.audioUrl,
      fromImage: mode === 'image' && (!!imgHint || !!imageInspiration)
    }

    try {
      let result
      if (aiOn) {
        // 真 AI 路径：动画阶段与真实调用并行，等模型返回
        setStage('AI 正在读懂你的灵感…')
        const genP = generateSmart(opts)
        const stages = ['AI 正在读懂你的灵感…', '构思情感与意象…', 'AI 逐字为你写词…', '编排旋律与和声…', '渲染试听音频…']
        let done = false
        genP.then(() => { done = true }, () => { done = true })
        for (let i = 0; i < stages.length && !done; i++) {
          setStage(stages[i]); await sleep(700)
        }
        result = await genP
      } else {
        const stages = ['解析灵感碎片…', '匹配曲风与情绪…', '生成歌词…', '编排旋律与和声…', '渲染试听音频…']
        for (let i = 0; i < stages.length; i++) {
          setStage(stages[i]); await sleep(420 + Math.random() * 260)
        }
        result = await generateSmart(opts)
      }

      const { meta, source, warn } = result
      if (warn) alert('AI 写词失败，已自动降级为模板：\n' + warn)
      const project = {
        id: uid(),
        title: meta.title,
        inspiration,
        folderId: mode, // 按灵感来源自动归入 文字/哼唱/画面 默认文件夹
        hasAudio: !!rec.audioUrl,
        imageInspiration: imageInspiration ? { name: imageInspiration.name, dataUrl: imageInspiration.dataUrl } : null,
        createdAt: Date.now(),
        demos: [{
          id: uid(),
          version: 1,
          seed: meta.seed,
          styleName: meta.styleName,
          lyrics: meta.lyrics,
          theme: meta.theme,
          source,
          note: '首个版本',
          createdAt: Date.now()
        }]
      }
      const list = loadProjects()
      list.unshift(project)
      saveProjects(list)
      navigate('/project/' + project.id)
    } catch (error) {
      console.error('生成 Demo 失败', error)
      setGenerateError(error?.message || '生成失败，请检查 AI 设置后重试')
    } finally {
      setGenerating(false)
      setStage('')
    }
  }

  return (
    <div className="page">
      <button className="back" onClick={() => navigate('/')}>← 返回</button>
      <h1 className="page-h1">捕捉灵感</h1>

      <div className="tabs">
        {[['text', '✍️ 文字'], ['hum', '🎤 哼唱'], ['image', '🖼 画面']].map(([k, label]) => (
          <button key={k} className={'tab ' + (mode === k ? 'tab-on' : '')} onClick={() => setMode(k)}>{label}</button>
        ))}
      </div>

      {mode === 'image' && (
        <div className="input-block">
          <label>上传图片灵感</label>
          {!imageInspiration ? (
            <label className="image-upload-box">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={event => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (!file) return
                  if (!file.type.startsWith('image/')) {
                    setGenerateError('请选择图片文件')
                    return
                  }
                  const reader = new FileReader()
                  reader.onload = () => {
                    setImageInspiration({ name: file.name, dataUrl: reader.result })
                    setGenerateError('')
                    if (!imgHint.trim()) setImgHint('根据上传图片提取画面氛围')
                  }
                  reader.onerror = () => setGenerateError('图片读取失败，请换一张图片重试')
                  reader.readAsDataURL(file)
                }}
              />
              <span>点击上传 JPG / PNG / WebP</span>
              <small>可用封面、照片、截图作为创作画面种子</small>
            </label>
          ) : (
            <div className="image-preview-card">
              <img src={imageInspiration.dataUrl} alt="上传的图片灵感" />
              <div>
                <strong>{imageInspiration.name}</strong>
                <p>图片会作为画面灵感参与歌词、曲风和封面生成。</p>
                <button className="link" onClick={() => setImageInspiration(null)}>移除图片</button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'text' && (
        <div className="input-block">
          <label>写下歌词片段、一句话或心情</label>
          <textarea
            rows={5}
            placeholder="例如：深夜的风又吹过窗台，想你的城市下起了雨…"
            value={text}
            onChange={e => setText(e.target.value)}
          />
        </div>
      )}

      {mode === 'hum' && (
        <div className="input-block">
          <label>哼一段旋律，AI 会据此定情绪与节奏</label>
          <div className="rec-box">
            {!rec.audioUrl ? (
              <>
                <button className={'rec-btn ' + (rec.recording ? 'rec-on' : '')} onClick={() => rec.recording ? rec.stop() : rec.start()}>
                  <span className="rec-dot" />
                  {rec.recording ? `录音中 ${rec.seconds}s · 点击停止` : '按下开始哼唱'}
                </button>
                {rec.error && <p className="err">{rec.error}</p>}
              </>
            ) : (
              <div className="rec-done">
                <audio src={rec.audioUrl} controls />
                <button className="link" onClick={rec.reset}>重新录制</button>
              </div>
            )}
          </div>
          <textarea
            rows={2}
            className="mt"
            placeholder="补充说明（可选）：想要的曲风 / 情绪 / 主题"
            value={text}
            onChange={e => setText(e.target.value)}
          />
        </div>
      )}

      {mode === 'image' && (
        <div className="input-block">
          <label>上传一张有感觉的图，或描述画面氛围</label>
          <input
            type="text"
            placeholder="例如：黄昏的海边、霓虹的城市夜、雨后的窗…"
            value={imgHint}
            onChange={e => setImgHint(e.target.value)}
          />
          <p className="hint">AI 会从画面氛围提取关键词，转化为音乐风格。</p>
        </div>
      )}

      {!text.trim() && !imgHint.trim() && (
        <div className="input-block starter-prompts">
          <label>没有想法时，可以从这些灵感词开始</label>
          <div className="starter-list">
            {STARTER_INSPIRATIONS.map(word => (
              <button
                key={word}
                type="button"
                className="starter-chip"
                onClick={() => setText(word)}
              >
                {word}
              </button>
            ))}
          </div>
        </div>
      )}

      {promptCandidates.length > 0 && (
        <div className="input-block prompt-capture">
          <div className="prompt-capture-head">
            <label>灵感词情感捕捉</label>
            <div className="prompt-capture-status">
              <span>
                {promptCandidateState === 'loading'
                  ? 'DeepSeek 正在生成候选…'
                  : `${promptCandidateState === 'ai' ? 'DeepSeek 已生成' : '本地候选'} · 已提炼：${promptCandidates[0].summary || promptCandidates[0].lens || promptCandidates[0].seed}`}
              </span>
              <button
                type="button"
                className="prompt-refresh"
                disabled={promptCandidateState === 'loading'}
                onClick={() => setPromptCandidateNonce(n => n + 1)}
              >
                {promptCandidateState === 'loading' ? '生成中' : '换一组'}
              </button>
            </div>
          </div>
          {promptCandidateError && <p className="prompt-candidate-error">{promptCandidateError}</p>}
          <div className="prompt-candidate-list">
            {promptCandidates.map(item => (
              <button
                key={item.id}
                type="button"
                className="prompt-candidate"
                onClick={() => {
                  setText(item.promptText)
                  if (item.styleName) setStyle(item.styleName)
                }}
              >
                <span className="prompt-style">{item.style}</span>
                <strong>{item.lens}</strong>
                <small>情绪核心：{item.emotions.join('、')}</small>
                <small>风格参考：{item.references}</small>
                <em>采用</em>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="input-block">
        <label>曲风</label>
        <div className="chips">
          {['自动', ...STYLE_NAMES].map(s => (
            <button key={s} className={'chip ' + (style === s ? 'chip-on' : '')} onClick={() => setStyle(s)}>{s}</button>
          ))}
        </div>
      </div>

      <button className="btn-primary big" disabled={!canGenerate || generating} onClick={doGenerate}>
        {generating ? '生成中…' : (aiOn ? '🎶 用 AI 生成 demo' : '🎶 生成 demo')}
      </button>
      <p className="ai-status">
        {aiOn
          ? '✅ 已接入 DeepSeek — 歌词将由真 AI 读懂你的灵感逐字创作'
          : '⚙️ 当前为模板模式（不理解语义）。点右上角「AI 设置」接入 DeepSeek，即可真 AI 写词'}
      </p>
      {generateError && <p className="err" role="alert">生成失败：{generateError}</p>}

      {generating && (
        <div className="gen-overlay">
          <div className="gen-card">
            <div className="gen-anim">
              {[0, 1, 2, 3, 4].map(i => <span key={i} style={{ animationDelay: i * 0.12 + 's' }} />)}
            </div>
            <p className="gen-stage">{stage}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------- 项目 / 版本管理 ----------------
function ProjectPage({ id }) {
  const [project, setProject] = useState(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [showShare, setShowShare] = useState(false)
  const [regen, setRegen] = useState(false)
  const [fullSong, setFullSong] = useState(null)
  const [songGenerating, setSongGenerating] = useState(false)
  const [songError, setSongError] = useState('')
  const songUrlRef = useRef(null)
  const [cover, setCover] = useState(null)
  const [coverError, setCoverError] = useState('')
  const coverUrlRef = useRef(null)
  const coverInputRef = useRef(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [titleSaving, setTitleSaving] = useState(false)
  const [lyricsScrollMode, setLyricsScrollMode] = useState(false)
  const [manualLyricIndex, setManualLyricIndex] = useState(null)
  const [instrumental, setInstrumental] = useState(null)
  const [instGenerating, setInstGenerating] = useState(false)
  const [instError, setInstError] = useState('')
  const [instProgress, setInstProgress] = useState(0)
  const [instDuration, setInstDuration] = useState(0)
  const [instPlaying, setInstPlaying] = useState(false)
  const [useLocalFallback, setUseLocalFallback] = useState(false)
  const audioRef = useRef(null)
  const instUrlRef = useRef(null)
  const player = usePlayer()

  useEffect(() => {
    const p = loadProjects().find(x => x.id === id)
    setProject(p)
    if (p) setActiveIdx(p.demos.length - 1)
  }, [id])

  useEffect(() => {
    if (project?.title) setTitleDraft(project.title)
  }, [project?.title])

  const activeDemoId = project?.demos?.[activeIdx]?.id

  useEffect(() => {
    setManualLyricIndex(null)
  }, [activeDemoId])

  const showSongRecord = useCallback((record) => {
    if (songUrlRef.current) URL.revokeObjectURL(songUrlRef.current)
    const url = URL.createObjectURL(record.blob)
    songUrlRef.current = url
    setFullSong({ ...record, url })
  }, [])

  useEffect(() => {
    let cancelled = false
    if (songUrlRef.current) {
      URL.revokeObjectURL(songUrlRef.current)
      songUrlRef.current = null
    }
    setFullSong(null)
    setSongError('')
    if (!activeDemoId) return undefined
    loadSongAudio(activeDemoId)
      .then(record => { if (record && !cancelled) showSongRecord(record) })
      .catch(error => { if (!cancelled) setSongError(error.message) })
    return () => { cancelled = true }
  }, [activeDemoId, showSongRecord])

  useEffect(() => () => {
    if (songUrlRef.current) URL.revokeObjectURL(songUrlRef.current)
  }, [])

  const showCoverRecord = useCallback((record) => {
    if (coverUrlRef.current) URL.revokeObjectURL(coverUrlRef.current)
    const url = URL.createObjectURL(record.blob)
    coverUrlRef.current = url
    setCover({ ...record, url })
  }, [])

  useEffect(() => {
    let cancelled = false
    if (coverUrlRef.current) {
      URL.revokeObjectURL(coverUrlRef.current)
      coverUrlRef.current = null
    }
    setCover(null)
    setCoverError('')
    if (!activeDemoId || !project) return undefined
    const activeDemo = project.demos[activeIdx]
    loadCoverImage(activeDemoId)
      .then(async record => {
        if (record) return record
        const blob = await generateCover({
          title: project.title,
          theme: activeDemo.theme,
          styleName: activeDemo.styleName,
          seed: activeDemo.seed
        })
        const generated = { blob, source: 'auto', createdAt: Date.now() }
        await saveCoverImage(activeDemoId, generated)
        return generated
      })
      .then(record => { if (record && !cancelled) showCoverRecord(record) })
      .catch(error => { if (!cancelled) setCoverError(error.message) })
    return () => { cancelled = true }
  }, [activeDemoId, project?.id, activeIdx, showCoverRecord])

  useEffect(() => () => {
    if (coverUrlRef.current) URL.revokeObjectURL(coverUrlRef.current)
  }, [])

  // ---- MiniMax 伴奏自动加载/生成 ----
  useEffect(() => {
    let cancelled = false
    if (instUrlRef.current) {
      URL.revokeObjectURL(instUrlRef.current)
      instUrlRef.current = null
    }
    setInstrumental(null)
    setInstError('')
    setInstProgress(0)
    setInstDuration(0)
    setInstPlaying(false)
    setUseLocalFallback(false)
    if (!activeDemoId || !project) return undefined
    const demo = project.demos[activeIdx]
    if (!demo) return undefined

    loadInstrumentalAudio(activeDemoId)
      .then(record => {
        if (cancelled) return
        if (record) {
          const url = URL.createObjectURL(record.blob)
          instUrlRef.current = url
          setInstrumental({ ...record, url })
          return
        }
        if (!hasMusicApiKey()) {
          setUseLocalFallback(true)
          return
        }
        setInstGenerating(true)
        return generateInstrumental({ styleName: demo.styleName, theme: demo.theme })
          .then(result => {
            if (cancelled) return
            const record = { blob: result.blob, duration: result.duration, provider: result.provider, createdAt: Date.now() }
            return saveInstrumentalAudio(activeDemoId, record).then(() => {
              if (cancelled) return
              const url = URL.createObjectURL(result.blob)
              instUrlRef.current = url
              setInstrumental({ ...record, url })
            })
          })
          .catch(error => {
            if (cancelled) return
            console.warn('MiniMax 伴奏生成失败，降级到本地合成', error)
            setInstError(error.message)
            setUseLocalFallback(true)
          })
          .finally(() => { if (!cancelled) setInstGenerating(false) })
      })
      .catch(() => { if (!cancelled) setUseLocalFallback(true) })
    return () => { cancelled = true }
  }, [activeDemoId, project?.id, activeIdx])

  // 音频播放进度同步
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => {
      setInstProgress(audio.duration ? audio.currentTime / audio.duration : 0)
      setInstDuration(audio.duration || 0)
    }
    const onPlay = () => setInstPlaying(true)
    const onPause = () => setInstPlaying(false)
    const onEnd = () => { setInstPlaying(false); setInstProgress(1) }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnd)
    }
  }, [instrumental?.url])

  // 清理 instrumental URL
  useEffect(() => () => {
    if (instUrlRef.current) URL.revokeObjectURL(instUrlRef.current)
  }, [])

  if (!project) return <div className="page"><p>项目不存在。</p><button className="link" onClick={() => navigate('/')}>返回工作台</button></div>

  const demo = project.demos[activeIdx]
  const lyricLines = demo.lyrics.split('\n').map(line => line.trim()).filter(Boolean)
  const audioProgress = useLocalFallback ? player.progress : instProgress
  const audioDuration = useLocalFallback ? player.duration : instDuration
  const audioPlaying = useLocalFallback ? player.playing : instPlaying
  const autoLyricIndex = lyricLines.length
    ? Math.min(lyricLines.length - 1, Math.floor(audioProgress * lyricLines.length))
    : 0
  const activeLyricIndex = manualLyricIndex == null ? autoLyricIndex : Math.min(manualLyricIndex, Math.max(lyricLines.length - 1, 0))
  const lyricTranslateY = `calc(var(--lyrics-shell-center) - ${activeLyricIndex * 46 + 23}px)`
  const danmaku = generateEmotionDanmaku({
    title: project.title,
    lyrics: demo.lyrics,
    theme: demo.theme,
    styleName: demo.styleName,
    seed: demo.seed,
    fullSong
  })

  const createAutoCover = async () => {
    setCoverError('')
    try {
      const blob = await generateCover({
        title: project.title,
        theme: demo.theme,
        styleName: demo.styleName,
        seed: demo.seed
      })
      const record = { blob, source: 'auto', createdAt: Date.now() }
      await saveCoverImage(demo.id, record)
      showCoverRecord(record)
    } catch (error) {
      setCoverError(error.message || '自动封面生成失败')
    }
  }

  const changeCover = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setCoverError('')
    try {
      const blob = await normalizeCoverFile(file)
      const record = { blob, source: 'custom', createdAt: Date.now(), name: file.name }
      await saveCoverImage(demo.id, record)
      showCoverRecord(record)
    } catch (error) {
      setCoverError(error.message || '封面图片处理失败')
    }
  }

  const createFullSong = async () => {
    if (!hasMusicApiKey()) {
      setSongError('请先在右上角「AI 设置」中填写 MiniMax API Key')
      return
    }
    setSongGenerating(true)
    setSongError('')
    const targetDemo = demo
    try {
      const result = await generateFullSong({
        lyrics: targetDemo.lyrics,
        styleName: targetDemo.styleName,
        theme: targetDemo.theme
      })
      const record = {
        blob: result.blob,
        duration: result.duration,
        provider: result.provider,
        createdAt: Date.now()
      }
      await saveSongAudio(targetDemo.id, record)
      if (project.demos[activeIdx]?.id === targetDemo.id) showSongRecord(record)
    } catch (error) {
      console.error('生成完整歌曲失败', error)
      setSongError(error?.message || '完整歌曲生成失败')
    } finally {
      setSongGenerating(false)
    }
  }

  const addVersion = async () => {
    setRegen(true)
    try {
      const { meta, source, warn } = await generateSmart({
        inspirationText: project.inspiration,
        styleOverride: demo.styleName,
        hasAudio: project.hasAudio,
        nonce: project.demos.length + 1
      })
      if (warn) alert('AI 写词失败，已降级为模板：\n' + warn)
      const nv = {
        id: uid(), version: project.demos.length + 1, seed: meta.seed,
        styleName: demo.styleName, lyrics: meta.lyrics, theme: meta.theme,
        source, note: '重新生成', createdAt: Date.now()
      }
      const list = loadProjects()
      const p = list.find(x => x.id === id)
      if (!p) throw new Error('项目已不存在，请返回工作台重试')
      p.demos.push(nv)
      saveProjects(list)
      setProject({ ...p })
      setActiveIdx(p.demos.length - 1)
    } catch (error) {
      console.error('生成新版本失败', error)
      alert('生成新版本失败：' + (error?.message || '未知错误'))
    } finally {
      setRegen(false)
    }
  }

  const changeStyle = (s) => {
    const meta = generateDemoMeta({ inspirationText: project.inspiration, styleOverride: s })
    const list = loadProjects()
    const p = list.find(x => x.id === id)
    p.demos[activeIdx] = { ...p.demos[activeIdx], styleName: s, seed: meta.seed }
    saveProjects(list)
    setProject({ ...p })
  }

  const saveTitle = async () => {
    const nextTitle = titleDraft.trim().slice(0, 24)
    if (!nextTitle || nextTitle === project.title || titleSaving) {
      setTitleDraft(project.title)
      setEditingTitle(false)
      return
    }
    setTitleSaving(true)
    setCoverError('')
    try {
      const list = loadProjects()
      const p = list.find(x => x.id === id)
      if (!p) throw new Error('项目已不存在，请返回工作台重试')
      p.title = nextTitle
      saveProjects(list)
      setProject({ ...p })
      setEditingTitle(false)

      if (cover?.source === 'auto') {
        const blob = await generateCover({
          title: nextTitle,
          theme: demo.theme,
          styleName: demo.styleName,
          seed: demo.seed
        })
        const record = { blob, source: 'auto', createdAt: Date.now() }
        await saveCoverImage(demo.id, record)
        showCoverRecord(record)
      }
    } catch (error) {
      setCoverError(error?.message || '标题保存失败')
    } finally {
      setTitleSaving(false)
    }
  }

  const setLyricIndex = (index) => {
    if (!lyricLines.length) return
    const next = Math.min(Math.max(index, 0), lyricLines.length - 1)
    setManualLyricIndex(next)
    const ratio = lyricLines.length <= 1 ? 0 : next / (lyricLines.length - 1)
    if (useLocalFallback && player.duration) {
      player.seek(ratio)
    } else if (audioRef.current) {
      audioRef.current.currentTime = ratio * (audioRef.current.duration || 0)
    }
  }

  return (
    <div className="page">
      <button className="back" onClick={() => navigate('/')}>← 工作台</button>
      <div className="proj-head">
        <div>
          <div className="title-edit-row">
            {editingTitle ? (
              <input
                className="title-edit-input page-title-input"
                value={titleDraft}
                maxLength={24}
                autoFocus
                onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveTitle()
                  if (e.key === 'Escape') {
                    setTitleDraft(project.title)
                    setEditingTitle(false)
                  }
                }}
              />
            ) : (
              <h1 className="page-h1">{project.title}</h1>
            )}
            {editingTitle ? (
              <div className="title-edit-actions">
                <button className="btn-ghost sm" onClick={saveTitle} disabled={titleSaving}>{titleSaving ? '保存中' : '保存'}</button>
                <button className="link" onClick={() => { setTitleDraft(project.title); setEditingTitle(false) }}>取消</button>
              </div>
            ) : (
              <button className="title-edit-btn" onClick={() => setEditingTitle(true)}>修改标题</button>
            )}
          </div>
          <p className="muted">灵感：{project.inspiration || '（哼唱）'}</p>
        </div>
        <button className="btn-primary sm" onClick={() => setShowShare(true)}>分享 ↗</button>
      </div>

      <div className="card demo-card">
        <div className="cover-panel">
          <div className="cover-frame">
            {cover ? <img src={cover.url} alt={`${project.title}封面`} /> : <div className="cover-loading">生成封面中…</div>}
          </div>
          <div className="cover-info">
            <div>
              <span className="cover-kicker">歌曲封面</span>
              <div className="cover-title-row">
                <h2>{project.title}</h2>
                {!editingTitle && <button className="title-edit-btn compact" onClick={() => setEditingTitle(true)}>修改</button>}
              </div>
              <p>{cover?.source === 'custom' ? '自定义封面' : '根据歌名、主题与曲风自动生成'}</p>
            </div>
            <div className="cover-actions">
              <button className="btn-ghost sm" onClick={() => coverInputRef.current?.click()}>更换封面</button>
              {cover?.source === 'custom' && <button className="link" onClick={createAutoCover}>恢复自动封面</button>}
            </div>
            <input
              ref={coverInputRef}
              className="cover-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={changeCover}
            />
            {coverError && <p className="err" role="alert">{coverError}</p>}
          </div>
        </div>
        <div className="demo-card-top">
          <span className="style-tag">{demo.styleName}</span>
        </div>
        <p className="player-label">{useLocalFallback ? '旋律与伴奏预览（本地合成）' : 'AI 伴奏预览 · MiniMax'}</p>
        {useLocalFallback ? (
          <WaveformPlayer player={player} seed={demo.seed} styleName={demo.styleName} />
        ) : instGenerating ? (
          <div className="inst-loading">
            <div className="gen-anim">
              {[0, 1, 2, 3, 4].map(i => <span key={i} style={{ animationDelay: i * 0.12 + 's' }} />)}
            </div>
            <p>MiniMax 正在生成伴奏…</p>
            <p className="muted">AI 正在编排器乐伴奏，通常需要 1-3 分钟</p>
          </div>
        ) : instrumental ? (
          <div className="inst-player">
            <audio ref={audioRef} controls src={instrumental.url} className="inst-audio" />
            <div className="wave-wrap">
              <div className="wave">
                {new Array(60).fill(0).map((_, i) => (
                  <span
                    key={i}
                    className={'bar ' + (i / 60 <= instProgress ? 'bar-on' : '')}
                    style={{ height: `${15 + Math.sin(i * 0.5) * 8 + Math.cos(i * 0.3) * 6}%` }}
                  />
                ))}
              </div>
              <div className="time-row">
                <span>{fmtTime(instProgress * audioDuration)}</span>
                <span>{fmtTime(audioDuration)}</span>
              </div>
            </div>
          </div>
        ) : instError ? (
          <div className="inst-error">
            <p className="err">伴奏生成失败：{instError}</p>
            <button className="btn-ghost sm" onClick={() => setUseLocalFallback(true)}>降级到本地合成</button>
          </div>
        ) : null}
        {instError && !useLocalFallback && instrumental && (
          <p className="hint">MiniMax 曾生成失败（{instError}），当前使用缓存版本。</p>
        )}
        <div className="demo-actions">
          {useLocalFallback ? (
            <button className="btn-ghost" onClick={() => player.exportWav(demo.seed, demo.styleName, project.title + '_v' + demo.version + '.wav')}>⬇ 下载 WAV</button>
          ) : instrumental ? (
            <a className="btn-ghost" href={instrumental.url} download={project.title + '_v' + demo.version + '_伴奏.mp3'}>⬇ 下载伴奏 MP3</a>
          ) : null}
          <button className="btn-ghost" onClick={addVersion} disabled={regen}>{regen ? '生成中…' : '♻ 生成新版本'}</button>
          <button className="btn-primary" onClick={createFullSong} disabled={songGenerating}>
            {songGenerating ? '正在生成完整歌曲…' : (fullSong ? '重新生成完整歌曲' : '生成完整歌曲')}
          </button>
        </div>
        <div className="full-song">
          <div className="full-song-head">
            <strong>完整歌曲 · 人声演唱</strong>
            {fullSong && <span>MiniMax Music</span>}
          </div>
          {fullSong ? (
            <div className="full-song-ready">
              <audio controls src={fullSong.url} />
              <a className="btn-ghost sm" href={fullSong.url} download={project.title + '_v' + demo.version + '_完整歌曲.mp3'}>下载 MP3</a>
            </div>
          ) : (
            <p className="muted">使用当前歌词、曲风和参考方向生成包含演唱与编曲的完整歌曲。</p>
          )}
          {songError && <p className="err" role="alert">{songError}</p>}
        </div>
        <EmotionDanmakuPanel danmaku={danmaku} />
      </div>

      <div className="card lyrics-card lyrics-card-wide">
        <div className="lyrics-head">
          <h3 className="card-h">歌词</h3>
          <div className="lyrics-head-actions">
            <button
              type="button"
              className={'lyrics-scroll-toggle ' + (lyricsScrollMode ? 'lyrics-scroll-on' : '')}
              onClick={() => setLyricsScrollMode(v => !v)}
            >
              {lyricsScrollMode ? '展开歌词' : '滚动模式'}
            </button>
            <span className="gif-pill">循环动图</span>
          </div>
        </div>
        <div className="lyrics-style-row">
          <span>换个曲风</span>
          <div className="chips compact-chips">
            {STYLE_NAMES.map(s => (
              <button key={s} className={'chip ' + (demo.styleName === s ? 'chip-on' : '')} onClick={() => changeStyle(s)}>{s}</button>
            ))}
          </div>
        </div>
        {lyricsScrollMode && (
          <div className="lyrics-scroll-controls">
            <span>歌词进度</span>
            <div className="lyrics-step-actions" aria-label="歌词行调节">
              <button type="button" onClick={() => setLyricIndex(activeLyricIndex - 1)}>上一句</button>
              <button type="button" onClick={() => { setManualLyricIndex(null); if (useLocalFallback && player.duration) player.seek(player.progress) }}>跟随播放</button>
              <button type="button" onClick={() => setLyricIndex(activeLyricIndex + 1)}>下一句</button>
            </div>
            <input
              type="range"
              min="0"
              max={Math.max(lyricLines.length - 1, 0)}
              step="1"
              value={activeLyricIndex}
              aria-label="歌词播放进度"
              onChange={event => setLyricIndex(Number(event.target.value))}
            />
          </div>
        )}
        <div className="lyrics-with-gif">
          {lyricsScrollMode ? (
            <div className="lyrics-player-shell">
              <div className="lyrics-player-track" style={{ transform: `translateY(${lyricTranslateY})` }}>
                {lyricLines.map((line, index) => (
                  <p
                    key={`${line}-${index}`}
                    className={
                      'lyrics-player-line ' +
                      (index === activeLyricIndex ? 'lyrics-line-active ' : '') +
                      (Math.abs(index - activeLyricIndex) <= 1 ? 'lyrics-line-near' : '')
                    }
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <pre className="lyrics">{demo.lyrics}</pre>
          )}
          <SongMoodGif styleName={demo.styleName} emotion={danmaku.emotion} fullSong={fullSong} />
        </div>
      </div>

      <div className="card version-card version-card-compact">
        <h3 className="card-h">版本历史</h3>
        <div className="ver-list ver-list-row">
          {project.demos.map((d, i) => (
            <button key={d.id} className={'ver-item ' + (i === activeIdx ? 'ver-on' : '')} onClick={() => setActiveIdx(i)}>
              <span>V{d.version}</span>
              <span className="muted">{d.styleName}</span>
              <span className="muted sm">{new Date(d.createdAt).toLocaleTimeString().slice(0, 5)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card next-step">
        <h3 className="card-h">满意了？去做成品</h3>
        <p className="muted">把词曲带到专业 AI 音乐工具，生成高质量成品。</p>
        <div className="ext-links">
          <a className="btn-ghost" href="https://suno.com/create" target="_blank" rel="noreferrer">Suno ↗</a>
          <a className="btn-ghost" href="https://www.mureka.ai" target="_blank" rel="noreferrer">Mureka ↗</a>
          <a className="btn-ghost" href="https://hailuoai.com/music" target="_blank" rel="noreferrer">海螺音乐 ↗</a>
        </div>
      </div>

      {showShare && <ShareModal project={project} demo={demo} onClose={() => setShowShare(false)} />}
    </div>
  )
}

function EmotionDanmakuPanel({ danmaku }) {
  return (
    <div className="emotion-panel" style={{ '--emotion-color': danmaku.emotion.color }}>
      <div className="emotion-head">
        <div>
          <strong>听感回响</strong>
          <p>根据歌词、曲风和歌曲状态生成实时听众反馈</p>
        </div>
        <div className="emotion-badge">
          <span>{danmaku.emotion.label}</span>
          <small>{danmaku.emotion.confidence}%</small>
        </div>
      </div>
      <div className="danmaku-stage" aria-label="AI 弹幕预览">
        {danmaku.bullets.map(item => (
          <span
            key={item.id}
            className="danmaku-line"
            style={{
              top: `${12 + item.lane * 24}%`,
              animationDelay: `${item.delay}s`,
              animationDuration: `${item.duration}s`
            }}
          >
            {item.text}
          </span>
        ))}
      </div>
      <div className="emotion-footer">
        <span>副情绪：{danmaku.emotion.secondary}</span>
        <span>{danmaku.emotion.tone}</span>
      </div>
    </div>
  )
}

function SongMoodGif({ styleName, emotion, fullSong }) {
  const fastStyles = ['电子 EDM', '摇滚 Rock']
  const softStyles = ['抒情 Ballad', 'R&B Soul', '中国风 Guofeng']
  const tempo = fastStyles.includes(styleName) ? 'fast' : softStyles.includes(styleName) ? 'soft' : 'mid'
  const moodText = fullSong ? '已随人声同步律动' : '生成完整歌曲后动效更饱满'

  return (
    <aside className={`song-gif song-gif-${tempo}`} style={{ '--gif-color': emotion.color }}>
      <div className="gif-stage" aria-label={`${emotion.label}歌曲动图`}>
        <span className="gif-halo" />
        <span className="gif-vinyl">
          <i />
        </span>
        <span className="gif-face">
          <i className="gif-eye gif-eye-left" />
          <i className="gif-eye gif-eye-right" />
          <i className="gif-mouth" />
        </span>
        <span className="gif-note gif-note-a">♪</span>
        <span className="gif-note gif-note-b">♫</span>
        <span className="gif-note gif-note-c">✦</span>
        <span className="gif-shadow" />
      </div>
      <div className="gif-caption">
        <span>{moodText}</span>
      </div>
    </aside>
  )
}

function ShareModal({ project, demo, onClose }) {
  const shareLyrics = demo.lyrics.split('\n').filter(Boolean).slice(0, 8).join('\n')
  const [shareUrl2, setShareUrl2] = useState('')
  const [loading, setLoading] = useState(true)
  const [statusText, setStatusText] = useState('正在生成分享链接…')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setStatusText('正在生成分享链接…')

    // 异步收集音频数据
    const prepareShare = async () => {
      const payload = {
        t: project.title, s: demo.seed, st: demo.styleName,
        l: shareLyrics, th: demo.theme, v: demo.version
      }

      // 尝试上传 AI 音频（伴奏优先，完整歌曲次之）
      try {
        const instRecord = await loadInstrumentalAudio(demo.id)
        if (instRecord?.blob && instRecord.blob.size > 0) {
          setStatusText('正在上传 AI 伴奏…')
          const formData = new FormData()
          formData.append('audio', instRecord.blob, 'inst.mp3')
          const resp = await fetch('/api/audio-upload', {
            method: 'POST',
            headers: { 'X-Audio-Type': 'audio/mpeg' },
            body: instRecord.blob
          })
          if (resp.ok) {
            const { audioId } = await resp.json()
            payload.ai = audioId
            payload.aiType = 'instrumental'
          }
        }
      } catch {}

      try {
        const songRecord = await loadSongAudio(demo.id)
        if (songRecord?.blob && songRecord.blob.size > 0) {
          setStatusText('正在上传完整歌曲…')
          const resp = await fetch('/api/audio-upload', {
            method: 'POST',
            headers: { 'X-Audio-Type': 'audio/mpeg' },
            body: songRecord.blob
          })
          if (resp.ok) {
            const { audioId } = await resp.json()
            payload.ai = audioId
            payload.aiType = 'fullsong'
          }
        }
      } catch {}

      const token = encodeShare(payload)
      const localUrl = shareUrl(token)

      // 尝试生成 sid 短链接（优先使用 shareApiBase，加重试）
      const apiBase = (typeof window !== 'undefined' && window.shareApiBase) || ''
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) setStatusText(`正在生成短链接…(${attempt + 1}/3)`)
          const r = await fetch(apiBase + '/api/song-share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
          })
          if (r.ok) {
            const data = await r.json()
            if (!cancelled && data.url) { setShareUrl2(data.url); setLoading(false); return }
          }
        } catch (e) {
          console.error('song-share attempt', attempt + 1, 'failed:', e.message || e)
          if (attempt < 2) await new Promise(r => setTimeout(r, 800))
        }
      }

      if (!cancelled) { setShareUrl2(localUrl); setLoading(false) }
    }

    prepareShare()
    return () => { cancelled = true }
  }, [demo.id])

  const copy = async () => {
    try { await navigator.clipboard.writeText(shareUrl2); setCopied(true); setTimeout(() => setCopied(false), 1600) }
    catch { setCopied(false) }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal song-share-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose}>×</button>
        <h2>🔗 分享「{project.title}」</h2>
        <p className="song-share-subtitle">扫码或复制链接发给朋友试听</p>
        <div className="song-share-qr-wrap">
          {loading ? (
            <div className="song-share-qr-pending">{statusText}</div>
          ) : (
            <div className="qr-center">
              <QRBox text={shareUrl2} size={220} />
            </div>
          )}
        </div>
        <input className="song-share-url-box" readOnly value={shareUrl2 || '生成中…'} onFocus={e => e.target.select()} />
        <div className="song-share-actions">
          <button className="btn-primary" onClick={copy} disabled={loading}>{copied ? '已复制 ✓' : '📋 复制链接'}</button>
          <button className="btn-ghost" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

// ---------------- 分享页（合作方视角）----------------
function SharePage({ token, sid }) {
  const [resolvedToken, setResolvedToken] = useState(token || '')
  const [resolveState, setResolveState] = useState(sid && !token ? 'loading' : 'ready')
  const player = usePlayer()
  const [feedback, setFeedback] = useState([])
  const [name, setName] = useState('')
  const [role, setRole] = useState('编曲')
  const [content, setContent] = useState('')

  useEffect(() => {
    let stopped = false
    if (token) {
      setResolvedToken(token)
      setResolveState('ready')
      return undefined
    }
    if (!sid) {
      setResolvedToken('')
      setResolveState('bad')
      return undefined
    }

    const loadSongShare = async () => {
      setResolveState('loading')
      const endpoints = ['', 'http://localhost:5000']
      for (const endpoint of endpoints) {
        try {
          const resp = await fetch(`${endpoint}/api/song-share/${encodeURIComponent(sid)}`, { cache: 'no-store' })
          if (!resp.ok) continue
          const data = await resp.json()
          if (!stopped && data.token) {
            setResolvedToken(data.token)
            setResolveState('ready')
            return
          }
        } catch {}
      }
      if (!stopped) {
        setResolvedToken('')
        setResolveState('bad')
      }
    }

    loadSongShare()
    return () => { stopped = true }
  }, [token, sid])

  useEffect(() => {
    setFeedback(resolvedToken ? loadFeedback(resolvedToken) : [])
  }, [resolvedToken])

  const data = resolvedToken ? decodeShare(resolvedToken) : null
  const [sharedAudioUrl, setSharedAudioUrl] = useState('')
  const [sharedAudioType, setSharedAudioType] = useState('')

  // 如果分享数据包含 AI 音频 ID，从 share-server 拉取
  useEffect(() => {
    if (!data?.ai || !resolvedToken) return
    setSharedAudioUrl('')
    fetch(`/api/audio/${encodeURIComponent(data.ai)}`)
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        setSharedAudioUrl(url)
        setSharedAudioType(data.aiType || 'instrumental')
      })
      .catch(() => {})
    return () => {
      if (sharedAudioUrl) URL.revokeObjectURL(sharedAudioUrl)
    }
  }, [resolvedToken, data?.ai])

  if (resolveState === 'loading') {
    return <div className="page share-page"><div className="card"><h2>正在打开分享歌曲…</h2><p className="muted">正在读取歌曲短链接，请稍候。</p></div></div>
  }

  if (!data) {
    return <div className="page share-page"><div className="card"><h2>链接无效</h2><p className="muted">分享凭证已失效或不完整。</p></div></div>
  }

  const submit = () => {
    if (!content.trim()) return
    const fb = { name: name || '匿名合作方', role, content: content.trim(), at: Date.now() }
    const next = addFeedback(resolvedToken, fb)
    setFeedback([...next])
    setContent(''); setName('')
  }

  return (
    <div className="page share-page">
      <div className="share-hero">
        <span className="share-badge">私域分享 · 只读试听</span>
        <h1>{data.t}</h1>
        <span className="style-tag">{data.st} · 主题「{data.th}」· V{data.v}</span>
      </div>

      <div className="card demo-card">
        {sharedAudioUrl ? (
          <>
            <p className="player-label">{sharedAudioType === 'fullsong' ? 'AI 完整歌曲 · 人声演唱' : 'AI 伴奏 · MiniMax 生成'}</p>
            <audio controls src={sharedAudioUrl} style={{ width: '100%', borderRadius: 8 }} />
            <a className="btn-ghost mt" href={sharedAudioUrl} download={data.t + '.mp3'}>⬇ 下载 MP3</a>
          </>
        ) : (
          <>
            <WaveformPlayer player={player} seed={data.s} styleName={data.st} />
            <button className="btn-ghost mt" onClick={() => player.exportWav(data.s, data.st, data.t + '.wav')}>⬇ 下载 WAV</button>
          </>
        )}
      </div>

      <div className="card">
        <h3 className="card-h">歌词</h3>
        <pre className="lyrics">{data.l}</pre>
      </div>

      <div className="card">
        <h3 className="card-h">接力完善 · 留下你的意见</h3>
        <div className="fb-form">
          <div className="fb-row">
            <input placeholder="你的名字" value={name} onChange={e => setName(e.target.value)} />
            <select value={role} onChange={e => setRole(e.target.value)}>
              {['编曲', '混音', '企划', '制作人', '词作', '其他'].map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <textarea rows={3} placeholder="例如：副歌可以再抓耳一点，第二段建议加弦乐…" value={content} onChange={e => setContent(e.target.value)} />
          <button className="btn-primary" onClick={submit}>提交反馈</button>
        </div>

        <div className="fb-list">
          {feedback.length === 0 ? (
            <p className="muted">还没有反馈，来做第一个接力的人。</p>
          ) : feedback.map((f, i) => (
            <div key={i} className="fb-item">
              <div className="fb-meta">
                <span className="fb-name">{f.name}</span>
                <span className="role-tag">{f.role}</span>
                <span className="muted sm">{new Date(f.at).toLocaleString()}</span>
              </div>
              <p>{f.content}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card next-step">
        <h3 className="card-h">一键跳转成品工具</h3>
        <div className="ext-links">
          <a className="btn-ghost" href="https://suno.com/create" target="_blank" rel="noreferrer">Suno ↗</a>
          <a className="btn-ghost" href="https://www.mureka.ai" target="_blank" rel="noreferrer">Mureka ↗</a>
        </div>
      </div>
    </div>
  )
}

function fmtTime(s) {
  if (!s || !isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
