import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function MemoryChatWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // ✅ 对话上下文（连续）
  const [history, setHistory] = useState([]) // [{role:'user'|'assistant', content:string}]

  // ✅ 拖动 & 置顶
  const [pos, setPos] = useState({ x: 24, y: 24 })
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const panelRef = useRef(null)

  const canUseDOM = typeof window !== 'undefined' && typeof document !== 'undefined'

  const zStyle = useMemo(
    () => ({
      position: 'fixed',
      left: pos.x,
      top: pos.y,
      width: 760,
      maxWidth: 'calc(100vw - 48px)',
      height: 560,
      maxHeight: 'calc(100vh - 48px)',
      zIndex: 2147483647, // ✅ 永远置顶
      background: '#fff',
      borderRadius: 18,
      boxShadow: '0 20px 70px rgba(0,0,0,0.28)',
      border: '1px solid rgba(0,0,0,0.10)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      isolation: 'isolate' // ✅ 避免被别的层叠上下文压住
    }),
    [pos.x, pos.y]
  )

  function onMouseDownHeader(e) {
    dragging.current = true
    const rect = panelRef.current?.getBoundingClientRect()
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    } else {
      dragOffset.current = { x: 0, y: 0 }
    }
    e.preventDefault()
  }

  useEffect(() => {
    if (!canUseDOM) return
    const onMove = e => {
      if (!dragging.current) return
      const x = Math.max(8, Math.min(window.innerWidth - 320, e.clientX - dragOffset.current.x))
      const y = Math.max(8, Math.min(window.innerHeight - 120, e.clientY - dragOffset.current.y))
      setPos({ x, y })
    }
    const onUp = () => {
      dragging.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [canUseDOM])

  // esc 关闭
  useEffect(() => {
    if (!canUseDOM) return
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canUseDOM])

  async function send() {
    const msg = input.trim()
    if (!msg || loading) return

    setLoading(true)
    setInput('')

    // 先把 user 写入 history
    const nextHistory = [...history, { role: 'user', content: msg }]
    setHistory(nextHistory)

    try {
      const r = await fetch('/api/deepseek-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: nextHistory.filter(x => x.role === 'user' || x.role === 'assistant').slice(-12)
        })
      })

      const text = await r.text()

      let data = null
      try {
        data = JSON.parse(text)
      } catch (e) {
        // API 不返回 JSON 时，直接显示原文
        setHistory(h => [
          ...h,
          {
            role: 'assistant',
            content: `【错误】API返回不是JSON\nHTTP ${r.status}\n(body=${JSON.stringify(text.slice(0, 500))})`
          }
        ])
        return
      }

      if (!r.ok || !data?.ok) {
        setHistory(h => [
          ...h,
          {
            role: 'assistant',
            content: `【错误】${data?.error || '请求失败'}\nHTTP ${r.status}\n${data?.raw ? data.raw.slice(0, 500) : ''}`
          }
        ])
        return
      }

      const answer = data?.answer || '（无返回内容）'
      setHistory(h => [...h, { role: 'assistant', content: answer }])
    } catch (e) {
      setHistory(h => [...h, { role: 'assistant', content: `【错误】${String(e)}` }])
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e) {
    const isEnter = e.key === 'Enter'
    const withCmd = e.metaKey || e.ctrlKey
    if (isEnter && withCmd) {
      e.preventDefault()
      send()
    }
  }

  const ui = (
    <>
      {/* 右下角按钮 */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed',
          right: 18,
          bottom: 18,
          zIndex: 2147483647,
          borderRadius: 999,
          padding: '10px 14px',
          background: 'rgba(0,0,0,0.68)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.25)',
          cursor: 'pointer'
        }}
      >
        {open ? '关闭' : '问问茶色'}
      </button>

      {open && (
        <div ref={panelRef} style={zStyle}>
          {/* 顶部可拖动标题栏 */}
          <div
            onMouseDown={onMouseDownHeader}
            style={{
              padding: '14px 16px',
              fontWeight: 900,
              borderBottom: '1px solid rgba(0,0,0,0.08)',
              cursor: 'move',
              userSelect: 'none',
              display: 'flex',
              alignItems: 'baseline',
              gap: 12
            }}
          >
            <div style={{ fontSize: 22 }}>我正在狠狠回答</div>
            <div style={{ opacity: 0.55, fontSize: 14 }}>
              （拖动这里移动；Ctrl/Cmd+Enter 发送）
            </div>
          </div>

          {/* 对话区 */}
          <div
            style={{
              flex: 1,
              padding: 16,
              overflow: 'auto',
              background: '#fff'
            }}
          >
            {history.length === 0 && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: '#f3f4f6',
                  color: '#111',
                  maxWidth: 520,
                  lineHeight: 1.5
                }}
              >
                你好，我是杨超哲，也可以叫我茶色。你想问什么？
              </div>
            )}

            {history.map((m, idx) => {
              const isMe = m.role === 'user'
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: isMe ? 'flex-end' : 'flex-start',
                    marginTop: 10
                  }}
                >
                  <div
                    style={{
                      maxWidth: '78%',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.6,
                      padding: '10px 12px',
                      borderRadius: 14,
                      background: isMe ? '#111827' : '#f3f4f6',
                      color: isMe ? '#fff' : '#111',
                      border: isMe ? 'none' : '1px solid rgba(0,0,0,0.06)'
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
                borderRadius: 12,
                border: '1px solid rgba(0,0,0,0.12)',
                padding: 12,
                outline: 'none'
              }}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
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
                  opacity: loading ? 0.7 : 1,
                  fontWeight: 800
                }}
              >
                {loading ? '思考中…' : '发送'}
              </button>

              <button
                onClick={() => setHistory([])}
                style={{
                  borderRadius: 12,
                  padding: '12px 14px',
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,0.15)',
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

  // ✅ Portal 到 body，彻底避免被 Hero / 其它容器层叠、overflow、z-index 卡住
  if (!canUseDOM) return null
  return createPortal(ui, document.body)
}
