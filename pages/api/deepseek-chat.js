export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing DEEPSEEK_API_KEY in Vercel env" });
    }

    const { message, memory } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    // 你的网站“记忆核心”内容（可从 /memory-core 复制粘贴一段进来，也可以先留空）
    const system = `你是“茶色 的数字化人格助理”。
目标：
1) 尽可能了解 茶色（但不要编造）。
2) 作为他的电脑体，对外回答问题，语气专业、简洁、有条理。
如果用户问题与记忆冲突，以记忆为准。
`;

    const userContent =
      (memory ? `【记忆】\n${memory}\n\n` : "") +
      `【问题】\n${message}`;

    // DeepSeek：OpenAI 兼容接口写法（你当前 Python 里也用过 base_url 这种）
    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent }
        ],
        temperature: 0.4
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: data });
    }

    const answer = data?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ answer });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
