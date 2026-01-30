// themes/hexo/components/MemoryChatWidget.js
import { useEffect, useRef, useState } from 'react'

export default function MemoryChatWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // ✅ 连续上下文：保存整段对话
  const [msgs, setMsgs] = useState([
    { role: 'assistant', content: '我在。直接说你的问题。' }
  ])

  // ✅ 可拖拽：保存位置
  const [pos, setPos] = useState({ right: 18, bottom: 64 })
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startRight: 18, startBottom: 64 })

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const nextMsgs = [...msgs, { role: 'user', content: text }]
    setMsgs(nextMsgs)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/deepseek-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMsgs })
      })

      const data = await res.json()
      const answer = data?.answer || data?.error || '（无返回）'
      setMsgs(m => [...m, { role: 'assistant', content: answer }])
    } catch (e) {
      setMsgs(m => [...m, { role: 'assistant', content: String(e) }])
    } finally {
      setLoading(false)
    }
  }

  // esc 关闭
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // 拖拽逻辑
  function onMouseDown(e) {
    dragRef.current.dragging = true
    dragRef.current.startX = e.clientX
    dragRef.current.startY = e.clientY
    dragRef.current.startRight = pos.right
    dragRef.current.startBottom = pos.bottom
  }

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current.dragging) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY

      // right/bottom 反向
      const newRight = Math.max(8, dragRef.current.startRight - dx)
      const newBottom = Math.max(8, dragRef.current.startBottom - dy)
      setPos({ right: newRight, bottom: newBottom })
    }
    function onUp() {
      dragRef.current.dragging = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [pos])

  return (
    <>
      {/* 右下角按钮 */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed',
          right: 18,
          bottom: 18,
          zIndex: 9999,
          borderRadius: 999,
          padding: '10px 14px',
          background: 'rgba(0,0,0,0.65)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.25)',
          cursor: 'pointer'
        }}
      >
        {open ? '关闭' : '问问茶色'}
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            right: pos.right,
            bottom: pos.bottom,
            width: 380,
            maxWidth: 'calc(100vw - 24px)',
            zIndex: 9999,
            background: '#fff',
            borderRadius: 14,
            boxShadow: '0 18px 50px rgba(0,0,0,0.22)',
            border: '1px solid rgba(0,0,0,0.08)',
            overflow: 'hidden'
          }}
        >
          {/* 顶部拖拽栏 */}
          <div
            onMouseDown={onMouseDown}
            style={{
              padding: '12px 14px',
              fontWeight: 800,
              borderBottom: '1px solid rgba(0,0,0,0.08)',
              cursor: 'move',
              userSelect: 'none'
            }}
            title="按住这里拖动"
          >
            我正在狠狠回答
          </div>

          {/* 对话区 */}
          <div style={{ padding: 12 }}>
            <div
              style={{
                background: '#f9fafb',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 10,
                padding: 10,
                maxHeight: 240,
                overflow: 'auto',
                fontSize: 13,
                lineHeight: 1.6
              }}
            >
              {msgs.map((m, idx) => (
                <div key={idx} style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, opacity: 0.7 }}>
                    {m.role === 'user' ? '你' : '我'}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                </div>
              ))}
              {loading && <div style={{ opacity: 0.6 }}>…思考中</div>}
            </div>

            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="输入问题…（Ctrl/⌘ + Enter 发送）"
              style={{
                width: '100%',
                height: 84,
                resize: 'none',
                borderRadius: 10,
                border: '1px solid rgba(0,0,0,0.12)',
                padding: 10,
                outline: 'none',
                marginTop: 10
              }}
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={send}
                disabled={loading}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  padding: '10px 12px',
                  background: '#111827',
                  color: '#fff',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? '思考中…' : '发送'}
              </button>

              <button
                onClick={() => setMsgs([{ role: 'assistant', content: '我在。直接说你的问题。' }])}
                style={{
                  borderRadius: 10,
                  padding: '10px 12px',
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,0.15)',
                  cursor: 'pointer'
                }}
              >
                清空
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
