import { getPostBySlug } from '@/lib/notion'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing DEEPSEEK_API_KEY' })
    }

    const { message } = req.body || {}
    if (!message) {
      return res.status(400).json({ error: 'Missing message' })
    }

    // ===== 从 Notion 读取「记忆核心」 =====
    let memoryFromNotion = ''
    try {
      const memoryPage = await getPostBySlug('memory-core')
      if (memoryPage) {
        memoryFromNotion =
          `【记忆核心】\n` +
          `${memoryPage.title || ''}\n` +
          `${memoryPage.summary || ''}`
      }
    } catch (e) {
      console.warn('memory-core not loaded')
    }

    // ===== 系统人格设定 =====
    const systemPrompt = `
你是“茶色”的数字化人格助理。

原则：
- 不编造关于茶色的事实
- 回答只讲重点和逻辑
- 先给结论，再给理由
- 对外回答保持专业、简洁、有判断

如果用户问题与记忆冲突，以记忆为准。
`.trim()

    // ===== 请求 DeepSeek =====
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          ...(memoryFromNotion
            ? [{ role: 'system', content: memoryFromNotion }]
            : []),
          { role: 'user', content: message }
        ]
      })
    })

    const text = await resp.text()

    try {
      const data = JSON.parse(text)
      const answer =
        data?.choices?.[0]?.message?.content || '（无返回内容）'
      return res.status(200).json({ answer })
    } catch {
      return res.status(500).json({
        error: 'DeepSeek returned non-JSON',
        raw: text
      })
    }
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
}
