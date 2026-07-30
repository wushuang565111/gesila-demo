import { mulberry32 } from './audioEngine.js'

const SIZE = 768
const PALETTES = {
  '流行 Pop': ['#ff6b9d', '#7357ff', '#151426'],
  '抒情 Ballad': ['#8fb8ff', '#cab8ff', '#17223b'],
  '电子 EDM': ['#00d6c9', '#6f46ff', '#090b18'],
  '中国风 Guofeng': ['#d9a441', '#406a65', '#152522'],
  'R&B Soul': ['#f0719b', '#6544a4', '#17111f'],
  '摇滚 Rock': ['#ff664d', '#7e2132', '#140d12']
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('封面图片导出失败')), type, quality)
  })
}

function fitTitle(ctx, title, maxWidth) {
  let size = 76
  while (size > 38) {
    ctx.font = `700 ${size}px system-ui, sans-serif`
    if (ctx.measureText(title).width <= maxWidth) return size
    size -= 4
  }
  return size
}

export async function generateCover({ title, theme, styleName, seed }) {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器无法生成封面')

  const rnd = mulberry32((seed || 1) ^ 0x4f1bbcdc)
  const palette = PALETTES[styleName] || PALETTES['流行 Pop']
  const gradient = ctx.createLinearGradient(0, 0, SIZE, SIZE)
  gradient.addColorStop(0, palette[0])
  gradient.addColorStop(0.55, palette[1])
  gradient.addColorStop(1, palette[2])
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SIZE, SIZE)

  ctx.globalAlpha = 0.2
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  for (let i = 0; i < 11; i++) {
    const y = 80 + i * 52 + rnd() * 20
    ctx.beginPath()
    ctx.moveTo(-40, y)
    for (let x = 0; x <= SIZE + 80; x += 48) {
      ctx.lineTo(x, y + Math.sin(x * 0.015 + i + rnd()) * (18 + rnd() * 42))
    }
    ctx.stroke()
  }

  ctx.globalAlpha = 0.16
  for (let i = 0; i < 7; i++) {
    const x = rnd() * SIZE
    const y = rnd() * SIZE
    const radius = 28 + rnd() * 120
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.strokeStyle = i % 2 ? palette[0] : '#ffffff'
    ctx.lineWidth = 8 + rnd() * 24
    ctx.stroke()
  }

  const shade = ctx.createLinearGradient(0, SIZE * 0.25, 0, SIZE)
  shade.addColorStop(0, 'rgba(0,0,0,0)')
  shade.addColorStop(1, 'rgba(0,0,0,0.72)')
  ctx.globalAlpha = 1
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, SIZE, SIZE)

  const safeTitle = (title || '未命名歌曲').slice(0, 18)
  const titleSize = fitTitle(ctx, safeTitle, SIZE - 112)
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${titleSize}px system-ui, sans-serif`
  ctx.textBaseline = 'bottom'
  ctx.fillText(safeTitle, 56, SIZE - 112, SIZE - 112)

  ctx.fillStyle = 'rgba(255,255,255,0.78)'
  ctx.font = '500 24px system-ui, sans-serif'
  const descriptor = [theme, styleName].filter(Boolean).join(' · ')
  ctx.fillText(descriptor.slice(0, 36), 58, SIZE - 66, SIZE - 116)

  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = '600 18px system-ui, sans-serif'
  ctx.fillText('GESILA', 58, 64)

  return canvasToBlob(canvas)
}

export async function normalizeCoverFile(file) {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
  if (file.size > 12 * 1024 * 1024) throw new Error('封面图片不能超过 12MB')

  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器无法处理封面图片')
    const side = Math.min(bitmap.width, bitmap.height)
    const sx = (bitmap.width - side) / 2
    const sy = (bitmap.height - side) / 2
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE)
    return canvasToBlob(canvas)
  } finally {
    bitmap.close()
  }
}
