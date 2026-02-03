import { useEffect, useMemo, useRef, useState } from 'react'

const Z = 2147483647

export default function MemoryChatWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // 聊天记录：role = 'user' | 'assistant'
  const [msgs, setMsgs] = useState([
    { role: 'assistant', content: '你好，我是杨超哲，也可以叫我茶色。你想聊什么？' }
  ])

  // 位置（可拖动）
  const boxW = 860
  const boxH = 560
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragRef = useRef({ dragging: false, sx: 0, sy: 0, ox: 0, oy: 0 })

  const containerRef = useRef(null)
  const listRef = useRef(null)

  // 初始化放在右上角（最上面）
  useEffect(() => {
    const init = () => {
      const vw = window.innerWidth
      const x = Math.max(12, vw - Math.min(boxW, vw - 24) - 12)
      const y = 12
      setPos({ x, y })
    }
    init()
    window.addEventListener('resize', init)
    return () => window.removeEventListener('resize', init)
  }, [])

  // 自动滚到底
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [msgs, open])

  // ESC 关闭
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 拖动逻辑
  useEffect(() => {
    const onMove = e => {
      if (!dragRef.current.dragging) return
      const dx = e.clientX - dragRef.current.sx
      const dy = e.clientY - dragRef.current.sy
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = Math.min(boxW, vw - 24)
      const h = Math.min(boxH, vh - 24)
      const nx = Math.min(Math.max(12, dragRef.current.ox + dx), vw - w - 12)
      const ny = Math.min(Math.max(12, dragRef.current.oy + dy), vh - h - 12)
      setPos({ x: nx, y: ny })
    }
    const onUp = () => {
      dragRef.current.dragging = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const apiHistory = useMemo(() => {
    // 转成 API 需要的 {role, content}，限制长度防爆
    return msgs
      .slice(-16)
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
  }, [msgs])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setLoading(true)

    // 先把用户消息入栈
    setMsgs(prev => [...prev, { role: 'user', content: text }])

    try {
      const resp = await fetch('/api/deepseek-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: apiHistory // ✅ 连续对话上下文
        })
      })

      // 任何错误也要读文本，避免 JSON 崩
      const raw = await resp.text()

      let data = null
      try {
        data = JSON.parse(raw)
      } catch (e) {
        throw new Error(`API返回不是JSON\nHTTP ${resp.status}\n(body="${raw || ''}")`)
      }

      if (!resp.ok || !data?.ok) {
        const msg = data?.error || `HTTP ${resp.status}`
        throw new Error(msg)
      }

      const answer = data?.answer || '（无返回内容）'
      setMsgs(prev => [...prev, { role: 'assistant', content: answer }])
    } catch (e) {
      setMsgs(prev => [
        ...prev,
        { role: 'assistant', content: `【错误】${String(e.message || e)}` }
      ])
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e) {
    // Ctrl/Cmd + Enter 发送
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      {/* 右下角按钮 */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed',
          right: 18,
          bottom: 18,
          zIndex: Z,
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

      {!open ? null : (
        <div
          ref={containerRef}
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            zIndex: Z,
            width: boxW,
            maxWidth: 'calc(100vw - 24px)',
            height: boxH,
            maxHeight: 'calc(100vh - 24px)',
            background: '#fff',
            borderRadius: 18,
            boxShadow: '0 22px 70px rgba(0,0,0,0.28)',
            border: '1px solid rgba(0,0,0,0.10)',
            overflow: 'hidden'
          }}
        >
          {/* 顶部栏（拖动区域） */}
          <div
            onMouseDown={e => {
              dragRef.current.dragging = true
              dragRef.current.sx = e.clientX
              dragRef.current.sy = e.clientY
              dragRef.current.ox = pos.x
              dragRef.current.oy = pos.y
            }}
            style={{
              padding: '14px 16px',
              fontWeight: 900,
              fontSize: 26,
              borderBottom: '1px solid rgba(0,0,0,0.08)',
              cursor: 'move',
              userSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}
          >
            我正在狠狠回答
            <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.55 }}>
              （拖动这里移动；Ctrl/Cmd+Enter 发送）
            </span>
          </div>

          {/* 消息区 */}
          <div
            ref={listRef}
            style={{
              height: 'calc(100% - 14px - 52px - 140px)',
              padding: 16,
              overflow: 'auto',
              background: '#fff'
            }}
          >
            {msgs.map((m, idx) => {
              const isUser = m.role === 'user'
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                    marginBottom: 14
                  }}
                >
                  <div
                    style={{
                      maxWidth: '78%',
                      padding: '14px 16px',
                      borderRadius: 16,
                      lineHeight: 1.45,
                      fontSize: 18,
                      whiteSpace: 'pre-wrap',
                      background: isUser ? '#0b1220' : '#f4f6f8',
                      color: isUser ? '#fff' : '#111',
                      border: isUser ? 'none' : '1px solid rgba(0,0,0,0.08)'
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 输入区 */}
          <div style={{ padding: 16, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
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
                border: '1px solid rgba(0,0,0,0.12)',
                padding: 12,
                outline: 'none',
                fontSize: 18
              }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                onClick={send}
                disabled={loading}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  padding: '12px 14px',
                  background: '#0b1220',
                  color: '#fff',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.75 : 1,
                  fontSize: 18,
                  fontWeight: 800
                }}
              >
                {loading ? '思考中…' : '发送'}
              </button>

              <button
                onClick={() => {
                  setInput('')
                  setMsgs([{ role: 'assistant', content: '你好，我是杨超哲，也可以叫我茶色。你想聊什么？' }])
                }}
                style={{
                  width: 92,
                  borderRadius: 14,
                  padding: '12px 14px',
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,0.15)',
                  cursor: 'pointer',
                  fontSize: 18,
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
