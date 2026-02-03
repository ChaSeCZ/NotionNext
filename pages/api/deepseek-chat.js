// pages/api/deepseek-chat.js

// ✅ 用 require 避免你项目里 ESM/导出方式不一致导致的 import 崩溃
function pickFn(mod, names = []) {
  if (!mod) return null
  if (typeof mod === 'function') return mod
  if (typeof mod.default === 'function') return mod.default
  for (const n of names) {
    if (typeof mod[n] === 'function') return mod[n]
  }
  return null
}

async function loadNotionMemoryText() {
  // 你说你把记忆写在 notion 的 “memroy/memory/memory-core”
  const candidates = [
    process.env.MEMORY_SLUG || 'memory',
    'memroy',
    'memory-core'
  ]

  // 这两个文件在你 repo 的 lib/notion/ 目录里（你截图里看得到）
  const getNotionPost = pickFn(
    require('../../lib/notion/getNotionPost'),
    ['getNotionPost']
  )
  const getPageContentText = pickFn(
    require('../../lib/notion/getPageContentText'),
    ['getPageContentText']
  )

  if (!getNotionPost || !getPageContentText) {
    return { text: '', meta: { ok: false, reason: 'notion-fn-missing' } }
  }

  for (const slug of candidates) {
    try {
      // 兼容不同签名：getNotionPost(slug) 或 getNotionPost({ slug })
      let page = null
      try {
        page = await getNotionPost(slug)
      } catch (e1) {
        page = await getNotionPost({ slug })
      }

      if (!page) continue

      // page 里一般会有 blockMap 或 recordMap（NotionNext 常见结构）
      const blockMap = page.blockMap || page.recordMap || page

      const contentText = await getPageContentText(blockMap)
      const title = page?.title ? String(page.title) : ''
      const summary = page?.summary ? String(page.summary) : ''

      const merged = [title, summary, contentText].filter(Boolean).join('\n')

      const text = merged.trim()
      if (text) {
        return {
          text,
          meta: { ok: true, slug, chars: text.length }
        }
      }
    } catch (e) {
      // 换下一个 slug 继续试
    }
  }

  return { text: '', meta: { ok: false, reason: 'memory-page-empty-or-not-found' } }
}

export default async function handler(req, res) {
  // ✅ 永远返回 JSON
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true })
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed', method: req.method })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing DEEPSEEK_API_KEY' })
    }

    const body = req.body || {}
    const messages = Array.isArray(body.messages) ? body.messages : []
    const message = typeof body.message === 'string' ? body.message : ''

    if (!message && messages.length === 0) {
      return res.status(400).json({ error: 'Missing message/messages' })
    }

    // ✅ 真正从 Notion 读记忆（重点）
    const { text: notionMemory, meta: memoryMeta } = await loadNotionMemoryText()

    // ✅ 你要的“INTJ 直接但不失礼 + 严禁编造”
    const system = `
你就是“杨超哲（Tawney / 茶色）本人”的数字化人格。
风格：INTJ，直接、简洁、有判断，但绝不粗鲁、不阴阳怪气、不怼人。
规则（必须严格遵守）：
1) 只能基于【记忆】与对话内容回答；【记忆】里没有的事实一律不要编造。
2) 如果对方问到【记忆】不存在的信息，你必须说“我不知道/记忆里没有，需要你补充关键事实”。
3) 回答结构：先结论，再理由（最多3条），必要时问1-2个关键追问。
`.trim()

    const memoryGuard = `
【记忆使用约束】
- 以下内容是“杨超哲本人”提供的真实记忆与资料片段。
- 你必须以此为准，不允许自行虚构任何经历/细节。
- 如果记忆不足，直接说缺信息并提出关键问题。
`.trim()

    const finalMessages = [
      { role: 'system', content: system },
      ...(notionMemory
        ? [
            { role: 'system', content: memoryGuard },
            { role: 'system', content: `【记忆】\n${notionMemory}` }
          ]
        : [
            {
              role: 'system',
              content:
                '【警告】当前未载入任何 Notion 记忆。你必须更谨慎：不要编造任何个人经历。'
            }
          ]),
      ...(messages.length ? messages : [{ role: 'user', content: message }])
    ]

    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: finalMessages,
        temperature: 0.3
      })
    })

    const raw = await resp.text()

    if (!resp.ok) {
      return res.status(resp.status).json({
        error: 'DeepSeek API error',
        status: resp.status,
        raw,
        memoryMeta
      })
    }

    let data
    try {
      data = JSON.parse(raw)
    } catch {
      return res.status(500).json({
        error: 'DeepSeek returned non-JSON',
        raw,
        memoryMeta
      })
    }

    const answer = data?.choices?.[0]?.message?.content || '（无返回内容）'
    return res.status(200).json({
      answer,
      memoryMeta // ✅ 给你确认：到底有没有读到 Notion 记忆
    })
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
}
