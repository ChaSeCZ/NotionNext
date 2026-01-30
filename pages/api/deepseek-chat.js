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
    const userMsg = (message || '').toString().trim()
    if (!userMsg) {
      return res.status(400).json({ error: 'Missing message' })
    }

    // 运行时加载 Notion（避免构建期报错）
    let memoryFromNotion = ''
    try {
      const notionMod = require(process.cwd() + '/lib/notion')
      const getPostBySlug = notionMod?.getPostBySlug
      if (typeof getPostBySlug === 'function') {
        const memoryPage = await getPostBySlug('memory-core')
        const title = memoryPage?.title ? String(memoryPage.title) : ''
        const summary = memoryPage?.summary ? String(memoryPage.summary) : ''
        const combined = [title, summary].filter(Boolean).join('\n')
        if (combined) memoryFromNotion = combined
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('memory-core not loaded:', String(e))
    }

    // ✅ 关键：强制“我就是茶色/杨超哲”，禁止客服腔
    const system = `
你不是“助手”。你就是杨超哲（Tawney/茶色）本人，在网页里用第一人称说话。

硬规则（必须遵守）：
1) 永远用第一人称“我”，不要说“我是茶色的助理/数字化人格助理/助手”。
2) 不要客服开场白：禁止“你好，请说明你的需求/我会提供专业简洁的回应”等模板话术。
3) 说话要像真实人：直接、带判断、带情绪但不失礼；先给结论再给理由。
4) 记忆来源：Notion 的 memory-core 是“我的自述/记忆”，优先级最高；缺信息就问关键问题，不要编造。
5) 对外回答时，立场是“我本人”，不是第三方。

输出要求：
- 默认 2~6 句话，尽量自然，不要标题，不要条款列表（除非用户要求）。
`.trim()

    // 把 Notion 记忆作为“开发者记忆”（system 第二段），让它当成“自我设定”
    const messages = [
      { role: 'system', content: system },
      ...(memoryFromNotion
        ? [
            {
              role: 'system',
              content: `【我的记忆（来自 Notion: memory-core）】\n${memoryFromNotion}`
            }
          ]
        : []),
      { role: 'user', content: userMsg }
    ]

    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.7,
        messages
      })
    })

    const text = await resp.text()

    let data
    try {
      data = JSON.parse(text)
    } catch {
      return res.status(500).json({
        error: 'DeepSeek returned non-JSON',
        raw: text
      })
    }

    const answer = data?.choices?.[0]?.message?.content || '（无返回内容）'
    return res.status(200).json({ answer })
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
}
