import { useEffect, useRef, useState } from 'react'

export default function MemoryChatWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // 连续上下文
  const [chat, setChat] = useState([]) // [{role:'user'|'assistant', content:string}]

  // 拖动
  const [pos, setPos] = useState({ x: 18, y: 64 })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const posStart = useRef({ x: 0, y: 0 })

  // 你也可以不传 memory，让后端只读 Notion 的记忆
  // 这里留空，避免“你写了的固定记忆”覆盖 Notion 记忆
  const memoryText = ''

  async function send() {
    const q = input.trim()
    if (!q || loading) return

    const nextChat = [...chat, { role: 'user', content: q }]
    setChat(nextChat)
    setInput('')
    setLoading(true)

    try {
      const payload = {
        messages: nextChat.map(m => ({ role: m.role, content: m.content })),
        memory: memoryText
      }

      const r = await fetch('/api/deepseek-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const txt = await r.text()

      let data
      try {
        data = JSON.parse(txt)
      } catch {
        throw new Error(`API返回不是JSON\nHTTP ${r.status}\n(body=${txt || '""'})`)
      }

      // 你要确认有没有读到 Notion 记忆：看这里
      // 打开浏览器 console 会看到 memoryMeta
      if (data?.memoryMeta) {
        console.log('[memoryMeta]', data.memoryMeta)
      }

      if (!r.ok) {
        throw new Error(data?.error || `HTTP ${r.status}`)
      }

      const a = (data?.answer || '').trim()
      setChat(cur => [...cur, { role: 'assistant', content: a || '（无返回内容）' }])
    } catch (e) {
      setChat(cur => [
        ...cur,
        { role: 'assistant', content: `【错误】${String(e.message || e)}` }
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
  }

  // Esc 关闭
  useEffect(() => {
    const onEsc = e => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [])

  // 拖动：标题栏按下
  function onDragStart(e) {
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    posStart.current = { ...pos }
  }

  // 拖动：全局移动
  useEffect(() => {
    function onMove(e) {
      if (!dragging.current) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setPos({
        x: Math.max(8, posStart.current.x + dx),
        y: Math.max(8, posStart.current.y + dy)
      })
    }
    function onUp() {
      dragging.current = false
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
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed',
          right: 18,
          bottom: 18,
          zIndex: 2147483647,
          borderRadius: 999,
          padding: '10px 14px',
          background: 'rgba(0,0,0,0.6)',
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
            width: 520,
            maxWidth: 'calc(100vw - 16px)',
            height: 560,
            maxHeight: 'calc(100vh - 16px)',
            zIndex: 2147483647,
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 18px 50px rgba(0,0,0,0.22)',
            border: '1px solid rgba(0,0,0,0.08)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div
            onMouseDown={onDragStart}
            style={{
              padding: '12px 14px',
              fontWeight: 800,
              borderBottom: '1px solid rgba(0,0,0,0.08)',
              cursor: 'move',
              userSelect: 'none'
            }}
          >
            我正在狠狠回答
            <span style={{ fontWeight: 500, opacity: 0.6, marginLeft: 10, fontSize: 12 }}>
              （拖动这里移动；Ctrl/Cmd+Enter 发送）
            </span>
          </div>

          <div
            style={{
              padding: 14,
              flex: 1,
              overflow: 'auto',
              background: '#fafafa'
            }}
          >
            {chat.length === 0 && (
              <div style={{ opacity: 0.6, fontSize: 14 }}>
                输入问题开始对话（会保留上下文）
              </div>
            )}

            {chat.map((m, idx) => {
              const isMe = m.role === 'user'
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: isMe ? 'flex-end' : 'flex-start',
                    marginBottom: 10
                  }}
                >
                  <div
                    style={{
                      maxWidth: '78%',
                      padding: '10px 12px',
                      borderRadius: 14,
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.5,
                      background: isMe ? '#111827' : '#fff',
                      color: isMe ? '#fff' : '#111',
                      border: isMe ? 'none' : '1px solid rgba(0,0,0,0.10)',
                      boxShadow: isMe ? 'none' : '0 4px 16px rgba(0,0,0,0.06)'
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              )
            })}

            {loading && <div style={{ opacity: 0.7, fontSize: 14 }}>思考中…</div>}
          </div>

          <div style={{ padding: 14, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="输入问题…（Ctrl/Cmd+Enter 发送）"
              style={{
                width: '100%',
                height: 84,
                resize: 'none',
                borderRadius: 12,
                border: '1px solid rgba(0,0,0,0.12)',
                padding: 12,
                outline: 'none',
                background: '#fff'
              }}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button
                onClick={send}
                disabled={loading}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  padding: '12px 14px',
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
                onClick={() => setChat([])}
                style={{
                  borderRadius: 12,
                  padding: '12px 14px',
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
