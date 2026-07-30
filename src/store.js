// 存储 + 分享编码 + 路由工具

const KEY = 'songdemo_projects_v1'

export function loadProjects() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch { return [] }
}

export function saveProjects(list) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function uid() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}

// ---- AI 设置（DeepSeek Key 等，仅存本地浏览器，不进代码/不上传）----
const AI_KEY = 'songdemo_ai_settings_v1'
const AI_DEFAULTS = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  musicApiKey: import.meta.env.VITE_MINIMAX_API_KEY || '',
  musicBaseUrl: 'https://api.minimaxi.com',
  musicModel: 'music-3.0'
}
export function loadSettings() {
  try {
    return { ...AI_DEFAULTS, ...JSON.parse(localStorage.getItem(AI_KEY) || '{}') }
  } catch { return { ...AI_DEFAULTS } }
}
export function saveSettings(s) {
  const next = { ...AI_DEFAULTS, ...s }
  localStorage.setItem(AI_KEY, JSON.stringify(next))
  return next
}
export function hasApiKey() {
  return !!loadSettings().apiKey
}
export function hasMusicApiKey() {
  return !!loadSettings().musicApiKey
}

// ---- 分享编码：把 demo 关键信息压进 URL（Base64URL of JSON）----
export function encodeShare(payload) {
  const json = JSON.stringify(payload)
  const b64 = btoa(unescape(encodeURIComponent(json)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeShare(token) {
  try {
    let b64 = token.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    return JSON.parse(decodeURIComponent(escape(atob(b64))))
  } catch { return null }
}

// ---- hash 路由 ----
export function getRoute() {
  const hash = window.location.hash.slice(1) || '/'
  const [path, query] = hash.split('?')
  const params = new URLSearchParams(query || '')
  return { path, params }
}

export function navigate(path) {
  window.location.hash = path
}

export function shareUrl(token) {
  const base = window.location.origin + window.location.pathname
  return `${base}#/s?t=${token}`
}

// ---- 文件夹（整理歌曲）----
const FOLDER_KEY = 'songdemo_folders_v1'
const UNSORTED_VISIBLE_KEY = 'songdemo_unsorted_visible_v1'
// 默认文件夹：文字 / 哼唱 / 画面（对应三种灵感来源）
const DEFAULT_FOLDERS = [
  { id: 'text', name: '文字', icon: '✍️', builtin: true },
  { id: 'hum', name: '哼唱', icon: '🎤', builtin: true },
  { id: 'image', name: '画面', icon: '🖼', builtin: true }
]

export function loadFolders() {
  try {
    const saved = localStorage.getItem(FOLDER_KEY)
    if (saved !== null) {
      const raw = JSON.parse(saved)
      if (Array.isArray(raw)) return raw
    }
  } catch {}
  saveFolders(DEFAULT_FOLDERS)
  return [...DEFAULT_FOLDERS]
}

export function saveFolders(list) {
  localStorage.setItem(FOLDER_KEY, JSON.stringify(list))
  return list
}

export function loadUnsortedVisible() {
  return localStorage.getItem(UNSORTED_VISIBLE_KEY) !== '0'
}

export function saveUnsortedVisible(visible) {
  localStorage.setItem(UNSORTED_VISIBLE_KEY, visible ? '1' : '0')
  return visible
}

export function addFolder(name) {
  const title = (name || '').trim().slice(0, 16)
  if (!title) return null
  const list = loadFolders()
  const folder = { id: 'f_' + uid(), name: title, icon: '📁', builtin: false }
  list.push(folder)
  saveFolders(list)
  return folder
}

export function renameFolder(id, name) {
  const title = (name || '').trim().slice(0, 16)
  if (!title) return loadFolders()
  const list = loadFolders().map(f => f.id === id ? { ...f, name: title } : f)
  return saveFolders(list)
}

// 删除文件夹：把该文件夹内歌曲的归属清空（回到「未整理」），不删除歌曲本身
export function removeFolder(id) {
  const folders = loadFolders()
  const target = folders.find(f => f.id === id)
  if (!target) return folders
  const list = folders.filter(f => f.id !== id)
  saveFolders(list)
  const projects = loadProjects().map(p => p.folderId === id ? { ...p, folderId: null } : p)
  saveProjects(projects)
  return list
}

// 设置某个歌曲（项目）所属文件夹；folderId 传 null 表示移出
export function setProjectFolder(projectId, folderId) {
  const list = loadProjects().map(p => p.id === projectId ? { ...p, folderId: folderId || null } : p)
  saveProjects(list)
  return list
}

// 反馈存储（按 shareToken 归档，模拟私域协作回流）
const FB_KEY = 'songdemo_feedback_v1'
export function loadFeedback(token) {
  try {
    const all = JSON.parse(localStorage.getItem(FB_KEY) || '{}')
    return all[token] || []
  } catch { return [] }
}
export function addFeedback(token, fb) {
  const all = JSON.parse(localStorage.getItem(FB_KEY) || '{}')
  all[token] = all[token] || []
  all[token].push(fb)
  localStorage.setItem(FB_KEY, JSON.stringify(all))
  return all[token]
}
