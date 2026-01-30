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
    ]
  })
})

const text = await resp.text()

// 关键：先兜底打印原始返回
console.log('DeepSeek raw response:', text)

try {
  const data = JSON.parse(text)
  res.status(200).json({
    answer: data?.choices?.[0]?.message?.content || ''
  })
} catch (e) {
  // 明确把“不是 JSON 的内容”返回给前端
  res.status(500).json({
    error: 'DeepSeek returned non-JSON response',
    raw: text
  })
}
