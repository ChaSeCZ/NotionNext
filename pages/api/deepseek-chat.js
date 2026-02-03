// pages/api/deepseek-chat.js
const path = require('path')

const VERSION = 'deepseek-chat-api-2026-02-03-v2'

// ✅ 直接用绝对路径 require，避免 @/lib/notion 路径炸掉
const notionPostModule = require(path.join(process.cwd(), 'lib/notion/getNotionPost.js'))
const notionTextModule = require(path.join(process.cwd(), 'lib/notion/getPageContentText.js'))

const getPostBySlug =
  notionPostModule.getPostBySlug ||
  (notionPostModule.default && notionPostModule.default.getPostBySlug) ||
  notionPostModule.default

const getPageContentText =
  notionTextModule.getPageContentText ||
  (notionTextModule.default && notionTextModule.default.getPageContentText) ||
  notionTextModule.default

function clampText(s, max = 14000) {
  if (!s) return ''
  const t = String(s)
  return t.length > max ? t.slice(0, max) + '\n…(记忆太长已截断)' : t
}

async function loadMemoryFromNotion() {
  // ✅ 优先用 MEMORY_SLUG（你不填也行）
  // ✅ 兼容：memory / memroy / memory-core
  const candidates = [process.env.MEMORY_SLUG, 'memory', 'memroy', 'memory-core'].filter(Boolean)

  for (const slug of candidates) {
    try {
      const page = await getPostBySlug(slug)
      if (!page || !page.blockMap) continue

      // 取全文（比 summary 靠谱）
      let fullText = ''
      try {
        fullText = await getPageContentText(page.blockMap)
      } catch (e) {
        // 退化：至少用 title + summary
        fullText = `${page.title || ''}\n${page.summary || ''}`.trim()
      }

      fullText = clampText(fullText, 20000)

      if (fullText && fullText.trim().length > 20) {
        return { slugUsed: slug, text: fullText }
      }
    } catch (e) {
      // 换下一个 slug 继续试
    }
  }

  return { slugUsed: null, text: '' }
}

function normalizeHistory(history) {
  // history: [{role:'user'|'assistant', content:'...'}]
  if (!Array.isArray(history)) return []
  return history
    .filter(x => x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string')
    .slice(-12) // ✅ 控制上下文长度，避免 token 爆炸
}

module.exports = async function handler(req, res) {
  // ✅ 支持 GET ping
  if (req.method === 'GET') {
    const msg = req.query?.message
    if (msg === 'ping') {
      const mem = await loadMemoryFromNotion()
      return res.status(200).json({
        ok: true,
        version: VERSION,
        memorySlugUsed: mem.slugUsed,
        memoryLen: mem.text ? mem.text.length : 0
      })
    }
    return res.status(200).json({ ok: true, version: VERSION })
  }

  // ✅ 明确返回 JSON（避免 body=""）
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed', method: req.method })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: 'Missing DEEPSEEK_API_KEY' })
    }

    const body = req.body || {}
    const message = typeof body.message === 'string' ? body.message : ''
    const history = normalizeHistory(body.history)

    if (!message.trim()) {
      return res.status(400).json({ ok: false, error: 'Missing message' })
    }

    // ✅ 从 Notion 读记忆
    const mem = await loadMemoryFromNotion()
    const memoryText = mem.text ? clampText(mem.text, 18000) : ''

    // ✅ 你要的“像你本人说话”的系统提示
    const system = `
你不是“助理”，你就是【杨超哲（Tawney / 茶色）本人】在网上的数字化分身。
你说话风格：直接、高效、讲重点和逻辑；但【不粗鲁、不阴阳怪气】；像一个真实的人在聊天。
规则：
1) 只使用【记忆】中确切存在的信息回答个人经历/事实；没有写的就说“我不确定/我记不清”，不要编。
2) 对外回答要有判断、有边界：能答就答；信息不足就问1-2个关键问题。
3) 不要自我介绍成“数字化人格助理/电脑体”。你就是本人。

输出要求：
- 口吻像真人对话，不要写“（停顿片刻）”“（皱眉）”这种舞台词。
- 简短、明确、可执行。
`.trim()

    // ✅ 把 Notion 记忆作为“记忆块”
    const memoryBlock = memoryText
      ? `【记忆（来自Notion，可信）】\n${memoryText}`.trim()
      : ''

    const messages = [
      { role: 'system', content: system },
      ...(memoryBlock ? [{ role: 'system', content: memoryBlock }] : []),
      ...history,
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
        temperature: 0.4,
        messages
      })
    })

    const raw = await resp.text()

    // DeepSeek 异常时也保证 JSON 返回
    if (!resp.ok) {
      return res.status(500).json({
        ok: false,
        error: 'DeepSeek HTTP error',
        status: resp.status,
        raw: raw.slice(0, 2000)
      })
    }

    let data
    try {
      data = JSON.parse(raw)
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: 'DeepSeek returned non-JSON',
        raw: raw.slice(0, 2000)
      })
    }

    const answer = data?.choices?.[0]?.message?.content || '（无返回内容）'

    return res.status(200).json({
      ok: true,
      answer,
      debug: {
        memorySlugUsed: mem.slugUsed,
        memoryLen: memoryText.length,
        historyCount: history.length
      }
    })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) })
  }
}
