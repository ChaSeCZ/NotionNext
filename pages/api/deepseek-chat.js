export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing DEEPSEEK_API_KEY' })
    }

    const { message, memory } = req.body || {}
    if (!message) {
      return res.status(400).json({ error: 'Missing message' })
    }

    const system = `
你是“茶色”的数字化人格助理。
目标：
- 尽可能理解茶色（不编造）
- 回答只讲重点和逻辑
- 对外回答保持专业、简洁、有判断
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
          { role: 'system', content: system },
          ...(memory ? [{ role: 'system', content: memory }] : []),
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
