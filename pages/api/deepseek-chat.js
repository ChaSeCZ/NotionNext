// pages/api/deepseek-chat.js

const path = require('path')

const VERSION = 'deepseek-chat-api-2026-02-03-stable'

function safeJson(res, status, obj) {
  try {
    res.status(status).json(obj)
  } catch (e) {
    // 极端情况兜底：保证不返回 HTML
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(status).end(JSON.stringify(obj))
  }
}

function clampText(s, max = 14000) {
  if (!s) return ''
  const t = String(s)
  return t.length > max ? t.slice(0, max) + '\n…（已截断）' : t
}

/**
 * 尝试从 Notion 读取记忆页内容：
 * - 优先 slug: MEMORY_SLUG（你可以在 Vercel env 配置 MEMORY_SLUG=memory）
 * - 其次尝试：memory / memroy / memory-core / memort
 */
async function loadMemoryFromNotion() {
  const candidates = [
    process.env.MEMORY_SLUG,
    'memory',
    'memroy',
    'memory-core',
    'memort'
  ].filter(Boolean)

  // 下面两个 require 必须放在函数里，避免“顶层 require 崩掉导致整个 API 500 + HTML”
  let getPostBySlug = null
  let getPageContentText = null

  try {
    const notionPostModule = require(path.join(process.cwd(), 'lib/notion/getNotionPost.js'))
    getPostBySlug =
      notionPostModule.getPostBySlug ||
      (notionPostModule.default && notionPostModule.default.getPostBySlug) ||
      notionPostModule.default ||
      null
  } catch (e) {
    // 不抛出，允许没装/路径变化
    getPostBySlug = null
  }

  try {
    const notionTextModule = require(path.join(process.cwd(), 'lib/notion/getPageContentText.js'))
    getPageContentText =
      notionTextModule.getPageContentText ||
      (notionTextModule.default && notionTextModule.default.getPageContentText) ||
      notionTextModule.default ||
      null
  } catch (e) {
    getPageContentText = null
  }

  if (!getPostBySlug || typeof getPostBySlug !== 'function') {
    return { ok: false, memory: '', usedSlug: '', reason: 'getPostBySlug_not_found' }
  }

  for (const slug of candidates) {
    try {
      const page = await getPostBySlug(slug)
      if (!page) continue

      // 1) 尽量拿正文文本（如果工具可用）
      let text = ''
      if (getPageContentText && page.blockMap) {
        try {
          text = await getPageContentText(page.blockMap)
        } catch (e) {
          text = ''
        }
      }

      // 2) 退化用 title + summary
      if (!text) {
        const title = page.title || ''
        const summary = page.summary || ''
        text = [title, summary].filter(Boolean).join('\n')
      }

      text = clampText(text, 14000)

      if (text) {
        return { ok: true, memory: text, usedSlug: slug, reason: 'loaded' }
      }
    } catch (e) {
      // 继续试下一个 slug
      continue
    }
  }

  return { ok: false, memory: '', usedSlug: '', reason: 'no_candidate_page_found' }
}

async function callDeepSeek({ apiKey, system, memory, history, message }) {
  const messages = []

  // system：人格/规则（你要“直接但不无礼”）
  messages.push({
    role: 'system',
    content: system
  })

  // memory：从 Notion 读取的记忆（作为事实来源）
  if (memory) {
    messages.push({
      role: 'system',
      content:
        '【记忆（来自Notion，视为事实来源）】\n' +
        memory +
        '\n\n【规则】如果记忆里没有，就说“不确定”，并问1-2个关键追问；禁止编造。'
    })
  }

  // 历史对话（让对话连续）
  if (Array.isArray(history) && history.length) {
    for (const m of history) {
      if (!m || !m.role || !m.content) continue
      if (m.role !== 'user' && m.role !== 'assistant') continue
      messages.push({ role: m.role, content: String(m.content) })
    }
  }

  // 当前问题
  messages.push({ role: 'user', content: String(message) })

  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.4
    })
  })

  const text = await resp.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: 'deepseek_non_json', raw: text, status: resp.status }
  }

  const answer = data?.choices?.[0]?.message?.content || ''
  return { ok: true, answer, status: resp.status, raw: data }
}

export default async function handler(req, res) {
  // ✅ GET 健康检查：永远返回 JSON，不做任何 require / Notion / DeepSeek
  if (req.method === 'GET') {
    return safeJson(res, 200, { ok: true, version: VERSION })
  }

  // ✅ 允许预检（避免浏览器一些情况下 OPTIONS 导致 405）
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return res.status(204).end()
  }

  // ✅ 只允许 POST
  if (req.method !== 'POST') {
    return safeJson(res, 405, { ok: false, error: 'Method Not Allowed' })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return safeJson(res, 500, { ok: false, error: 'Missing DEEPSEEK_API_KEY' })
    }

    const body = req.body || {}
    const message = body.message
    const history = body.history || []

    if (!message || !String(message).trim()) {
      return safeJson(res, 400, { ok: false, error: 'Missing message' })
    }

    // ✅ 读 Notion 记忆（失败不炸接口，只是 memory 为空）
    const mem = await loadMemoryFromNotion()

    // ✅ 人格：直接但不无礼 + 拟人化
    const system = `
你就是杨超哲（Tawney / 茶色），在和别人正常聊天。
风格要求：
- 直接、清晰、有判断，但不无礼、不阴阳怪气。
- 像人一样对话：短句、自然、不说“我是AI助手”。
- 先给结论，再补一句理由；需要信息就问1-2个关键问题，不要编造。
- 如果对方问“你是谁”，回答应是：你好，我是杨超哲，也可以叫我茶色。回答都应按照这种风格
`.trim()

    const result = await callDeepSeek({
      apiKey,
      system,
      memory: mem.ok ? mem.memory : '',
      history,
      message
    })

    if (!result.ok) {
      return safeJson(res, 502, {
        ok: false,
        error: result.error,
        status: result.status,
        raw: clampText(result.raw, 2000),
        memory_used: mem.ok,
        memory_slug: mem.usedSlug,
        memory_reason: mem.reason,
        version: VERSION
      })
    }

    return safeJson(res, 200, {
      ok: true,
      answer: result.answer,
      memory_used: mem.ok,
      memory_slug: mem.usedSlug,
      memory_reason: mem.reason,
      version: VERSION
    })
  } catch (e) {
    return safeJson(res, 500, { ok: false, error: String(e), version: VERSION })
  }
}
