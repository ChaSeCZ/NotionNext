import { getAllPosts } from '@/lib/notion'

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

  // ====== 1️⃣ 核心记忆（你写死的人格）======
  const coreMemory = (memory || '').trim()

  // ====== 2️⃣ 从文章生成记忆 ======
  let postMemory = ''
  try {
    const posts = await getAllPosts()
    postMemory = posts
      .filter(p => p.status === 'Published')
      .slice(0, 20)
      .map(p => `- ${p.title}${p.summary ? `：${p.summary}` : ''}`)
      .join('\n')
  } catch (e) {
    postMemory = ''
  }

  // ====== 3️⃣ 合并最终记忆 ======
  const finalMemory = [
    coreMemory ? `【核心记忆】\n${coreMemory}` : '',
    postMemory ? `【过往文章摘要】\n${postMemory}` : ''
  ].filter(Boolean).join('\n\n')

  // ====== 4️⃣ 给模型的最终输入 ======
  const userContent =
    (finalMemory ? `${finalMemory}\n\n` : '') +
    `【问题】\n${message}`

  // ====== 5️⃣ 调用 DeepSeek ======
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            '你是杨超哲（茶色）的数字化人格助理。你回答问题遵循：先结论，后理由，语言直接，不废话，不讨好。'
        },
        {
          role: 'user',
          content: userContent
        }
      ],
      temperature: 0.4
    })
  })

  const data = await resp.json()
  const answer =
    data?.choices?.[0]?.message?.content || JSON.stringify(data)

  return res.status(200).json({ answer })
}
