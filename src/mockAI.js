// 模拟 AI：根据灵感（文字描述 / 哼唱录音 / 画面）生成歌词、推断曲风、编排参数。
// 可复现（同输入同输出）。歌词为完整多段结构，各段不重复，并把用户关键词织入。
import { hashStringToSeed, mulberry32, STYLE_NAMES } from './audioEngine.js'

// 每个主题的丰富词库：verse（主歌可选句）、pre（预副歌）、chorus（副歌）、bridge（桥段）
const THEMES = {
  想念: {
    verse: [
      '深夜的风又吹过窗台', '你的名字在舌尖徘徊', '旧照片褪色成模糊的海',
      '时针走得比心跳还慢', '空荡的房间回响你的笑', '手机屏幕亮了又暗下来',
      '我数着没有你的夜', '街角的路灯替我守夜', '雨滴顺玻璃写你的名字',
      '把思念揉进这段旋律', '枕边还留着昨天的温度', '我对着星空练习说再见',
    ],
    pre: ['也许你早已走远', '可我还留在原地', '每一次呼吸都是想念', '连沉默都在喊你'],
    chorus: [
      '等一个也许不会来的未来', '把想念唱成没人听的告白',
      '这座城市为你空出一半', '我把余生调成你的频段',
      '如果风能带话就替我说', '我一直都还在',
    ],
    bridge: ['要用多少个明天', '才换来释怀的勇气', '或许答案并不重要', '只要记得曾用力爱过你'],
    hook: '别走开',
  },
  热爱: {
    verse: [
      '把梦想大声地唱出来', '哪怕全世界都说太天真', '奔跑吧别停下脚步',
      '光就在下个转角等着', '汗水是青春给的勋章', '摔倒了就笑着再站起来',
      '心跳擂响出发的鼓点', '把不甘心烧成火焰', '前方没有路就踩出一条',
      '年少的疯狂值得被记得', '我们生来不为平庸低头', '把日子过成滚烫的诗',
    ],
    pre: ['风越大我越向前', '黑夜里我就是光', '别问结局会怎样', '只管热烈地活一场'],
    chorus: [
      '就现在冲破所有的边界', '让热爱燃烧成整片星海',
      '哪怕遍体鳞伤也不后悔', '这一次为自己痛快',
      '把青春唱到声嘶力竭', '我们永不认输',
    ],
    bridge: ['也曾在深夜怀疑', '这条路是否值得', '可梦想它还滚烫', '就足够我再赌一次'],
    hook: '一起飞',
  },
  城市: {
    verse: [
      '霓虹灯下我们擦肩', '地铁载着无数个孤单', '在钢筋森林里寻找答案',
      '午夜的便利店还亮着灯', '写字楼的光是谁的加班', '出租车划过湿漉漉的街',
      '每个人都戴着礼貌的面具', '在人海里假装不孤单', '天桥上的风吹散了誓言',
      '外卖的电动车追赶时间', '楼下的猫比我更懂夜晚', '这座城不问你从哪来',
    ],
    pre: ['我在人潮里走散', '却听见心跳的声援', '也许明天会更好', '也许只是又一天'],
    chorus: [
      '这座城市从不为谁停留', '我们都是它路过的风口',
      '在最亮的夜里最深的孤独', '却依然选择停留',
      '把梦想抵押给明天的房租', '也不肯低头',
    ],
    bridge: ['某个加班的深夜', '我突然想起了家', '可回不去的方向', '成了地图上的疤'],
    hook: '别回头',
  },
  自由: {
    verse: [
      '推开那扇生锈的门', '海风带走所有的犹豫', '我要飞向没有边界的地方',
      '把过去写成一封长信', '公路在脚下无限延伸', '云在头顶自由地流浪',
      '扔掉行李只带上勇气', '让方向盘决定去哪里', '晒黑的皮肤是自由的印',
      '不再为谁的期待活着', '把闹钟和规则通通关掉', '天亮之前我要抵达远方',
    ],
    pre: ['风把我托起来', '云在脚下铺开', '我不再问归途', '只管纵情地爱'],
    chorus: [
      '就让我飞向无人的旷野', '把束缚都留在昨天的街角',
      '这一次不为谁妥协', '自由是我的信条',
      '哪怕迷路也要奔跑', '天地任我逍遥',
    ],
    bridge: ['曾被规训得太久', '忘了翅膀的形状', '可风一吹就想起', '我本属于远方'],
    hook: '向远方',
  },
  温柔: {
    verse: [
      '你是清晨落在肩头的光', '慢慢融化我所有防备', '就这样安静地靠着',
      '让时间为我们放慢脚步', '你的呼吸落在我耳边', '像春天融化了整个冬季',
      '牵你的手走过每条街', '路灯把影子叠成一个', '你笑起来眼里有星光',
      '我把温柔都酿成了歌', '连风都变得小心翼翼', '怕惊扰这刚好的相遇',
    ],
    pre: ['不必说太多的话', '沉默也很美好', '你在身边的时候', '世界都变温柔'],
    chorus: [
      '就这样慢慢地陪着你', '把余生过成一首情诗',
      '你是我藏在心底的暖', '不轻易说出的欢喜',
      '愿岁月都对你温柔以待', '我一直都在这',
    ],
    bridge: ['也许爱不用轰烈', '细水才能长流', '我只想每个平凡的天', '都有你在左右'],
    hook: '别松手',
  },
}
const THEME_KEYS = Object.keys(THEMES)

// 关键词织入模板：把用户描述里的词嵌进歌词
const KW_TEMPLATES = [
  kw => `${kw}是我写不完的诗`,
  kw => `关于${kw}的记忆还清晰`,
  kw => `我把${kw}藏进这段副歌里`,
  kw => `${kw}的轮廓在夜里发亮`,
  kw => `为了${kw}我愿再勇敢一次`,
  kw => `${kw}啊别在风里走散`,
]

// 从灵感文本提取可入词的关键词（2-8 字的短语）
function extractKeywords(text) {
  const t = (text || '')
    .replace(/画面氛围[:：]?/g, ' ')
    .replace(/（含哼唱录音）/g, ' ')
    .replace(/[（）()]/g, ' ')
  const parts = t.split(/[\n，。,.\s、！!？?~～\-—:：;；"'“”‘’]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 2 && s.length <= 8)
  // 去重
  return [...new Set(parts)]
}

// 命中主题
function detectTheme(text) {
  const t = (text || '').toString()
  for (const k of THEME_KEYS) if (t.includes(k)) return k
  const map = [
    ['想你', '想念'], ['思念', '想念'], ['离别', '想念'], ['分手', '想念'],
    ['爱', '温柔'], ['温暖', '温柔'], ['陪', '温柔'], ['牵手', '温柔'],
    ['梦', '热爱'], ['青春', '热爱'], ['奔跑', '热爱'], ['热血', '热爱'], ['坚持', '热爱'],
    ['城市', '城市'], ['地铁', '城市'], ['加班', '城市'], ['夜', '城市'], ['孤独', '城市'],
    ['海', '自由'], ['风', '自由'], ['旅行', '自由'], ['公路', '自由'], ['远方', '自由'],
    ['光', '温柔'], ['跑', '热爱'], ['雨', '想念'],
  ]
  for (const [kw, theme] of map) if (t.includes(kw)) return theme
  return null
}

export function inferStyle(text, hasAudio) {
  const t = (text || '')
  if (t.includes('电子') || t.includes('蹦迪') || t.includes('dj') || t.includes('DJ')) return '电子 EDM'
  if (t.includes('摇滚') || t.includes('rock') || t.includes('嘶吼') || t.includes('躁')) return '摇滚 Rock'
  if (t.includes('抒情') || t.includes('慢') || t.includes('安静') || t.includes('温柔') || t.includes('思念')) return '抒情 Ballad'
  if (t.includes('国风') || t.includes('古风') || t.includes('古筝') || t.includes('江湖')) return '中国风 Guofeng'
  if (t.includes('r&b') || t.includes('rnb') || t.includes('soul') || t.includes('慵懒') || t.includes('氛围')) return 'R&B Soul'
  return '流行 Pop'
}

// 无放回抽取器：保证同一段内不重复
function drawer(pool, rnd) {
  const bag = [...pool]
  return (n) => {
    const out = []
    for (let i = 0; i < n && bag.length; i++) {
      const idx = Math.floor(rnd() * bag.length)
      out.push(bag.splice(idx, 1)[0])
    }
    // 若池子抽空还需要更多，从原池补（尽量不同）
    while (out.length < n) out.push(pool[Math.floor(rnd() * pool.length)])
    return out
  }
}

// 生成完整多段歌词（可复现）
export function generateLyrics(inspirationText, seed, opts = {}) {
  const rnd = mulberry32(seed)
  const theme = detectTheme(inspirationText) || THEME_KEYS[Math.floor(rnd() * THEME_KEYS.length)]
  const bank = THEMES[theme]
  const kws = extractKeywords(inspirationText)

  const pickVerse = drawer(bank.verse, rnd)
  const pickPre = drawer(bank.pre, rnd)
  const pickBridge = drawer(bank.bridge, rnd)

  // 关键词入词行（最多 2 句）
  const kwLines = []
  if (kws.length) {
    const n = Math.min(2, kws.length)
    for (let i = 0; i < n; i++) {
      const kw = kws[Math.floor(rnd() * kws.length)]
      const tpl = KW_TEMPLATES[Math.floor(rnd() * KW_TEMPLATES.length)]
      kwLines.push(tpl(kw))
    }
  }

  // 主歌1：3 句 + 1 句关键词行（若有）
  const v1 = pickVerse(3)
  if (kwLines[0]) v1.push(kwLines[0])
  else v1.push(...pickVerse(1))

  // 预副歌
  const pre1 = pickPre(4)

  // 副歌（全曲统一，含 hook）
  const chorusLines = drawer(bank.chorus, rnd)(4)
  const chorus = [...chorusLines, bank.hook]

  // 主歌2：与主歌1 不同的 4 句 + 关键词行
  const v2 = pickVerse(3)
  if (kwLines[1]) v2.push(kwLines[1])
  else v2.push(...pickVerse(1))

  // 桥段
  const bridge = pickBridge(4)

  // 音频/画面模式的情绪注脚
  const moodTag = opts.hasAudio ? '（哼唱定调 · 情绪线已匹配）'
    : opts.fromImage ? '（由画面氛围转译）' : ''

  const lines = [
    moodTag && `※ ${moodTag}`,
    moodTag && '',
    '[Verse 1]', ...v1,
    '', '[Pre-Chorus]', ...pre1,
    '', '[Chorus]', ...chorus,
    '', '[Verse 2]', ...v2,
    '', '[Pre-Chorus]', ...pre1,
    '', '[Chorus]', ...chorus,
    '', '[Bridge]', ...bridge,
    '', '[Chorus]', ...chorus,
    '', '[Outro]', chorusLines[0], bank.hook + '…',
  ].filter(l => l !== undefined && l !== false)

  return { theme, text: lines.join('\n') }
}

// 根据主题、曲风、关键词自动生成有关系的歌名
const TITLE_KITS = {
  想念: {
    prefixes: ['未寄出的', '没有你的', '停在', '写给你的', '一个人的', '晚安'],
    suffixes: ['信', '城市', '那夜', '冬天', '月光', '星空'],
  },
  热爱: {
    prefixes: ['燃烧的', '不熄的', '追着', '滚烫的', '奔跑的', '发光的'],
    suffixes: ['梦', '火焰', '远方', '心跳', '旅途', '翅膀'],
  },
  城市: {
    prefixes: ['午夜', '霓虹', '空荡的', '末班', '街角的', '失眠的'],
    suffixes: ['街道', '便利店', '地铁', '天台', '晚风', '灯火'],
  },
  自由: {
    prefixes: ['飞过', '旷野的', '无人的', '远方的', '流浪的', '逆风的'],
    suffixes: ['风', '公路', '海岸', '天空', '黎明', '出口'],
  },
  温柔: {
    prefixes: ['落在', '你的', '清晨的', '柔软', '靠近', '暖暖的'],
    suffixes: ['光', '名字', '呼吸', '距离', '手心', '午后'],
  },
}

function generateContextualTitle(theme, styleName, seed, keywords = []) {
  const kit = TITLE_KITS[theme] || { prefixes: ['此刻的', '偶然的', '无声的', '明天的'], suffixes: ['瞬间', '答案', '旋律', '故事'] }
  const rnd = mulberry32(seed ^ 0x5f3759df)
  // 关键词优先
  if (keywords.length && rnd() < 0.5) {
    const kw = keywords[Math.floor(rnd() * keywords.length)] || ''
    const cleanKw = kw.replace(/[，,。.\s！!？?~～\-—:：;；"'“”'']/g, '').slice(0, 8)
    if (cleanKw.length >= 2) {
      const wraps = ['《》', '关于', '写给', '致']
      const wrap = wraps[Math.floor(rnd() * wraps.length)]
      return wrap === '《》' ? `${cleanKw}` : `${wrap}${cleanKw}`
    }
  }
  // 风格调性
  const styleMods = {
    '抒情 Ballad': { p: 0, s: 0 },       // 偏爱 prefix
    '电子 EDM': { p: 1, s: 0 },          // 偏爱 suffix
    '摇滚 Rock': { p: 1, s: 1 },
    '中国风 Guofeng': { p: 0, s: 1 },
    'R&B Soul': { p: 0, s: 0 },
    '流行 Pop': { p: rnd() > 0.5 ? 0 : 1, s: rnd() > 0.5 ? 0 : 1 }
  }
  const mod = styleMods[styleName] || { p: 0, s: 0 }
  const prefix = kit.prefixes[Math.floor(rnd() * kit.prefixes.length)]
  const suffix = kit.suffixes[Math.floor(rnd() * kit.suffixes.length)]
  if (mod.p === 0 && mod.s === 0) return prefix + suffix
  if (rnd() > 0.5) return prefix + suffix
  return rnd() > 0.5 ? suffix : prefix
}

// 生成一个 demo 完整配置对象
export function generateDemoMeta({ inspirationText, styleOverride, hasAudio, fromImage, nonce }) {
  const baseText = inspirationText || '未命名灵感'
  const seed = hashStringToSeed(baseText + '|' + (styleOverride || '') + '|' + (hasAudio ? 'A' : '') + (fromImage ? 'I' : '') + '|' + (nonce || ''))
  const style = styleOverride || inferStyle(baseText, hasAudio)
  const lyrics = generateLyrics(baseText, seed, { hasAudio, fromImage })
  const kws = extractKeywords(baseText)
  // 尝试从文本提取标题
  const cleaned = (baseText || '').replace(/画面氛围[:：]?/g, '').replace(/（含哼唱录音）/g, '')
  const firstWord = cleaned.split(/[\n，。,.\s]/).filter(Boolean)[0]
  let title
  if (firstWord && firstWord.length >= 2 && firstWord.length <= 10 && isGoodTitleWord(firstWord)) {
    title = firstWord
  } else {
    title = generateContextualTitle(lyrics.theme, style, seed, kws)
  }
  return { seed, style, styleName: style, lyrics: lyrics.text, theme: lyrics.theme, title }
}

function isGoodTitleWord(word) {
  const stopwords = /^(一首|画面|氛围|灵感|图片|生成|请|帮我|写|根据|以下|歌词|歌曲|主题|曲风|以|从)$/
  return !stopwords.test(word)
}

function pickTitle(text, seed) {
  const cleaned = (text || '').replace(/画面氛围[:：]?/g, '').replace(/（含哼唱录音）/g, '')
  const line = cleaned.split(/[\n，。,.\s]/).filter(Boolean)[0]
  if (line && line.length >= 2 && line.length <= 10) return line
  return null
}

export { STYLE_NAMES }
