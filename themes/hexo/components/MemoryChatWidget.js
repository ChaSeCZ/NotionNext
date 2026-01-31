import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function MemoryChatWidget() {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // 对话上下文（连续）
  const [messages, setMessages] = useState([]) // [{role:'user'|'assistant', content:string}]

  // 拖动位置（持久化）
  const defaultPos = useMemo(() => {
    try {
      const s = localStorage.getItem('memory_chat_pos')
      if (s) return JSON.parse(s)
    } catch {}
    return { x: null, y: null } // null 表示用右下角默认定位
  }, [])

  const [pos, setPos] = useState(defaultPos)

  const draggingRef = useRef(false)
  const dragOffsetRef = useRef({ dx: 0, dy: 0 })
  const panelRef = useRef(null)

  useEffect(() => {
    setMounted(true)
  }, [])

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

  // 拖动逻辑（Pointer Events）
  function onPointerDown(e) {
    // 只允许从标题栏拖动
    draggingRef.current = true
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()

    // 计算鼠标点到面板左上角的偏移
    dragOffsetRef.current = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top
    }

    // 捕获指针
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

    const panelRect = panel.getBoundingClientRect()
    const width = panelRect.width
    const height = panelRect.height

    let x = e.clientX - dragOffsetRef.current.dx
    let y = e.clientY - dragOffsetRef.current.dy

    // 限制不拖出屏幕
    x = Math.max(8, Math.min(x, w - width - 8))
    y = Math.max(8, Math.min(y, h - height - 8))

    setPos({ x, y })
  }

  function onPointerUp() {
    draggingRef.current = false
  }

  async function safeReadJson(res) {
    const text = await res.text()
    try {
      return { ok: true, json: JSON.parse(text) }
    } catch {
      return { ok: false, raw: text }
    }
  }

  async function send() {
    const content = input.trim()
    if (!content || loading) return

    setLoading(true)
    setInput('')

    // 先把用户消息塞进上下文
    const nextMsgs = [...messages, { role: 'user', content }]
    setMessages(nextMsgs)

    try {
      const res = await fetch('/api/deepseek-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // 连续对话就靠这个 messages
          messages: nextMsgs
        })
      })

      const parsed = await safeReadJson(res)

      if (!parsed.ok) {
        setMessages(m => [
          ...m,
          {
            role: 'assistant',
            content: `【错误】Error: API返回不是JSON：\n${parsed.raw || ''}`
          }
        ])
        return
      }

      const data = parsed.json
      if (!res.ok) {
        setMessages(m => [
          ...m,
          {
            role: 'assistant',
            content:
              `【错误】${data?.error || '请求失败'}\n` +
              (data?.raw ? `\n${String(data.raw).slice(0, 2000)}` : '')
          }
        ])
        return
      }

      setMessages(m => [
        ...m,
        { role: 'assistant', content: data?.answer || '（无返回内容）' }
      ])
    } catch (e) {
      setMessages(m => [
        ...m,
        { role: 'assistant', content: `【错误】${String(e)}` }
      ])
    } finally {
      setLoading(false)
    }
  }

  function clearAll() {
    setMessages([])
    setInput('')
  }

  function onKeyDown(e) {
    // Ctrl/Cmd + Enter 发送；Enter 默认换行（避免你打字被误发）
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      send()
    }
  }

  const panelStyle = {
    position: 'fixed',
    // 用 pos.x/pos.y 拖动定位；否则默认右下角
    right: pos.x == null ? 18 : 'auto',
    bottom: pos.y == null ? 72 : 'auto',
    left: pos.x != null ? pos.x : 'auto',
    top: pos.y != null ? pos.y : 'auto',

    width: 380,
    maxWidth: 'calc(100vw - 24px)',
    height: 520,
    maxHeight: 'calc(100vh - 24px)',

    zIndex: 2147483647, // 彻底置顶，避免被任何框架盖住
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
      {/* 右下角按钮 */}
      <button onClick={() => setOpen(v => !v)} style={btnStyle}>
        {open ? '关闭' : '问问茶色'}
      </button>

      {/* 弹窗 */}
      {open && (
        <div ref={panelRef} style={panelStyle}>
          {/* 可拖动标题栏 */}
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

          {/* 消息区 */}
          <div
            style={{
              padding: 12,
              overflow: 'auto',
              flex: 1,
              background: '#fafafa'
            }}
          >
            {messages.length === 0 && (
              <div style={{ opacity: 0.55, fontSize: 13, lineHeight: 1.6 }}>
                你可以直接问。这个窗口会带着上下文连续对话。
              </div>
            )}

            {messages.map((m, idx) => {
              const isUser = m.role === 'user'
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                    marginTop: 10
                  }}
                >
                  <div
                    style={{
                      maxWidth: '78%',
                      padding: '10px 12px',
                      borderRadius: 14,
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.55,
                      fontSize: 14,
                      background: isUser ? '#111827' : '#fff',
                      color: isUser ? '#fff' : '#111',
                      border: isUser ? 'none' : '1px solid rgba(0,0,0,0.08)',
                      boxShadow: isUser ? '0 10px 30px rgba(17,24,39,0.25)' : 'none'
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              )
            })}

            {loading && (
              <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>
                思考中…
              </div>
            )}
          </div>

          {/* 输入区 */}
          <div
            style={{
              padding: 10,
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
                height: 72,
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

  // 关键：Portal 到 body，避免被某些父容器 transform/overflow 盖住
  if (!mounted) return null
  return createPortal(ui, document.body)
}
