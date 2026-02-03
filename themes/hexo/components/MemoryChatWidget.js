// themes/hexo/components/MemoryChatWidget.js

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function MemoryChatWidget() {
  const [mounted, setMounted] = useState(false)
  const [portalEl, setPortalEl] = useState(null)

  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // ✅ 连续对话上下文
  const [chat, setChat] = useState([
    {
      role: 'assistant',
      content: '你好，我是杨超哲，也可以叫我茶色。你想聊什么？'
    }
  ])

  // ✅ 位置（可拖动）
  const [pos, setPos] = useState({ x: 24, y: 24 })
  const draggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const panelStyle = useMemo(
    () => ({
      position: 'fixed',
      left: pos.x,
      top: pos.y,
      width: 720,
      maxWidth: 'calc(100vw - 48px)',
      height: 520,
      maxHeight: 'calc(100vh - 48px)',
      zIndex: 2147483647, // ✅ 永远最顶
      background: '#fff',
      borderRadius: 18,
      boxShadow: '0 24px 80px rgba(0,0,0,0.30)',
      border: '1px solid rgba(0,0,0,0.08)',
      overflow: 'hidden'
    }),
    [pos.x, pos.y]
  )

  // ✅ Portal：不管你把组件放在哪，最终都挂到 body 顶层
  useEffect(() => {
    setMounted(true)
    const el = document.createElement('div')
    el.id = 'memory-chat-portal'
    document.body.appendChild(el)
    setPortalEl(el)
    return () => {
      try {
        document.body.removeChild(el)
      } catch {}
    }
  }, [])

  // esc 关闭
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ✅ 拖动逻辑：只拖标题栏
  function onMouseDownHeader(e) {
    draggingRef.current = true
    dragOffsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }
  useEffect(() => {
    function onMove(e) {
      if (!draggingRef.current) return
      const nx = e.clientX - dragOffsetRef.current.x
      const ny = e.clientY - dragOffsetRef.current.y
      const margin = 12
      const maxX = window.innerWidth - margin
      const maxY = window.innerHeight - margin
      setPos({
        x: Math.min(Math.max(nx, margin), maxX),
        y: Math.min(Math.max(ny, margin), maxY)
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

  function buildHistoryForApi(nextUserMsg) {
    // 取最近 12 轮（user/assistant）
    const sliced = chat.slice(-24).map(m => ({
      role: m.role,
      content: m.content
    }))
    // 最后再加本次 user
    return [...sliced, { role: 'user', content: nextUserMsg }]
  }

  async function send() {
    const msg = String(input || '').trim()
    if (!msg || loading) return

    // 先把 user 消息入栈
    setChat(prev => [...prev, { role: 'user', content: msg }])
    setInput('')
    setLoading(true)

    try {
      const history = buildHistoryForApi(msg)

      const r = await fetch('/api/deepseek-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history
        })
      })

      const text = await r.text()
      let data = null
      try {
        data = JSON.parse(text)
      } catch {
        setChat(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `【错误】API返回不是JSON\nHTTP ${r.status}\n(body=${JSON.stringify(
              text
            ).slice(0, 400)})`
          }
        ])
        return
      }

      if (data?.error) {
        setChat(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `【错误】${data.error}\n${
              data?.debug ? JSON.stringify(data.debug, null, 2) : ''
            }`
          }
        ])
        return
      }

      setChat(prev => [
        ...prev,
        { role: 'assistant', content: data?.answer || '（无返回）' }
      ])
    } catch (e) {
      setChat(prev => [
        ...prev,
        { role: 'assistant', content: `【错误】${String(e)}` }
      ])
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e) {
    const isSend =
      (e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.keyCode === 13)
    if (isSend) {
      e.preventDefault()
      send()
    }
  }

  const ui = (
    <>
      {/* 右下角按钮（不改你已有东西） */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed',
          right: 18,
          bottom: 18,
          zIndex: 2147483647,
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
        <div style={panelStyle}>
          {/* 顶栏：拖动这里 */}
          <div
            onMouseDown={onMouseDownHeader}
            style={{
              padding: '14px 16px',
              fontWeight: 900,
              fontSize: 22,
              borderBottom: '1px solid rgba(0,0,0,0.08)',
              cursor: 'move',
              userSelect: 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>我正在狠狠回答</span>
            <span style={{ fontWeight: 500, fontSize: 14, opacity: 0.55 }}>
              （拖动这里移动；Ctrl/Cmd+Enter 发送）
            </span>
          </div>

          {/* 对话区 */}
          <div
            style={{
              padding: 16,
              height: 350,
              overflow: 'auto',
              background: '#fff'
            }}
          >
            {chat.map((m, idx) => {
              const isUser = m.role === 'user'
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                    marginBottom: 12
                  }}
                >
                  <div
                    style={{
                      maxWidth: '78%',
                      padding: '12px 14px',
                      borderRadius: 16,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      background: isUser ? '#0f172a' : '#f3f4f6',
                      color: isUser ? '#fff' : '#111'
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 输入区 */}
          <div
            style={{
              padding: 16,
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
                borderRadius: 12,
                border: '1px solid rgba(0,0,0,0.12)',
                padding: 12,
                outline: 'none',
                fontSize: 16
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
                  background: '#0f172a',
                  color: '#fff',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  fontWeight: 800,
                  fontSize: 16
                }}
              >
                {loading ? '思考中…' : '发送'}
              </button>

              <button
                onClick={() => {
                  setInput('')
                  setChat([
                    {
                      role: 'assistant',
                      content: '你好，我是杨超哲，也可以叫我茶色。你想聊什么？'
                    }
                  ])
                }}
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

  if (!mounted || !portalEl) return null
  return createPortal(ui, portalEl)
}
