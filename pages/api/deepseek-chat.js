// pages/api/deepseek-chat.js

import getNotionPost from '../../lib/notion/getNotionPost'
import getPageContentText from '../../lib/notion/getPageContentText'

export default async function handler(req, res) {
  // ====== CORS + 预检（解决 405）======
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end('')
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing DEEPSEEK_API_KEY' })
    }

    const { message, history } = req.body || {}
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Missing message' })
    }

    // ====== 从 Notion 读取记忆（用 pageId 最稳）======
    const memoryPageId = process.env.MEMORY_PAGE_ID // 例如：d7e96987-c91f-409f-8df5-0a8ff8c7e7a7
    let memoryText = ''

    if (memoryPageId) {
      try {
        const memoryPost = await getNotionPost(memoryPageId)
        // getPageContentText 一般接受 blockMap；如果你这仓库实现不同，也不会影响整体（下面兜底）
        if (memoryPost?.blockMap) {
          const bodyText = await getPageContentText(memoryPost.blockMap)
          memoryText = `${memoryPost?.title || '记忆'}\n\n${bodyText || ''}`.trim()
        } else {
          memoryText = `${memoryPost?.title || ''}\n${memoryPost?.summary || ''}`.trim()
        }
      } catch (e) {
        memoryText = ''
      }
    }

    // ====== 系统提示词：拟人化 + INTJ 直接但有礼貌 + 禁止编造 ======
    const system = `
你现在扮演：杨超哲（Tawney / 茶色）本人，而不是“助手”。

【身份与语气】
- 说人话：直接、清晰、有判断，但不粗鲁、不阴阳怪气。
- 像真人聊天：自然、简短、有礼貌，不要“模板腔”。

【核心规则（重要）】
- 只能基于【记忆】与对话上下文回答；记忆里没有的内容，必须明确说“不知道/记忆里没写”，并可反问一个关键问题澄清。
- 严禁编造经历、时间线、细节、童年回忆等。
- 输出结构：先结论一句话，再补1-3句理由（除非用户只是在打招呼）。

【你要完成两件事】
1) 尽可能理解我（但不编造）。
2) 作为我的“电脑体”，替我对外回答问题：专业、简洁、有判断。
`.trim()

    // ====== 组装 messages（支持上下文 history）======
    const msgs = [{ role: 'system', content: system }]

    if (memoryText) {
      msgs.push({
        role: 'system',
        content: `【记忆（来自 Notion）】\n${memoryText}`
      })
    } else {
      msgs.push({
        role: 'system',
        content:
          '【记忆（来自 Notion）】\n（当前未读取到记忆内容；请严格避免编造。）'
      })
    }

    // history 由前端传：[{role:'user'|'assistant', content:'...'}]
    if (Array.isArray(history) && history.length) {
      for (const m of history.slice(-20)) {
        if (!m?.role || !m?.content) continue
        const role = m.role === 'assistant' ? 'assistant' : 'user'
        msgs.push({ role, content: String(m.content) })
      }
    }

    msgs.push({ role: 'user', content: String(message) })

    // ====== 调 DeepSeek ======
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: msgs,
        temperature: 0.4 // 更稳，减少乱编
      })
    })

    const rawText = await resp.text()

    // 无论 DeepSeek 返回啥，都保证我们返回 JSON
    let data
    try {
      data = JSON.parse(rawText)
    } catch (e) {
      return res.status(502).json({
        error: 'DeepSeek returned non-JSON',
        status: resp.status,
        raw: rawText?.slice?.(0, 2000) || ''
      })
    }

    const answer = data?.choices?.[0]?.message?.content || '（无返回内容）'
    return res.status(200).json({
      answer,
      meta: {
        memoryLoaded: Boolean(memoryText),
        memoryChars: memoryText ? memoryText.length : 0
      }
    })
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
}
