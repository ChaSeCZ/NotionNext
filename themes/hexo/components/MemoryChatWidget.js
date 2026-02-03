/* themes/hexo/components/MemoryChatWidget.js */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function MemoryChatWidget() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  // ✅ 对话上下文（连续）
  const [msgs, setMsgs] = useState(() => [
    {
      role: 'assistant',
      content: '你好，我是杨超哲，也可以叫我茶色。你想聊什么？'
    }
  ])

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // ✅ 拖动位置（可移动 + 持久化）
  const [pos, setPos] = useState(() => {
    try {
      const saved = localStorage.getItem('tea_chat_pos_v1')
      if (saved) return JSON.parse(saved)
    } catch {}
    return { x: 24, y: 24 } // 默认左上，避免被右侧栏遮挡
  })

  const dragRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0
  })

  const listRef = useRef(null)

  useEffect(() => setMounted(true), [])

  // 保存位置
  useEffect(() => {
    if (!mounted) return
    try {
      localStorage.setItem('tea_chat_pos_v1', JSON.stringify(pos))
    } catch {}
  }, [pos, mounted])

  // 新消息滚到底
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

  // 拖动：mouse + touch
  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current.dragging) return
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY

      const dx = clientX - dragRef.current.startX
      const dy = clientY - dragRef.current.startY

      // clamp 到视口
      const nextX = Math.max(8, Math.min(window.innerWidth - 420, dragRef.current.baseX + dx))
      const nextY = Math.max(8, Math.min(window.innerHeight - 120, dragRef.current.baseY + dy))
      setPos({ x: nextX, y: nextY })
    }

    function onUp() {
      dragRef.current.dragging = false
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [])

  function startDrag(e) {
    // 只允许从标题栏拖动
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    dragRef.current.dragging = true
    dragRef.current.startX = clientX
    dragRef.current.startY = clientY
    dragRef.current.baseX = pos.x
    dragRef.current.baseY = pos.y
  }

  // 发送：把上下文一起带上
  const historyForApi = useMemo(() => {
    // 去掉第一条欢迎语也行，但留着也没事；这里保留最近 12 条
    return msgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-12)
      .map(m => ({ role: m.role, content: m.content }))
  }, [msgs])

  async function ask() {
    const q = input.trim()
    if (!q || loading) return

    setInput('')
    setLoading(true)

    // 先把用户消息塞进去
    const nextMsgs = [...msgs, { role: 'user', content: q }]
    setMsgs(nextMsgs)

    try {
      const res = await fetch('/api/deepseek-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: q,
          history: historyForApi
        })
      })

      const text = await res.text()

      let data
      try {
        data = JSON.parse(text)
      } catch {
        setMsgs(m => [
          ...m,
          {
            role: 'assistant',
            content: `【错误】API返回不是JSON\nHTTP ${res.status}\n(body=${JSON.stringify(text || '')})`
          }
        ])
        return
      }

      if (!data.ok) {
        setMsgs(m => [
          ...m,
          {
            role: 'assistant',
            content:
              `【错误】${data.error || 'unknown error'}` +
              (data.httpStatus ? `\nDeepSeek HTTP ${data.httpStatus}` : '') +
              (data.raw ? `\n(raw=${String(data.raw).slice(0, 600)})` : '')
          }
        ])
        return
      }

      setMsgs(m => [...m, { role: 'assistant', content: data.answer || '（无返回）' }])
    } catch (e) {
      setMsgs(m => [...m, { role: 'assistant', content: `【错误】${String(e)}` }])
    } finally {
      setLoading(false)
    }
  }

  function clearAll() {
    setMsgs([{ role: 'assistant', content: '你好，我是杨超哲，也可以叫我茶色。你想聊什么？' }])
    setInput('')
  }

  function onInputKeyDown(e) {
    // Ctrl/Cmd + Enter 发送
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      ask()
    }
  }

  const ui = (
    <>
      {/* 右下角入口按钮：始终在最上层 */}
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

      {/* 弹窗：用 portal 固定到 body，彻底解决“被卡在下面/被父层裁剪” */}
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
            zIndex: 2147483647,
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 24px 70px rgba(0,0,0,0.26)',
            border: '1px solid rgba(0,0,0,0.08)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* 标题栏：拖动这里移动 */}
          <div
            onMouseDown={startDrag}
            onTouchStart={startDrag}
            style={{
              padding: '14px 16px',
              fontWeight: 900,
              fontSize: 22,
              borderBottom: '1px solid rgba(0,0,0,0.08)',
              cursor: 'move',
              userSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}
          >
            <span>我正在狠狠回答</span>
            <span style={{ fontWeight: 500, fontSize: 14, opacity: 0.55 }}>
              （拖动这里移动；Ctrl/Cmd+Enter 发送）
            </span>
            <div style={{ marginLeft: 'auto', fontWeight: 600, fontSize: 12, opacity: 0.55 }}>
              {loading ? '思考中…' : ''}
            </div>
          </div>

          {/* 对话区 */}
          <div
            ref={listRef}
            style={{
              flex: 1,
              padding: 14,
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
                    marginBottom: 10
                  }}
                >
                  <div
                    style={{
                      maxWidth: '72%',
                      padding: '12px 14px',
                      borderRadius: 14,
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                      background: isUser ? '#0f172a' : '#f3f4f6',
                      color: isUser ? '#fff' : '#111827',
                      border: isUser ? 'none' : '1px solid rgba(0,0,0,0.06)'
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
              padding: 14,
              borderTop: '1px solid rgba(0,0,0,0.08)',
              background: '#fff'
            }}
          >
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="输入问题…（Ctrl/Cmd+Enter 发送）"
              style={{
                width: '100%',
                height: 88,
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
                onClick={ask}
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
                  fontSize: 18,
                  fontWeight: 800
                }}
              >
                发送
              </button>

              <button
                onClick={clearAll}
                style={{
                  width: 92,
                  borderRadius: 12,
                  padding: '12px 14px',
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,0.15)',
                  cursor: 'pointer',
                  fontSize: 16,
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

  if (!mounted) return null
  return createPortal(ui, document.body)
}
