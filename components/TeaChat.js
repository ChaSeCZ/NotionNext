import { useState } from "react";

export default function TeaChat() {
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function askTea() {
    if (!input.trim()) return;

    setLoading(true);
    setAnswer("");

    try {
      const res = await fetch("/api/deepseek-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          memory: "我是杨超哲，我回答问题只讲重点和逻辑"
        })
      });

      const data = await res.json();
      setAnswer(data.answer || "没有返回内容");
    } catch (e) {
      setAnswer("出错了");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      border: "1px solid #ddd",
      padding: 16,
      borderRadius: 8,
      maxWidth: 600
    }}>
      <h3>问茶色</h3>

      <textarea
        rows={3}
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="想问什么？"
        style={{ width: "100%" }}
      />

      <button
        onClick={askTea}
        disabled={loading}
        style={{ marginTop: 8 }}
      >
        {loading ? "思考中…" : "提问"}
      </button>

      {answer && (
        <div style={{
          marginTop: 12,
          background: "#f7f7f7",
          padding: 12,
          borderRadius: 6
        }}>
          {answer}
        </div>
      )}
    </div>
  );
}
