/**
 * TrendWave 轻量配置服务（仅 Node 内置模块，无第三方依赖）
 * 提供：配置读写（带备份）、健康检查、LLM 中转、RSS 拉取
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname)
const DATA_DIR = path.join(ROOT, 'data')
const CONFIG_PATH = path.join(DATA_DIR, 'config.json')
const BACKUP_PATH = path.join(DATA_DIR, 'config.backup.json')
const PORT = Number(process.env.TRENDWAVE_PORT || 8787)

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}

function validateWrite(config) {
  if (!config || typeof config !== 'object') return '配置必须是对象'
  if (!Array.isArray(config.products) || config.products.length === 0) {
    return '商品列表不能为空，拒绝写入以免清空商品库'
  }
  if (!Array.isArray(config.creativeStyles) || config.creativeStyles.length === 0) {
    return '至少需要保留一个创作风格'
  }
  return null
}

function mergeMissingDefaults(raw) {
  // 服务端只做浅层保障：缺 products 时不覆盖已有文件内容给空
  return raw
}

async function handleConfigGet(res) {
  if (!fs.existsSync(CONFIG_PATH)) {
    send(res, 404, { error: 'no_config' })
    return
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    send(res, 200, mergeMissingDefaults(parsed))
  } catch (e) {
    send(res, 500, { error: 'config_read_failed', detail: String(e) })
  }
}

async function handleConfigPut(req, res) {
  const text = await readBody(req)
  let config
  try {
    config = JSON.parse(text)
  } catch {
    send(res, 400, { error: 'JSON 解析失败' })
    return
  }
  const err = validateWrite(config)
  if (err) {
    send(res, 400, { error: err })
    return
  }
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      fs.copyFileSync(CONFIG_PATH, BACKUP_PATH)
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
    send(res, 200, { ok: true, backup: fs.existsSync(BACKUP_PATH) })
  } catch (e) {
    send(res, 500, { error: '写入失败', detail: String(e) })
  }
}

function chatUrl(baseUrl) {
  const b = String(baseUrl || '').replace(/\/$/, '')
  if (b.endsWith('/chat/completions')) return b
  if (b.endsWith('/v1')) return `${b}/chat/completions`
  return `${b}/chat/completions`
}

async function handleLlmProxy(req, res) {
  const text = await readBody(req)
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    send(res, 400, { error: 'JSON 解析失败' })
    return
  }
  const { baseUrl, apiKey, ...body } = payload
  const key = apiKey || process.env.TRENDWAVE_LLM_KEY || ''
  if (!key) {
    send(res, 401, { error: { message: 'invalid_api_key' } })
    return
  }
  if (!baseUrl || !body.model) {
    send(res, 400, { error: { message: 'model_not_found' } })
    return
  }
  try {
    const upstream = await fetch(chatUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    })
    const raw = await upstream.text()
    res.writeHead(upstream.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(raw)
  } catch (e) {
    send(res, 502, { error: 'upstream_failed', detail: String(e) })
  }
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseRss(xml, sourceName) {
  const items = []
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || []
  for (const block of blocks.slice(0, 20)) {
    const title = stripHtml(
      (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '',
    )
    const desc = stripHtml(
      (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ||
        block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) ||
        [])[1] || title,
    )
    const pub =
      (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
        block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) ||
        [])[1] || ''
    if (!title) continue
    items.push({
      title,
      summary: desc.slice(0, 160),
      source: sourceName || 'RSS',
      publishedAt: pub.trim(),
      category: '资讯',
      heat: 600 - items.length * 8,
      tags: ['资讯'],
    })
  }
  return items
}

async function handleSourceFetch(url, res) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      send(res, 400, { error: '地址格式不正确' })
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12000)
    const upstream = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'TrendWave/1.0' },
    })
    clearTimeout(timer)
    const text = await upstream.text()
    if (!upstream.ok) {
      send(res, upstream.status, { error: `上游 HTTP ${upstream.status}` })
      return
    }
    const items = parseRss(text, u.hostname)
    send(res, 200, { items })
  } catch (e) {
    const msg = String(e)
    if (/abort/i.test(msg)) send(res, 504, { error: '请求超时' })
    else send(res, 502, { error: '拉取失败', detail: msg })
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  if (req.method === 'OPTIONS') {
    send(res, 204, '')
    return
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      send(res, 200, { ok: true, time: new Date().toISOString() })
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/config') {
      await handleConfigGet(res)
      return
    }
    if (req.method === 'PUT' && url.pathname === '/api/config') {
      await handleConfigPut(req, res)
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/llm/proxy') {
      await handleLlmProxy(req, res)
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/sources/fetch') {
      const target = url.searchParams.get('url') || ''
      await handleSourceFetch(target, res)
      return
    }
    send(res, 404, { error: 'not_found' })
  } catch (e) {
    send(res, 500, { error: 'internal', detail: String(e) })
  }
})

server.listen(PORT, () => {
  console.log(`[trendwave-server] http://127.0.0.1:${PORT}`)
})
