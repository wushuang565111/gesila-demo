import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, 'dist')
const port = Number(process.env.PORT || 5000)
const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/+$/, '') || null

let tunnelUrl = null
let tunnelStatus = 'starting'
let tunnelMessage = '公网链接生成中...'
const songShares = new Map()
const audioStore = new Map()

function deriveBaseUrl(req) {
  if (publicUrl) return publicUrl
  const host = req.headers.host || `localhost:${port}`
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${proto}://${host}`
}

// 清理超过 1 小时的音频缓存
setInterval(() => {
  const cutoff = Date.now() - 3600000
  for (const [id, entry] of audioStore) {
    if (entry.createdAt < cutoff) audioStore.delete(id)
  }
}, 600000)

function startTunnel() {
  if (process.env.DISABLE_TUNNEL === '1') {
    tunnelStatus = 'disabled'
    tunnelMessage = '已关闭公网隧道，仅本机可访问'
    return
  }

  const run = () => {
    tunnelStatus = 'starting'
    tunnelMessage = '公网链接生成中...'
    const proc = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=10',
      '-R', `80:localhost:${port}`,
      'nokey@localhost.run'
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    const readLine = data => {
      const text = data.toString()
      const match = text.match(/https:\/\/[a-z0-9-]+\.lhr\.life/i) || text.match(/https:\/\/[a-z0-9-]+\.localhost\.run/i)
      if (match) {
        tunnelUrl = match[0]
        tunnelStatus = 'ready'
        tunnelMessage = '公网链接已生成'
        console.log(`[share] ${tunnelUrl}`)
      } else if (text.trim()) {
        console.log(`[tunnel] ${text.trim()}`)
      }
    }

    proc.stdout.on('data', readLine)
    proc.stderr.on('data', readLine)
    proc.on('error', error => {
      tunnelStatus = 'error'
      tunnelMessage = `隧道启动失败：${error.message}`
      console.error('[tunnel error]', error)
    })
    proc.on('exit', () => {
      if (tunnelStatus !== 'disabled') {
        tunnelStatus = 'reconnecting'
        tunnelMessage = '隧道已断开，正在重连...'
        setTimeout(run, 5000)
      }
    })
  }

  run()
}

function sendJson(res, data) {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(JSON.stringify(data))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
      if (body.length > 200000) {
        reject(new Error('Body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}) }
      catch (error) { reject(error) }
    })
    req.on('error', reject)
  })
}

function makeSongShareId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function buildSongShareUrl(id, req) {
  const base = tunnelUrl || deriveBaseUrl(req)
  return `${base.replace(/\/+$/, '')}/#/s?sid=${encodeURIComponent(id)}`
}

function sendBadRequest(res, message) {
  res.writeHead(400, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(JSON.stringify({ error: message }))
}

function sendNotFound(res, message = 'Not found') {
  res.writeHead(404, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(JSON.stringify({ error: message }))
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }
    const ext = path.extname(filePath)
    const type = ext === '.html' ? 'text/html; charset=utf-8'
      : ext === '.js' ? 'text/javascript; charset=utf-8'
      : ext === '.css' ? 'text/css; charset=utf-8'
      : ext === '.png' ? 'image/png'
      : 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type })
    res.end(data)
  })
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://localhost:${port}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    })
    res.end()
    return
  }

  if (requestUrl.pathname === '/api/share') {
    const isDisabled = process.env.DISABLE_TUNNEL === '1'
    const base = isDisabled ? deriveBaseUrl(req) : tunnelUrl
    sendJson(res, {
      ready: isDisabled || !!tunnelUrl,
      url: isDisabled ? base : tunnelUrl,
      status: isDisabled ? 'ready' : tunnelStatus,
      message: isDisabled ? 'Sealos 部署模式，公网就绪' : tunnelMessage
    })
    return
  }

  if (requestUrl.pathname === '/api/qrcode') {
    const url = requestUrl.searchParams.get('url') || tunnelUrl || deriveBaseUrl(req)
    if (!url) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('No url')
      return
    }
    const png = await QRCode.toBuffer(url, { width: 220, margin: 1 })
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })
    res.end(png)
    return
  }

  // 上传 AI 音频（伴奏/完整歌曲）
  if (requestUrl.pathname === '/api/audio-upload' && req.method === 'POST') {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const id = makeSongShareId()
      const data = Buffer.concat(chunks)
      if (data.length > 15 * 1024 * 1024) {
        sendBadRequest(res, '音频文件过大（最大 15MB）')
        return
      }
      audioStore.set(id, { data, type: req.headers['x-audio-type'] || 'audio/mpeg', createdAt: Date.now() })
      sendJson(res, { audioId: id })
    })
    return
  }

  // 获取上传的音频
  const audioMatch = requestUrl.pathname.match(/^\/api\/audio\/([a-z0-9]+)$/i)
  if (audioMatch && req.method === 'GET') {
    const entry = audioStore.get(audioMatch[1])
    if (!entry) { sendNotFound(res, 'Audio not found'); return }
    res.writeHead(200, { 'Content-Type': entry.type, 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' })
    res.end(entry.data)
    return
  }

  if (requestUrl.pathname === '/api/song-share' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      const token = typeof body.token === 'string' ? body.token.trim() : ''
      if (!token) {
        sendBadRequest(res, 'Missing token')
        return
      }
      const id = makeSongShareId()
      songShares.set(id, { token, createdAt: Date.now() })
      sendJson(res, {
        ready: !!tunnelUrl || process.env.DISABLE_TUNNEL === '1',
        id,
        url: buildSongShareUrl(id, req),
        status: tunnelStatus,
        message: tunnelUrl ? '歌曲短分享链接已生成'
          : (process.env.DISABLE_TUNNEL === '1' ? '歌曲短分享链接已生成' : '已生成本机短链接，公网链接仍在生成中...')
      })
    } catch (error) {
      sendBadRequest(res, error.message || 'Invalid JSON')
    }
    return
  }

  const songShareMatch = requestUrl.pathname.match(/^\/api\/song-share\/([a-z0-9]+)$/i)
  if (songShareMatch && req.method === 'GET') {
    const record = songShares.get(songShareMatch[1])
    if (!record) {
      sendNotFound(res, 'Song share not found')
      return
    }
    sendJson(res, record)
    return
  }

  const safePath = path.normalize(decodeURIComponent(requestUrl.pathname)).replace(/^(\.\.[/\\])+/, '')
  const filePath = path.join(distDir, safePath === '/' ? 'index.html' : safePath)
  if (filePath.startsWith(distDir) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath)
    return
  }
  sendFile(res, path.join(distDir, 'index.html'))
})

server.listen(port, () => {
  console.log(`[share] local server: http://localhost:${port}`)
  startTunnel()
})
