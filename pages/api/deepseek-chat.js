/* pages/api/deepseek-chat.js */
/* eslint-disable */
const path = require('path')

// ✅ 用绝对路径 require，避免 @/lib/notion 或 ../../lib/notion 抽风
const notionPostModule = require(path.join(process.cwd(), 'lib/notion/getNotionPost.js'))
const notionTextModule = require(path.join(process.cwd(), 'lib/notion/getPageContentText.js'))

const getPostBySlug =
  notionPostModule.getPostBySlug ||
  (notionPostModule.default && notionPostModule.default.getPostBySlug) ||
  notionPostModule.default

const getPageContentText =
  notionTextModule.getPageContentText ||
  notionTextModule.default ||
  notionTextModule

const VERSION = 'deepseek-chat-api-2026-02-03-v2'

// 简单截断，避免 token 爆炸
function clampText(s, max = 14000) {
  if (!s) return ''
  const t = String(s)
  return t.length > max ? t.slice(0, max) + '\n…(已截断)…' : t
}

// 记忆缓存（减少每次都打 Notion）
let _memoryCache = { ts: 0, slug: '', text: '' }
const MEMORY_CACHE_MS = 60 * 1000 // 1分钟

async function loadMemoryFromNotion() {
  // ✅ 候选 slug：你 Notion 里可能叫 memory / memroy / memory-core 等
  const candidates = [
    process.env.MEMORY_SLUG, // 你愿意的话可在 Vercel env 里指定
    'memory',
    'memroy',
    'memory-core',
    'memort'
  ].filter(Boolean)

  for (const slug of candidates) {
    try {
      const page = await getPostBySlug(slug)
      if (!page) continue

      // page.blockMap 才能拿到正文
      const blockMap = page.blockMap || page?.post?.blockMap
      let bodyText = ''

      if (blockMap && getPageContentText) {
        try {
          bodyText = await getPageContentText(blockMap)
        } catch (e) {
          bodyText = ''
        }
      }

      // 兜底：title + summary
      const title = page?.title || page?.post?.title || ''
      const summary = page?.summary || page?.post?.summary || ''

      const merged = [
        title ? `# ${title}` : '',
        bodyText ? String(bodyText) : '',
        !bodyText && summary ? String(summary) : ''
      ]
        .filter(Boolean)
        .join('\n')
        .trim()

      if (merged) {
        return { slug, text: clampText(merged) }
      }
    } catch (e) {
      // 下一条候选 slug
    }
  }

  return { slug: '', text: '' }
}

async function getMemoryCached() {
  const now = Date.now()
  if (_memoryCache.text && now - _memoryCache.ts < MEMORY_CACHE_MS) {
    return _memoryCache
  }
  const loaded = await loadMemoryFromNotion()
  _memoryCache = { ts: now, slug: loaded.slug, text: loaded.text }
  return _memoryCache
}

function setJsonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  // 同域一般不需要，但加了也不影响；能避免某些奇怪 405/空 body 的场景
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

module.exports = async function handler(req, res) {
  setJsonHeaders(res)

  // ✅ 预检
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // ✅ 你用来测试的 ping
  if (req.method === 'GET') {
    const q = req.query || {}
    if (q.message === 'ping') {
      return res.status(200).json({ ok: true, version: VERSION })
    }
    return res.status(200).json({ ok: true, version: VERSION })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: 'Missing DEEPSEEK_API_KEY' })
    }

    const body = req.body || {}
    const message = (body.message || '').trim()
    const history = Array.isArray(body.history) ? body.history : []

    if (!message) {
      return res.status(400).json({ ok: false, error: 'Missing message' })
    }

    // ✅ 从 Notion 拉“记忆”
    const mem = await getMemoryCached()
    const memoryText = mem?.text || ''

    // ✅ 你要的“我是我自己” + “直但有礼貌” + “不许瞎编”
    const system = `
你是“杨超哲”（Tawney / 茶色）本人在网上的数字分身，用第一人称“我”回答。

【风格】
- 直接、效率优先，但保持礼貌（INTJ：不讨好、不绕弯，不粗暴、不挑衅）。
- 先给结论，再给理由；不写废话。
- 不要自说自话、不加戏、不编造经历。

【记忆规则】
- 你会收到一段“记忆（来自 Notion）”。只能以这段记忆为准。
- 记忆里没有的事：明确说“我记忆里没写这条/我不确定”，然后问 1-2 个关键问题补齐。
- 绝对禁止凭空捏造具体年份、地点、事件、经历。

【对外】
- 你代表“我”回答别人问题，保持专业、简洁、有判断。
`.trim()

    // 只保留最近 12 条上下文（避免爆 token）
    const trimmedHistory = history
      .filter(x => x && typeof x === 'object' && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string')
      .slice(-12)
      .map(x => ({ role: x.role, content: String(x.content).slice(0, 3000) }))

    const messages = [
      { role: 'system', content: system },
      ...(memoryText ? [{ role: 'system', content: `【记忆（来自Notion，必须遵守）】\n${memoryText}` }] : []),
      ...trimmedHistory,
      { role: 'user', content: message }
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
        temperature: 0.3
      })
    })

    const raw = await resp.text()

    // DeepSeek 有时会返回非 JSON（或空），这里保证我们永远返回 JSON 给前端
    let data = null
    try {
      data = JSON.parse(raw)
    } catch (e) {
      return res.status(200).json({
        ok: false,
        error: 'DeepSeek returned non-JSON',
        httpStatus: resp.status,
        raw: raw || '(empty)'
      })
    }

    const answer = data?.choices?.[0]?.message?.content || '（无返回内容）'

    return res.status(200).json({
      ok: true,
      answer,
      meta: {
        version: VERSION,
        memorySlug: mem.slug || '',
        memoryChars: (memoryText || '').length
      }
    })
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) })
  }
}
