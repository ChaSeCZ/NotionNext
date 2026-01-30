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
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Missing message' })
    }

    // -----------------------------
    // 从 Notion 读取「记忆核心」memory-core
    // 关键点：不要用 import '../../lib/notion'
    // 改为运行时 require，避免 build 阶段模块解析报错
    // -----------------------------
    let memoryFromNotion = ''
    try {
      // 运行时加载（webpack 不会在 build 阶段解析）
      const notionMod = require(process.cwd() + '/lib/notion')
      const getPostBySlug = notionMod?.getPostBySlug

      if (typeof getPostBySlug === 'function') {
        const memoryPage = await getPostBySlug('memory-core')

        // 尽量取到可用文本（不强依赖 blockMap）
        const title = memoryPage?.title ? String(memoryPage.title) : ''
        const summary = memoryPage?.summary ? String(memoryPage.summary) : ''

        // 你也可以以后扩展成从 blockMap 抽全文
        const combined = [title, summary].filter(Boolean).join('\n')
        if (combined) memoryFromNotion = combined
      }
    } catch (e) {
      // 不要让 memory-core 失败影响对话
      // eslint-disable-next-line no-console
      console.warn('memory-core not loaded:', String(e))
    }

    const system = `
你是“茶色”的数字化人格助理。
目标：
- 尽可能理解茶色（不编造）
- 回答只讲重点和逻辑
- 对外回答保持专业、简洁、有判断
`.trim()

    const payload = {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: system },
        ...(memoryFromNotion
          ? [
              {
                role: 'system',
                content: `【茶色记忆核心（来自 Notion: memory-core）】\n${memoryFromNotion}`
              }
            ]
          : []),
        { role: 'user', content: String(message) }
      ]
    }

    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    })

    const text = await resp.text()

    // DeepSeek 可能返回非 JSON（比如报错页/网关错误）
    let data
    try {
      data = JSON.parse(text)
    } catch (e) {
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
