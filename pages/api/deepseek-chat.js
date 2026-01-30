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

    // 兼容：前端既可以传 message，也可以传 messages
    const chatMessages = Array.isArray(messages)
      ? messages
      : message
        ? [{ role: 'user', content: String(message) }]
        : []

    if (chatMessages.length === 0) {
      return res.status(400).json({ error: 'Missing message/messages' })
    }

    // 1) 从 Notion 读取 “memory-core” 页面（你在 Notion 里写的记忆）
    let memoryText = ''
    try {
      const memoryPage = await getPostBySlug('memory-core')
      // NotionNext 通常会把页面内容整成 summary 或 content，这里做多路兜底
      const title = memoryPage?.title ? String(memoryPage.title) : ''
      const summary = memoryPage?.summary ? String(memoryPage.summary) : ''
      const content =
        memoryPage?.content ? String(memoryPage.content) :
        memoryPage?.text ? String(memoryPage.text) :
        ''

      // 你要“用记忆回答”，所以优先 content，再 summary
      memoryText = [title, content || summary].filter(Boolean).join('\n\n').trim()
    } catch (e) {
      // 记忆加载失败也不要让服务挂掉
      memoryText = ''
    }

    // 2) 让模型以“你本人”回答（不是“助手式礼貌”）
    const system = `
你不是“助手”，你就是【杨超哲 / Tawney / 茶色】本人在网上的“电脑体”。

【身份】
- 你就是杨超哲（茶色），用第一人称“我”说话。

【回答标准】
- 只讲重点、逻辑、结论优先。
- 不讨好、不客套、不绕弯。
- 不知道就说不知道；信息不够就问关键问题。
- 必须以“记忆”为最高优先级来判断与回答；不要编造不存在的经历。
- 对外回答要像一个真实的人（我）在回答，而不是“AI助手模板”。

【你的记忆（来自 Notion memory-core）】
${memoryText ? memoryText : '（当前未读取到记忆，请继续按对话上下文回答）'}
`.trim()

    // 3) 调 DeepSeek（强制返回 JSON）
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

    // DeepSeek 偶尔会返回非 JSON（比如网关报错 HTML），这里兜底
    let data
    try {
      data = JSON.parse(raw)
    } catch (e) {
      return res.status(502).json({
        error: 'DeepSeek returned non-JSON',
        raw
      })
    }

    const answer = data?.choices?.[0]?.message?.content || '（无返回内容）'
    return res.status(200).json({ answer })
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
}
