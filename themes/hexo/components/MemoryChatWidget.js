import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function MemoryChatWidget() {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // 连续上下文
  const [messages, setMessages] = useState([]) // [{role:'user'|'assistant', content:string}]

  // 拖动位置（持久化）
  const defaultPos = useMemo(() => {
    try {
      const s = localStorage.getItem('memory_chat_pos')
      if (s) return JSON.parse(s)
    } catch {}
    return { x: null, y: null }
  }, [])
  const [pos, setPos] = useState(defaultPos)

  const draggingRef = useRef(false)
  const dragOffsetRef = useRef({ dx: 0, dy: 0 })
  const panelRef = useRef(null)

  useEffect(() => setMounted(true), [])

  // esc 关闭
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 保存位置
  useEffect(() => {
    if (!mounted) return
    try {
      localStorage.setItem('memory_chat_pos', JSON.stringify(pos))
    } catch {}
  }, [pos, mounted])

  function onPointerDown(e) {
    draggingRef.current = true
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragOffsetRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
  }
  function onPointerMove(e) {
    if (!draggingRef.current) return
    const panel = panelRef.current
    if (!panel) return

    const w = window.innerWidth
    const h = window.innerHeight
    const rect = panel.getBoundingClientRect()

    let x = e.clientX - dragOffsetRef.current.dx
    let y = e.clientY - dragOffsetRef.current.dy

    x = Math.max(8, Math.min(x, w - rect.width - 8))
    y = Math.max(8, Math.min(y, h - rect.height - 8))

    setPos({ x, y })
  }
  function onPointerUp() {
    draggingRef.current = false
  }

  async function readBodyAlways(res) {
    // 一律先读 text，再尝试 json
    const text = await res.text()
    if (!text) {
      return { ok: false, empty: true, raw: '', status: res.status, statusText: res.statusText }
    }
    try {
      return { ok: true, json: JSON.parse(text), raw: text, status: res.status, statusText: res.statusText }
    } catch {
      return { ok: false, empty: false, raw: text, status: res.status, statusText: res.statusText }
    }
  }

  async function send() {
    const content = input.trim()
    if (!content || loading) return

    setLoading(true)
    setInput('')

    const nextMsgs = [...messages, { role: 'user', content }]
    setMessages(nextMsgs)

    try {
      const res = await fetch('/api/deepseek-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMsgs })
      })

      const parsed = await readBodyAlways(res)

      // 任何非 JSON/空响应：直接把状态码+原文打印出来
      if (!parsed.ok) {
        const rawText =
          parsed.empty
            ? '（空响应 body=""）'
            : String(parsed.raw).slice(0, 3000)

        setMessages(m => [
          ...m,
          {
            role: 'assistant',
            content:
              `【错误】API返回不是JSON\n` +
              `HTTP ${parsed.status} ${parsed.statusText}\n` +
              rawText
          }
        ])
        return
      }

      // JSON 但非 2xx
      if (!res.ok) {
        setMessages(m => [
          ...m,
          {
            role: 'assistant',
            content:
              `【错误】HTTP ${parsed.status} ${parsed.statusText}\n` +
              (parsed.json?.error ? String(parsed.json.error) : JSON.stringify(parsed.json))
          }
        ])
        return
      }

      const answer = parsed.json?.answer || '（无返回内容）'
      setMessages(m => [...m, { role: 'assistant', content: answer }])
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: `【错误】${String(e)}` }])
    } finally {
      setLoading(false)
    }
  }

  function clearAll() {
    setMessages([])
    setInput('')
  }

  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      send()
    }
  }

  const panelStyle = {
    position: 'fixed',
    right: pos.x == null ? 18 : 'auto',
    bottom: pos.y == null ? 72 : 'auto',
    left: pos.x != null ? pos.x : 'auto',
    top: pos.y != null ? pos.y : 'auto',

    width: 420,
    maxWidth: 'calc(100vw - 24px)',
    height: 560,
    maxHeight: 'calc(100vh - 24px)',

    zIndex: 2147483647,
    background: '#fff',
    borderRadius: 14,
    boxShadow: '0 18px 50px rgba(0,0,0,0.22)',
    border: '1px solid rgba(0,0,0,0.10)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  }

  const btnStyle = {
    position: 'fixed',
    right: 18,
    bottom: 18,
    zIndex: 2147483647,
    borderRadius: 999,
    padding: '10px 14px',
    background: 'rgba(0,0,0,0.70)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.25)',
    cursor: 'pointer'
  }

  const ui = (
    <>
      <button onClick={() => setOpen(v => !v)} style={btnStyle}>
        {open ? '关闭' : '问问茶色'}
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle}>
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{
              padding: '10px 12px',
              fontWeight: 800,
              borderBottom: '1px solid rgba(0,0,0,0.08)',
              cursor: 'grab',
              userSelect: 'none',
              background: '#fff'
            }}
          >
            我正在狠狠回答
            <span style={{ fontWeight: 500, marginLeft: 8, fontSize: 12, opacity: 0.6 }}>
              （拖动这里移动；Ctrl/Cmd+Enter 发送）
            </span>
          </div>

          <div style={{ padding: 12, overflow: 'auto', flex: 1, background: '#fafafa' }}>
            {messages.map((m, idx) => {
              const isUser = m.role === 'user'
              return (
                <div
                  key={idx}
                  style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginTop: 10 }}
                >
                  <div
                    style={{
                      maxWidth: '80%',
                      padding: '10px 12px',
                      borderRadius: 14,
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.55,
                      fontSize: 14,
                      background: isUser ? '#111827' : '#fff',
                      color: isUser ? '#fff' : '#111',
                      border: isUser ? 'none' : '1px solid rgba(0,0,0,0.08)'
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              )
            })}

            {loading && <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>思考中…</div>}
          </div>

          <div style={{ padding: 10, borderTop: '1px solid rgba(0,0,0,0.08)', background: '#fff' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="输入问题…（Ctrl/Cmd+Enter 发送）"
              style={{
                width: '100%',
                height: 80,
                resize: 'none',
                borderRadius: 10,
                border: '1px solid rgba(0,0,0,0.12)',
                padding: 10,
                outline: 'none'
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
                onClick={clearAll}
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

  if (!mounted) return null
  return createPortal(ui, document.body)
}
