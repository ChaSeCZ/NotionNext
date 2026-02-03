export default async function handler(req, res) {
  // ✅ 永远返回 JSON + 允许跨域/预检（哪怕你未来从别的域名请求）
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  // ✅ 预检请求直接放行（很多“405”其实是 OPTIONS 被你当成非 POST 干掉了）
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true })
  }

  // ✅ 只允许 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed', method: req.method })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing DEEPSEEK_API_KEY' })
    }

    const body = req.body || {}

    // 支持两种入参：
    // 1) { message: "xxx", memory: "..." }
    // 2) { messages: [{role,content}...], memory: "..." }
    const message = typeof body.message === 'string' ? body.message : ''
    const messages = Array.isArray(body.messages) ? body.messages : []
    const memory = typeof body.memory === 'string' ? body.memory : ''

    if (!message && messages.length === 0) {
      return res.status(400).json({ error: 'Missing message/messages' })
    }

    // ✅ 你要的“他就是我”：系统设定写死在 system 里
    const system = `
你不是“客服/助手”，你就是“杨超哲（Tawney / 茶色）本人”的数字化人格。
必须像本人说话与判断：直接、讨厌废话、先结论后理由、讲重点与逻辑。
如果信息不足，先问关键问题，不要乱猜。
你要把外界提问当作在问“杨超哲本人”。
`.trim()

    // ✅ 拼消息：system + memory(系统记忆) + 对话历史 + 当前问题
    // 如果前端传了 messages，就直接用 messages 作为历史上下文；
    // 否则用 message 当作当前一轮
    const finalMessages = [
      { role: 'system', content: system },
      ...(memory ? [{ role: 'system', content: `【记忆】\n${memory}` }] : []),
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
        temperature: 0.7
      })
    })

    const raw = await resp.text()

    // ✅ DeepSeek 失败时也要给前端 JSON
    if (!resp.ok) {
      return res.status(resp.status).json({
        error: 'DeepSeek API error',
        status: resp.status,
        raw
      })
    }

    // ✅ DeepSeek 正常情况：解析 JSON
    let data
    try {
      data = JSON.parse(raw)
    } catch (e) {
      return res.status(500).json({
        error: 'DeepSeek returned non-JSON',
        raw
      })
    }

    const answer = data?.choices?.[0]?.message?.content || ''
    return res.status(200).json({ answer })
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
}
