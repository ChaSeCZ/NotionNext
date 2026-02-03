// pages/api/deepseek-chat.js

const path = require('path')

// ✅ 用明确文件路径导入（避免 “Can't resolve ../../lib/notion”）
const notionPostModule = require(path.join(
  process.cwd(),
  'lib/notion/getNotionPost.js'
))
const notionTextModule = require(path.join(
  process.cwd(),
  'lib/notion/getPageContentText.js'
))

const getPostBySlug =
  notionPostModule.getPostBySlug ||
  (notionPostModule.default && notionPostModule.default.getPostBySlug) ||
  notionPostModule.default

const getPageContentText =
  notionTextModule.getPageContentText ||
  notionTextModule.default ||
  notionTextModule

function clampText(s, max = 12000) {
  if (!s) return ''
  const t = String(s)
  return t.length > max ? t.slice(0, max) + '\n…（已截断）' : t
}

// 尝试多个 slug，避免你 Notion 里拼写不一致导致“读不到”
async function loadMemoryFromNotion() {
  const candidates = [
    process.env.MEMORY_SLUG,
    'memory',
    'memory-core',
    'memroy',
    'memort'
  ].filter(Boolean)

  for (const slug of candidates) {
    try {
      const page = await getPostBySlug(slug)
      if (!page || !page.blockMap) continue

      // ✅ 读正文文本（不是只读 summary）
      const bodyText = await getPageContentText(page.blockMap)
      const title = page?.title ? String(page.title) : ''
      const summary = page?.summary ? String(page.summary) : ''

      const merged = `【Notion记忆页】${slug}
【标题】${title}
【摘要】${summary}

【正文】
${bodyText || ''}`

      const finalText = clampText(merged, 14000)
      return { ok: true, slug, text: finalText }
    } catch (e) {
      // 尝试下一个 slug
    }
  }
  return { ok: false, slug: null, text: '' }
}

export default async function handler(req, res) {
  // 永远返回 JSON（避免前端 .json() 报错）
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')

  // ✅ 允许 POST / GET（避免你再看到 405）
  const method = (req.method || '').toUpperCase()
  if (method !== 'POST' && method !== 'GET') {
    return res.status(200).json({
      answer: '',
      error: `Method ${method} not supported. Use POST or GET.`,
      debug: { method }
    })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return res.status(200).json({
        answer: '',
        error: 'Missing DEEPSEEK_API_KEY',
        debug: { method }
      })
    }

    // GET 也能测：/api/deepseek-chat?message=xxx
    const body = method === 'POST' ? req.body || {} : {}
    const message =
      (method === 'POST' ? body.message : req.query.message) || ''
    const history =
      (method === 'POST' ? body.history : []) || []

    if (!String(message).trim()) {
      return res.status(200).json({
        answer: '',
        error: 'Missing message',
        debug: { method }
      })
    }

    // ✅ 读取 Notion 记忆
    const mem = await loadMemoryFromNotion()

    // ✅ 你要的“拟人 + 直接但礼貌 + 不编造”
    const system = `
你就是“杨超哲（Tawney / 茶色）本人”的数字化分身，不是助手口吻。
要求：
- 用第一人称“我”回答。
- 直接、清晰、有判断，但保持礼貌（INTJ：冷静、克制、讲逻辑，不阴阳怪气）。
- 不要编造经历：如果【Notion记忆】里没有，就说“我不记得/我的笔记里没写”，并问1个关键追问。
- 如果用户问“你是谁/你好”，回答要像人：
  例：你好，我是杨超哲，也可以叫我茶色。你想聊什么？

你可以引用【Notion记忆】里的事实来回答，优先以记忆为准。
`.trim()

    // ✅ 组装上下文：system + memory + history + user
    // history 格式：[{role:'user'|'assistant', content:'...'}]
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
      ...(mem.ok
        ? [{ role: 'system', content: `【Notion记忆】\n${mem.text}` }]
        : []),
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

    // DeepSeek 有时会返回非 JSON 或空
    let data = null
    try {
      data = JSON.parse(raw)
    } catch {
      return res.status(200).json({
        answer: '',
        error: 'DeepSeek returned non-JSON',
        debug: {
          httpStatus: resp.status,
          bodyPreview: raw ? raw.slice(0, 300) : '(empty)',
          memoryLoaded: mem.ok,
          memorySlug: mem.slug
        }
      })
    }

    const answer = data?.choices?.[0]?.message?.content || ''
    return res.status(200).json({
      answer: answer || '（无返回内容）',
      debug: {
        httpStatus: resp.status,
        memoryLoaded: mem.ok,
        memorySlug: mem.slug,
        memoryChars: mem.text ? mem.text.length : 0
      }
    })
  } catch (e) {
    return res.status(200).json({
      answer: '',
      error: String(e)
    })
  }
}
