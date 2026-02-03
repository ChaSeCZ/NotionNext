// pages/api/deepseek-chat.js

const path = require('path')

// ✅ 直接用绝对路径 require，避免你之前那种 @/lib/notion / ../../lib/notion 全部炸掉的问题
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

const VERSION = 'deepseek-chat-api-2026-02-03-v1'

function clampText(s, max = 14000) {
  if (!s) return ''
  const t = String(s)
  return t.length > max ? t.slice(0, max) + '\n…（已截断）' : t
}

async function loadMemoryFromNotion() {
  // ✅ 这里写死优先读 memory（你 Notion 的 slug 最好就叫 memory）
  // 如果你坚持用 memroy，也会尝试读到
  const candidates = [
    process.env.MEMORY_SLUG, // 可选：Vercel 环境变量 MEMORY_SLUG=memory
    'memory',
    'memroy',
    'memory-core',
    'memort'
  ].filter(Boolean)

  for (const slug of candidates) {
    try {
      const page = await getPostBySlug(slug)
      if (!page || !page.blockMap) continue

      const bodyText = await getPageContentText(page.blockMap)

      const title = page?.title ? String(page.title) : ''
      const summary = page?.summary ? String(page.summary) : ''

      const merged = `【Notion记忆页】${slug}
【标题】${title}
【摘要】${summary}

【正文】
${bodyText || ''}`

      return { ok: true, slug, text: clampText(merged) }
    } catch (e) {
      // 继续尝试下一个 slug
    }
  }

  return { ok: false, slug: null, text: '' }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')

  const method = (req.method || '').toUpperCase()

  // ✅ 允许 GET/POST，避免你再看到 405 + 空 body
  if (method !== 'POST' && method !== 'GET') {
    return res.status(200).json({
      ok: false,
      version: VERSION,
      answer: '',
      error: `Method ${method} not supported. Use POST or GET.`
    })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return res.status(200).json({
        ok: false,
        version: VERSION,
        answer: '',
        error: 'Missing DEEPSEEK_API_KEY'
      })
    }

    const message =
      (method === 'POST' ? (req.body || {}).message : req.query.message) || ''
    const history = (method === 'POST' ? (req.body || {}).history : []) || []

    if (!String(message).trim()) {
      return res.status(200).json({
        ok: false,
        version: VERSION,
        answer: '',
        error: 'Missing message'
      })
    }

    // ✅ 读 Notion 记忆（正文）
    const mem = await loadMemoryFromNotion()

    // ✅ 你要的：像“你本人”，直但不失礼，不编造
    const system = `
你就是“杨超哲（Tawney / 茶色）本人”的数字化分身，不是助理口吻。
要求：
- 用第一人称“我”回答。
- 直接、清晰、有判断，但保持礼貌（INTJ：冷静克制、讲逻辑，不粗鲁）。
- 严禁编造：如果【Notion记忆】没有写，就明确说“我不记得/笔记里没写”，并追问1个关键问题。
- 如果用户问“你好/你是谁”，按人类口吻回答：
  “你好，我是杨超哲，也可以叫我茶色。你想聊什么？”
优先以【Notion记忆】为准。
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
        temperature: 0.7
      })
    })

    const raw = await resp.text()

    let data
    try {
      data = JSON.parse(raw)
    } catch {
      return res.status(200).json({
        ok: false,
        version: VERSION,
        answer: '',
        error: 'DeepSeek returned non-JSON',
        debug: {
          httpStatus: resp.status,
          bodyPreview: raw ? raw.slice(0, 300) : '(empty)',
          memoryLoaded: mem.ok,
          memorySlug: mem.slug,
          memoryChars: mem.text ? mem.text.length : 0
        }
      })
    }

    const answer = data?.choices?.[0]?.message?.content || ''
    return res.status(200).json({
      ok: true,
      version: VERSION,
      answer: answer || '（无返回内容）',
      debug: {
        memoryLoaded: mem.ok,
        memorySlug: mem.slug,
        memoryChars: mem.text ? mem.text.length : 0
      }
    })
  } catch (e) {
    return res.status(200).json({
      ok: false,
      version: VERSION,
      answer: '',
      error: String(e)
    })
  }
}
