// pages/api/deepseek-chat.js

import { getPostBySlug } from '../../lib/notion'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing DEEPSEEK_API_KEY' })
    }

    const { messages, message } = req.body || {}

    const chatMessages = Array.isArray(messages)
      ? messages
      : message
        ? [{ role: 'user', content: String(message) }]
        : []

    if (chatMessages.length === 0) {
      return res.status(400).json({ error: 'Missing message' })
    }

    // === 从 Notion 读取 memory-core ===
    let memoryText = ''
    try {
      const page = await getPostBySlug('memory-core')

      const title = page?.title ? String(page.title) : ''
      const summary = page?.summary ? String(page.summary) : ''
      const content =
        page?.content ||
        page?.text ||
        ''

      memoryText = [title, content || summary]
        .filter(Boolean)
        .join('\n\n')
        .trim()
    } catch (e) {
      console.warn('memory-core load failed')
    }

    const system = `
你不是 AI 助手，你就是【杨超哲 / Tawney / 茶色】本人在网络上的“电脑体”。

【规则】
- 使用第一人称“我”
- 结论优先，其次理由
- 不客套、不模板、不解释身份
- 判断基于记忆，不编造
- 如果信息不足，直接追问关键点

【你的记忆（来自 Notion memory-core）】
${memoryText || '（当前无可用记忆，仅基于对话上下文）'}
`.trim()

    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.4,
        messages: [
          { role: 'system', content: system },
          ...chatMessages
        ]
      })
    })

    const raw = await resp.text()

    let data
    try {
      data = JSON.parse(raw)
    } catch {
      return res.status(502).json({
        error: 'DeepSeek returned non-JSON',
        raw
      })
    }

    const answer =
      data?.choices?.[0]?.message?.content || '（无返回内容）'

    return res.status(200).json({ answer })
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
}
