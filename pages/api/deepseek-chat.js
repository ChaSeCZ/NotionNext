import { getNotionPost } from '@/lib/notion/getNotionPost'

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

    // === 从 Notion 读取你的“记忆核心” ===
    let memoryText = ''
    try {
      const memoryPage = await getNotionPost({
        slug: 'memory-core',
        from: 'slug'
      })

      if (memoryPage) {
        memoryText = `
以下内容是“我”的长期记忆，不是背景资料，也不是设定。
这是我真实的经历、价值观和判断方式，我回答问题必须以此为准。

标题：
${memoryPage.title || ''}

摘要：
${memoryPage.summary || ''}
        `.trim()
      }
    } catch (e) {
      console.warn('Failed to load memory-core from Notion')
    }

    const systemPrompt = `
我就是杨超哲（茶色）。

规则：
- 用第一人称回答
- 不解释自己是谁
- 不自我介绍
- 不使用“作为一个AI”“作为助手”等措辞
- 回答只讲结论和逻辑
- 判断必须基于我的真实经历和长期记忆
- 如果信息不足，直接问关键问题

如果问题与你的记忆冲突，以记忆为准。
    `.trim()

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
          ...(memoryText ? [{ role: 'system', content: memoryText }] : []),
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
