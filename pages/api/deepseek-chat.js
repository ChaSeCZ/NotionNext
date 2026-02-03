// pages/api/deepseek-chat.js
const path = require('path')

const notionPostModule = require(path.join(process.cwd(), 'lib/notion/getNotionPost.js'))
const notionTextModule = require(path.join(process.cwd(), 'lib/notion/getPageContentText.js'))

// 兼容不同导出方式
const getPostBySlug =
  notionPostModule.getPostBySlug ||
  notionPostModule.getPostBySlug ||
  (notionPostModule.default && notionPostModule.default.getPostBySlug) ||
  notionPostModule.default

const getPageContentText =
  notionTextModule.getPageContentText ||
  notionTextModule.getPageContentText ||
  notionTextModule.default ||
  notionTextModule

const VERSION = 'deepseek-chat-api-2026-02-03-v3'

function json(res, status, data) {
  res.status(status)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  return res.end(JSON.stringify(data))
}

function clampText(s, max = 14000) {
  if (!s) return ''
  const t = String(s)
  return t.length > max ? t.slice(0, max) + '\n…（已截断）' : t
}

async function loadMemoryFromNotion() {
  // 你 Notion 里可能写错过：memroy/memort/memory-core 等都兜底
  const candidates = [
    process.env.MEMORY_SLUG,
    'memory',
    'memroy',
    'memory-core',
    'memort',
    'memorty'
  ].filter(Boolean)

  for (const slug of candidates) {
    try {
      if (!getPostBySlug) continue
      const page = await getPostBySlug(slug)
      if (!page || !page.blockMap) continue

      let body = ''
      try {
        if (getPageContentText) body = await getPageContentText(page.blockMap)
      } catch (e) {}

      const title = page?.title ? String(page.title) : ''
      const summary = page?.summary ? String(page.summary) : ''

      const merged = `【Notion记忆页】${slug}
【标题】${title}
【摘要】${summary}

【正文】
${body || ''}`

      return { ok: true, slug, text: clampText(merged) }
    } catch (e) {}
  }
  return { ok: false, slug: null, text: '' }
}

module.exports = async function handler(req, res) {
  // 任何情况都返回 JSON（别再让前端爆 JSON.parse）
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  // 允许 GET 做 ping（你控制台那条用得上）
  if (req.method === 'GET') {
    const msg = (req.query && req.query.message) || 'ping'
    return json(res, 200, { ok: true, version: VERSION, message: msg })
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, version: VERSION, error: 'Method Not Allowed' })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) return json(res, 500, { ok: false, version: VERSION, error: 'Missing DEEPSEEK_API_KEY' })

    const body = req.body || {}
    const message = body.message || ''
    const history = body.history || []

    if (!String(message).trim()) {
      return json(res, 400, { ok: false, version: VERSION, error: 'Missing message' })
    }

    const mem = await loadMemoryFromNotion()

    const system = `
你就是“杨超哲（Tawney / 茶色）本人”的数字化分身，不是助理口吻。
硬规则：
- 全程第一人称“我”。
- 直接、清晰、有判断，但保持礼貌（INTJ：冷静克制、讲逻辑，不粗鲁）。
- 严禁编造：只允许使用【Notion记忆】里的事实。记忆没写就说“我不记得/笔记里没写”，并追问1个关键问题。
- 当用户问“你好/你是谁”，用人类口吻回答：
  “你好，我是杨超哲，也可以叫我茶色。你想聊什么？”
`.trim()

    const safeHistory = Array.isArray(history)
      ? history
          .filter(m => m && m.role && m.content)
          .slice(-16)
          .map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content).slice(0, 2000)
          }))
      : []

    const messages = [
      { role: 'system', content: system },
      ...(mem.ok ? [{ role: 'system', content: `【Notion记忆】\n${mem.text}` }] : []),
      ...safeHistory,
      { role: 'user', content: String(message) }
    ]

    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.65
      })
    })

    const raw = await resp.text()

    let data
    try {
      data = JSON.parse(raw)
    } catch (e) {
      return json(res, 500, {
        ok: false,
        version: VERSION,
        error: 'DeepSeek returned non-JSON',
        debug: {
          httpStatus: resp.status,
          bodyPreview: raw ? raw.slice(0, 300) : '(empty)',
          memoryLoaded: mem.ok,
          memorySlug: mem.slug,
          memoryChars: mem.text?.length || 0
        }
      })
    }

    const answer = data?.choices?.[0]?.message?.content || ''

    return json(res, 200, {
      ok: true,
      version: VERSION,
      answer: answer || '（无返回内容）',
      debug: {
        memoryLoaded: mem.ok,
        memorySlug: mem.slug,
        memoryChars: mem.text?.length || 0,
        usedHistory: safeHistory.length
      }
    })
  } catch (e) {
    return json(res, 500, { ok: false, version: VERSION, error: String(e) })
  }
}
