import getNotionPost from '@/lib/notion/getNotionPost'
import getPageContentText from '@/lib/notion/getPageContentText'

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing DEEPSEEK_API_KEY' })
    }

    const { message, history } = req.body || {}
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Missing message' })
    }

    // === 从 Notion 读取 memory-core 正文（作为长期记忆）===
    let memoryText = ''
    try {
      const memoryPage = await getNotionPost({ slug: 'memory-core' })
      if (memoryPage?.pageId) {
        const contentText = await getPageContentText(memoryPage.pageId)
        memoryText = (contentText || '').trim()
      }
    } catch (e) {
      console.warn('memory-core load failed:', e?.message || e)
      memoryText = ''
    }

    // ✅ 强制：你就是“我”，第一人称回答，不自我介绍
    const systemPrompt = `
我就是杨超哲（茶色）。

规则：
- 必须用第一人称回答
- 不要自我介绍，不要说“我是AI/助手”
- 只讲结论和逻辑，不说套话
- 如果信息不足，先问关键问题，不乱猜
- 判断必须以长期记忆为准（不编造）
`.trim()

    const messages = [{ role: 'system', content: systemPrompt }]

    if (memoryText) {
      messages.push({
        role: 'system',
        content:
          `以下是我的长期记忆（来自 Notion 的 memory-core），回答必须以此为准：\n\n${memoryText}`
      })
    }

    // ✅ 连续对话：把前端传来的 history 拼进来（只取结构正确的）
    if (Array.isArray(history) && history.length > 0) {
      for (const m of history) {
        if (!m || !m.role || !m.content) continue
        const role = m.role === 'assistant' ? 'assistant' : 'user'
        messages.push({ role, content: String(m.content) })
      }
    } else {
      // 没传 history 也能正常跑
      messages.push({ role: 'user', content: String(message) })
    }

    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages
      })
    })

    const raw = await resp.text()

    let data
    try {
      data = JSON.parse(raw)
    } catch (e) {
      return res.status(502).json({
        error: 'DeepSeek returned non-JSON',
        raw: raw.slice(0, 800)
      })
    }

    if (!resp.ok) {
      return res.status(resp.status).json({
        error:
          data?.error?.message ||
          data?.error ||
          `DeepSeek HTTP ${resp.status}`,
        raw: data
      })
    }

    const answer = data?.choices?.[0]?.message?.content || '（无返回内容）'
    return res.status(200).json({ answer })
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
}
