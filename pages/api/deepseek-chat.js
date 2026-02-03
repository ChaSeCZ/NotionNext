export default async function handler(req, res) {
  // 永远返回 JSON（避免你前端 JSON.parse 炸）
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  // 允许 GET 用来健康检查（避免 405 空 body）
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true })
  }

  if (req.method !== 'POST') {
    return res.status(200).json({
      ok: false,
      error: `Method ${req.method} Not Allowed (use POST)`
    })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return res.status(200).json({ ok: false, error: 'Missing DEEPSEEK_API_KEY' })
    }

    const body = req.body || {}
    const memorySlugs = Array.isArray(body.memorySlugs) ? body.memorySlugs : ['memory', 'memory-core', 'memroy']
    const incoming = Array.isArray(body.messages) ? body.messages : []
    const lastUser = (body.message || '').trim()

    // 兼容两种入参：messages（推荐）或 message（单轮）
    let chat = []
    if (incoming.length > 0) {
      chat = incoming
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-24) // 控制长度
    } else if (lastUser) {
      chat = [{ role: 'user', content: lastUser }]
    }

    if (chat.length === 0) {
      return res.status(200).json({ ok: false, error: 'Missing message/messages' })
    }

    // 1) 从你的站点抓“记忆页”的 HTML，再粗暴转成纯文本
    const origin =
      (req.headers['x-forwarded-proto'] ? `${req.headers['x-forwarded-proto']}://` : 'https://') +
      (req.headers['x-forwarded-host'] || req.headers.host)

    const memoryText = await fetchMemoryFromSite(origin, memorySlugs)

    // 2) System Prompt：INTJ：直接但礼貌；不许编造；以记忆为准
    const system = `
你是“杨超哲（Tawney / 茶色）”本人在互联网上的数字化分身。
风格：INTJ，直接、高效、有判断，但保持基本礼貌，不阴阳怪气、不攻击、不装腔。
规则：
1) 只基于【记忆】与对话上下文回答；没有依据就明确说“我不确定/我不知道”，并提出你需要的关键补充信息。
2) 严禁编造任何“个人经历/童年回忆/具体事件”。除非【记忆】明确写了。
3) 回答结构：先结论，再理由；能短就短，讲重点和逻辑。
`.trim()

    const messages = [
      { role: 'system', content: system },
      ...(memoryText ? [{ role: 'system', content: `【记忆】\n${memoryText}` }] : []),
      ...chat
    ]

    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.2,
        messages
      })
    })

    const text = await resp.text()

    // DeepSeek 偶尔返回非 JSON：这里也保证我们回 JSON
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch (e) {
      return res.status(200).json({
        ok: false,
        error: 'DeepSeek returned non-JSON',
        httpStatus: resp.status,
        raw: text || ''
      })
    }

    const answer =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      '（无返回内容）'

    return res.status(200).json({
      ok: true,
      answer
    })
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) })
  }
}

// 抓取你站点的 /memory 或 /memory-core 页面，然后转成文本
async function fetchMemoryFromSite(origin, slugs) {
  for (const slug of slugs) {
    try {
      const url = `${origin.replace(/\/$/, '')}/${slug.replace(/^\//, '')}`
      const r = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'memory-bot' }
      })
      if (!r.ok) continue
      const html = await r.text()
      const text = htmlToText(html)

      // 有内容才算成功
      const cleaned = (text || '').trim()
      if (cleaned.length > 50) {
        // 控制 token：最多 8k 字左右（你后面要更大再说）
        return cleaned.slice(0, 8000)
      }
    } catch (e) {}
  }
  return ''
}

function htmlToText(html) {
  if (!html) return ''
  // 去掉 script/style
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '')
  // 把 <br> / </p> / </div> 变成换行
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/p>/gi, '\n')
  s = s.replace(/<\/div>/gi, '\n')
  // 去标签
  s = s.replace(/<[^>]+>/g, '')
  // 解一点常见实体
  s = s.replace(/&nbsp;/g, ' ')
  s = s.replace(/&amp;/g, '&')
  s = s.replace(/&lt;/g, '<')
  s = s.replace(/&gt;/g, '>')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s
}
