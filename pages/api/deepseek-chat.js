import getPageContentText from '../../lib/notion/getPageContentText'
import { getPostBySlug } from '../../lib/notion/getNotionPost'

let MEMORY_CACHE = { text: '', ts: 0 }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing DEEPSEEK_API_KEY' })
    }

    const body = req.body || {}
    const incomingMessages = Array.isArray(body.messages) ? body.messages : null
    const message = typeof body.message === 'string' ? body.message : ''

    // 1) 取用户消息（兼容 message 或 messages）
    let convo = []
    if (incomingMessages && incomingMessages.length) {
      convo = incomingMessages
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-20) // 防止无限增长
    } else if (message.trim()) {
      convo = [{ role: 'user', content: message.trim() }]
    } else {
      return res.status(400).json({ error: 'Missing message/messages' })
    }

    // 2) 从 Notion 读取 memory-core（做缓存，避免每次都打 Notion）
    const now = Date.now()
    let memoryText = ''
    if (MEMORY_CACHE.text && now - MEMORY_CACHE.ts < 60_000) {
      memoryText = MEMORY_CACHE.text
    } else {
      try {
        const memoryPage = await getPostBySlug('memory-core')
        if (memoryPage) {
          // 尽可能拿到正文文本（不是 summary）
          // getPageContentText 的参数在 NotionNext 里就是 blockMap
          let pageText = ''
          try {
            pageText = await getPageContentText(memoryPage.blockMap)
          } catch {
            pageText = ''
          }

          memoryText = [
            memoryPage?.title ? `# ${memoryPage.title}` : '',
            pageText || '',
            memoryPage?.summary ? `\n（摘要）\n${memoryPage.summary}` : ''
          ]
            .filter(Boolean)
            .join('\n')
            .trim()

          // 兜底：避免空
          if (!memoryText) {
            memoryText = (memoryPage?.title || '') + '\n' + (memoryPage?.summary || '')
          }

          MEMORY_CACHE = { text: memoryText, ts: now }
        }
      } catch (e) {
        // 不让 Notion 失败影响主流程
        memoryText = ''
      }
    }

    // 3) 系统人格：明确“你就是我”
    const system = `
你不是客服、不是助手、不是AI旁白。
你就是「杨超哲（Tawney / 茶色）」本人，以第一人称“我”对外回答。

回答规则（必须执行）：
1) 先给结论，再给理由；不废话。
2) 信息不足：直接问关键问题，不瞎猜。
3) 语气直接、有判断、像本人说话，不客套、不迎合。
4) 如果和记忆冲突：以记忆为准，并指出冲突。
`.trim()

    const messages = [
      { role: 'system', content: system },
      ...(memoryText ? [{ role: 'system', content: `【我的记忆】\n${memoryText}` }] : []),
      ...convo
    ]

    // 4) 调 DeepSeek
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.6
      })
    })

    const raw = await resp.text()

    // 5) 永远返回 JSON（前端不会再炸）
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      return res.status(500).json({
        error: 'DeepSeek returned non-JSON',
        raw: raw?.slice(0, 3000) || ''
      })
    }

    if (!resp.ok) {
      return res.status(resp.status).json({
        error: data?.error?.message || 'DeepSeek request failed',
        raw: raw?.slice(0, 3000) || ''
      })
    }

    const answer = data?.choices?.[0]?.message?.content || '（无返回内容）'
    return res.status(200).json({ answer })
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
}
