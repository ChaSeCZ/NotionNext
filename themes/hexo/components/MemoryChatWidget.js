import { useEffect, useMemo, useRef, useState } from 'react'

export default function MemoryChatWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // 对话上下文（连续）
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '你好，我是杨超哲。直接说事。' }
  ])

  // 可拖动位置
  const [pos, setPos] = useState({ x: 18, y: 64 })
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ mx: 0, my: 0, x: 0, y: 0 })

  // 永远在最上层 + 不被页面布局影响
  const zIndex = 999999

  const memorySlugs = useMemo(() => {
    // 你 Notion 里可能叫 memory / memory-core / memroy（你自己拼写也说过会乱）
    // 这里一次性都试：谁能读到就用谁
    return ['memory', 'memory-core', 'memroy']
  }, [])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const nextMsgs = [...messages, { role: 'user', content: text }]
    setMessages(nextMsgs)
    setInput('')
    setLoading(true)

    try {
      const resp = await fetch('/api/deepseek-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMsgs,
          memorySlugs
        })
      })

      const raw = await resp.text()

      // 后端必须返回 JSON；这里做容错显示，避免你看到“Unexpected end of JSON”
      let data = null
      try {
        data = raw ? JSON.parse(raw) : null
      } catch (e) {
        data = null
      }

      if (!resp.ok) {
        const errMsg =
          (data && (data.error || data.message)) ||
          `HTTP ${resp.status}\n(body="${raw || ''}")`
        setMessages(ms => [
          ...ms,
          { role: 'assistant', content: `【错误】${errMsg}` }
        ])
        return
      }

      const answer =
        (data && data.answer) ||
        (data && data.choices && data.choices[0]?.message?.content) ||
        '（空返回）'

      setMessages(ms => [...ms, { role: 'assistant', content: answer }])
    } catch (e) {
      setMessages(ms => [
        ...ms,
        { role: 'assistant', content: `【错误】${String(e)}` }
      ])
    } finally {
      setLoading(false)
    }
  }

  // Ctrl/Cmd+Enter 发送
  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      send()
    }
    if (e.key === 'Escape') setOpen(false)
  }

  // 自动滚到底
  const listRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, open])

  // 拖动：只允许拖 header
  function onMouseDownHeader(e) {
    draggingRef.current = true
    dragStartRef.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y }
    e.preventDefault()
  }
  useEffect(() => {
    function onMove(e) {
      if (!draggingRef.current) return
      const dx = e.clientX - dragStartRef.current.mx
      const dy = e.clientY - dragStartRef.current.my
      setPos({
        x: Math.max(8, dragStartRef.current.x + dx),
        y: Math.max(8, dragStartRef.current.y + dy)
      })
    }
    function onUp() {
      draggingRef.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [pos.x, pos.y])

  // 右下角按钮
  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed',
          right: 18,
          bottom: 18,
          zIndex,
          borderRadius: 999,
          padding: '10px 14px',
          background: 'rgba(0,0,0,0.75)',
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
            left: pos.x,
            top: pos.y,
            width: 720,
            maxWidth: 'calc(100vw - 16px)',
            height: 520,
            maxHeight: 'calc(100vh - 16px)',
            zIndex,
            background: '#fff',
            borderRadius: 18,
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            border: '1px solid rgba(0,0,0,0.10)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            // 关键：避免被父级 transform/stacking context 压住
            isolation: 'isolate'
          }}
        >
          {/* header：拖动区 */}
          <div
            onMouseDown={onMouseDownHeader}
            style={{
              padding: '14px 16px',
              fontWeight: 800,
              borderBottom: '1px solid rgba(0,0,0,0.08)',
              cursor: 'move',
              userSelect: 'none',
              display: 'flex',
              alignItems: 'baseline',
              gap: 10
            }}
          >
            <div style={{ fontSize: 22 }}>我正在狠狠回答</div>
            <div style={{ fontSize: 14, opacity: 0.65 }}>
              （拖动这里移动；Ctrl/Cmd+Enter 发送）
            </div>
          </div>

          {/* messages */}
          <div
            ref={listRef}
            style={{
              flex: 1,
              padding: 16,
              overflow: 'auto',
              background: '#fff'
            }}
          >
            {messages.map((m, idx) => {
              const isMe = m.role === 'user'
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: isMe ? 'flex-end' : 'flex-start',
                    marginBottom: 12
                  }}
                >
                  <div
                    style={{
                      maxWidth: '75%',
                      padding: '12px 14px',
                      borderRadius: 16,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      background: isMe ? '#111827' : '#f3f4f6',
                      color: isMe ? '#fff' : '#111',
                      border: '1px solid rgba(0,0,0,0.06)'
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              )
            })}
          </div>

          {/* input */}
          <div
            style={{
              padding: 14,
              borderTop: '1px solid rgba(0,0,0,0.08)',
              background: '#fff'
            }}
          >
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="输入问题…（Ctrl/Cmd+Enter 发送）"
              style={{
                width: '100%',
                height: 90,
                resize: 'none',
                borderRadius: 14,
                border: '1px solid rgba(0,0,0,0.14)',
                padding: 12,
                outline: 'none'
              }}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button
                onClick={send}
                disabled={loading}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  padding: '12px 14px',
                  background: '#111827',
                  color: '#fff',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  fontWeight: 700,
                  fontSize: 16
                }}
              >
                {loading ? '思考中…' : '发送'}
              </button>

              <button
                onClick={() => setMessages([{ role: 'assistant', content: '你好，我是杨超哲。直接说事。' }])}
                style={{
                  borderRadius: 14,
                  padding: '12px 14px',
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,0.18)',
                  cursor: 'pointer',
                  fontWeight: 700
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
