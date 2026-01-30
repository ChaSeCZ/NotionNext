import { useEffect, useMemo, useRef, useState } from 'react'

export default function MemoryChatWidget() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  // chat: [{role:'user'|'assistant', content:''}]
  const [chat, setChat] = useState([])
  const chatEndRef = useRef(null)

  // ====== 拖动相关 ======
  const [pos, setPos] = useState({ right: 18, bottom: 64 }) // 右下角偏移
  const dragRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    startRight: 18,
    startBottom: 64
  })

  const windowSize = useRef({ w: 0, h: 0 })
  useEffect(() => {
    const update = () => {
      windowSize.current = { w: window.innerWidth, h: window.innerHeight }
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  function onDragStart(e) {
    // 只允许鼠标左键或触摸
    const isMouse = e.type === 'mousedown'
    if (isMouse && e.button !== 0) return

    const clientX = isMouse ? e.clientX : e.touches?.[0]?.clientX
    const clientY = isMouse ? e.clientY : e.touches?.[0]?.clientY

    dragRef.current.dragging = true
    dragRef.current.startX = clientX
    dragRef.current.startY = clientY
    dragRef.current.startRight = pos.right
    dragRef.current.startBottom = pos.bottom
  }

  function onDragMove(e) {
    if (!dragRef.current.dragging) return
    const isMouse = e.type === 'mousemove'
    const clientX = isMouse ? e.clientX : e.touches?.[0]?.clientX
    const clientY = isMouse ? e.clientY : e.touches?.[0]?.clientY

    const dx = clientX - dragRef.current.startX
    const dy = clientY - dragRef.current.startY

    // right/bottom 是反方向：鼠标往右，right 应该变小
    let newRight = dragRef.current.startRight - dx
    let newBottom = dragRef.current.startBottom - dy

    // 简单限制，避免拖出屏幕
    const pad = 8
    const maxRight = windowSize.current.w - pad
    const maxBottom = windowSize.current.h - pad
    if (newRight < pad) newRight = pad
    if (newBottom < pad) newBottom = pad
    if (newRight > maxRight) newRight = maxRight
    if (newBottom > maxBottom) newBottom = maxBottom

    setPos({ right: newRight, bottom: newBottom })
  }

  function onDragEnd() {
    dragRef.current.dragging = false
  }

  useEffect(() => {
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
    window.addEventListener('touchmove', onDragMove, { passive: true })
    window.addEventListener('touchend', onDragEnd)
    return () => {
      window.removeEventListener('mousemove', onDragMove)
      window.removeEventListener('mouseup', onDragEnd)
      window.removeEventListener('touchmove', onDragMove)
      window.removeEventListener('touchend', onDragEnd)
    }
  }, [pos])

  // ====== 发送 ======
  async function ask() {
    const userMsg = message.trim()
    if (!userMsg || loading) return

    const nextChat = [...chat, { role: 'user', content: userMsg }]
    setChat(nextChat)
    setMessage('')
    setLoading(true)

    try {
      const res = await fetch('/api/deepseek-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          // ✅ 连续对话上下文一起发给 API（你要的）
          history: nextChat.slice(-12) // 只带最近 12 轮，防 token 爆
        })
      })

      const raw = await res.text()

      let data
      try {
        data = JSON.parse(raw)
      } catch (e) {
        throw new Error(`API返回不是JSON：\n${raw.slice(0, 400)}`)
      }

      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)

      const answer = data?.answer || '（无返回内容）'
      setChat(prev => [...prev, { role: 'assistant', content: answer }])
    } catch (e) {
      setChat(prev => [
        ...prev,
        { role: 'assistant', content: `【错误】${String(e)}` }
      ])
    } finally {
      setLoading(false)
    }
  }

  // esc 关闭 + Ctrl/Cmd+Enter 发送
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') ask()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // 自动滚到底
  useEffect(() => {
    if (!open) return
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat, open])

  // ====== UI样式 ======
  const styles = useMemo(
    () => ({
      btn: {
        position: 'fixed',
        right: 18,
        bottom: 18,
        zIndex: 9999,
        borderRadius: 999,
        padding: '10px 14px',
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.25)',
        cursor: 'pointer'
      },
      panel: {
        position: 'fixed',
        right: pos.right,
        bottom: pos.bottom,
        width: 420,
        maxWidth: 'calc(100vw - 36px)',
        zIndex: 9999,
        background: '#fff',
        borderRadius: 14,
        boxShadow: '0 18px 50px rgba(0,0,0,0.22)',
        border: '1px solid rgba(0,0,0,0.08)',
        overflow: 'hidden'
      },
      header: {
        padding: '12px 14px',
        fontWeight: 800,
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        cursor: 'move',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      },
      chatBox: {
        background: '#f9fafb',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 12,
        padding: 12,
        height: 260,
        overflow: 'auto'
      },
      bubbleRow: role => ({
        display: 'flex',
        justifyContent: role === 'user' ? 'flex-end' : 'flex-start',
        marginBottom: 10
      }),
      bubble: role => ({
        maxWidth: '82%',
        padding: '10px 12px',
        borderRadius: 14,
        whiteSpace: 'pre-wrap',
        lineHeight: 1.6,
        background: role === 'user' ? '#111827' : '#fff',
        color: role === 'user' ? '#fff' : '#111',
        border: role === 'user' ? 'none' : '1px solid rgba(0,0,0,0.12)',
        boxShadow:
          role === 'user'
            ? '0 8px 18px rgba(17,24,39,0.18)'
            : '0 8px 18px rgba(0,0,0,0.06)'
      }),
      input: {
        width: '100%',
        height: 90,
        resize: 'none',
        borderRadius: 12,
        border: '1px solid rgba(0,0,0,0.12)',
        padding: 12,
        outline: 'none',
        marginTop: 10
      },
      btnRow: { display: 'flex', gap: 8, marginTop: 10 },
      sendBtn: {
        flex: 1,
        borderRadius: 12,
        padding: '12px 12px',
        background: '#111827',
        color: '#fff',
        border: 'none',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1
      },
      clearBtn: {
        borderRadius: 12,
        padding: '12px 12px',
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.15)',
        cursor: 'pointer'
      }
    }),
    [pos.right, pos.bottom, loading]
  )

  return (
    <>
      <button onClick={() => setOpen(v => !v)} style={styles.btn}>
        {open ? '关闭' : '问问茶色'}
      </button>

      {open && (
        <div style={styles.panel}>
          {/* 拖动区域：标题栏 */}
          <div
            style={styles.header}
            onMouseDown={onDragStart}
            onTouchStart={onDragStart}
          >
            <div>我正在狠狠回答</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>拖动这里</div>
          </div>

          <div style={{ padding: 12 }}>
            <div style={styles.chatBox}>
              {chat.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: 13 }}>
                  直接问。支持 Ctrl/Cmd + Enter 发送。
                </div>
              ) : (
                chat.map((m, idx) => (
                  <div key={idx} style={styles.bubbleRow(m.role)}>
                    <div style={styles.bubble(m.role)}>{m.content}</div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="输入问题…（Ctrl/Cmd + Enter 发送）"
              style={styles.input}
            />

            <div style={styles.btnRow}>
              <button onClick={ask} disabled={loading} style={styles.sendBtn}>
                {loading ? '思考中…' : '发送'}
              </button>

              <button
                onClick={() => {
                  setMessage('')
                  setChat([])
                }}
                style={styles.clearBtn}
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
