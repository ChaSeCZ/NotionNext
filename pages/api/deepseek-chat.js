export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

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
规则：
- 回答只讲重点和逻辑
- 不废话，不讨好
- 信息不足就追问
${memory || ''}
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
        { role: 'user', content: message }
      ],
      temperature: 0.6
    })
  })

  const data = await resp.json()
  res.status(200).json({
    answer: data?.choices?.[0]?.message?.content || ''
  })
}
