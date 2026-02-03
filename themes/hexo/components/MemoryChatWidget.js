// themes/hexo/components/MemoryChatWidget.js

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function MemoryChatWidget() {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)

  const [pos, setPos] = useState({ x: 24, y: 24 }) // 初始位置（右上）
  const dragRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0
  })

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // history: [{ role:'user'|'assistant', content:string }]
  const [history, setHistory] = useState(() => [])

  useEffect(() => setMounted(true), [])

  // esc 关闭
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 拖动
  function onMouseDownHeader(e) {
    dragRef.current.dragging = true
    dragRef.current.startX = e.clientX
    dragRef.current.startY = e.clientY
    dragRef.current.originX = pos.x
    dragRef.current.originY = pos.y
    e.preventDefault()
  }

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current.dragging) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      setPos({
        x: Math.max(8, dragRef.current.originX + dx),
        y: Math.max(8, dragRef.current.originY + dy)
      })
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
  }, [pos.x, pos.y])

  const ui = useMemo(() => {
    const containerStyle = {
      position: 'fixed',
      left: pos.x,
      top: pos.y,
      width: 720,
      maxWidth: 'calc(100vw - 16px)',
      height: 520,
      maxHeight: 'calc(100vh - 16px)',
      zIndex: 2147483647, // 绝对最上层
      background: '#fff',
      borderRadius: 18,
      boxShadow: '0 22px 70px rgba(0,0,0,0.28)',
      border: '1px solid rgba(0,0,0,0.08)',
      overflow: 'hidden',
      display: open ? 'flex' : 'none',
      flexDirection: 'column'
    }

    const headerStyle = {
      padding: '14px 16px',
      fontWeight: 900,
      fontSize: 22,
      borderBottom: '1px solid rgba(0,0,0,0.08)',
      cursor: 'move',
      userSelect: 'none',
      background: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10
    }

    const hintStyle = {
      fontWeight: 600,
      fontSize: 14,
      color: 'rgba(0,0,0,0.45)',
      marginLeft: 10
    }

    const bodyStyle = {
      flex: 1,
      padding: 16,
      overflow: 'auto',
      background: '#fff'
    }

    const inputWrap = {
      padding: 16,
      borderTop: '1px solid rgba(0,0,0,0.08)',
      background: '#fff'
    }

    const textareaStyle = {
      width: '100%',
      height: 80,
      resize: 'none',
      borderRadius: 12,
      border: '1px solid rgba(0,0,0,0.14)',
      padding: 12,
      outline: 'none',
      fontSize: 16
    }

    const btnRow = {
      display: 'flex',
      gap: 10,
      marginTop: 12,
      alignItems: 'center'
    }

    const sendBtn = {
      flex: 1,
      borderRadius: 12,
      padding: '12px 14px',
      background: '#0b1220',
      color: '#fff',
      border: 'none',
      cursor: loading ? 'not-allowed' : 'pointer',
      opacity: loading ? 0.7 : 1,
      fontSize: 16,
      fontWeight: 800
    }

    const clearBtn = {
      width: 86,
      borderRadius: 12,
      padding: '12px 12px',
      background: '#fff',
      border: '1px solid rgba(0,0,0,0.18)',
      cursor: 'pointer',
      fontSize: 16,
      fontWeight: 700
    }

    const bubbleBase = {
      maxWidth: '78%',
      padding: '12px 14px',
      borderRadius: 16,
      lineHeight: 1.6,
      fontSize: 16,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word'
    }

    return (
      <>
        {/* 右下角按钮（不影响你网站其他东西） */}
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
            border: '1px solid rgba(255,255,255,0.28)',
            cursor: 'pointer',
            fontWeight: 800
          }}
        >
          {open ? '关闭' : '问问茶色'}
        </button>

        <div style={containerStyle}>
          <div style={headerStyle} onMouseDown={onMouseDownHeader}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span>我正在狠狠回答</span>
              <span style={hintStyle}>（拖动这里移动；Ctrl/Cmd+Enter 发送）</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 800,
                color: 'rgba(0,0,0,0.55)'
              }}
            >
              ×
            </button>
          </div>

          <div style={bodyStyle}>
            {history.length === 0 ? (
              <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 15 }}>
                你可以直接问问题。我会以“杨超哲/茶色”的口吻回答（基于 Notion 记忆，不瞎编）。
              </div>
            ) : (
              history.map((m, idx) => {
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
                        ...bubbleBase,
                        background: isUser ? '#0b1220' : '#f3f4f6',
                        color: isUser ? '#fff' : '#111827',
                        border: isUser ? 'none' : '1px solid rgba(0,0,0,0.06)'
                      }}
                    >
                      {m.content}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div style={inputWrap}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="输入问题…（Ctrl/Cmd+Enter 发送）"
              style={textareaStyle}
              onKeyDown={e => {
                const isEnter = e.key === 'Enter'
                const isHotkey = (e.ctrlKey || e.metaKey) && isEnter
                if (isHotkey) {
                  e.preventDefault()
                  onSend()
                }
              }}
            />

            <div style={btnRow}>
              <button onClick={onSend} disabled={loading} style={sendBtn}>
                {loading ? '思考中…' : '发送'}
              </button>
              <button
                onClick={() => {
                  setInput('')
                  setHistory([])
                }}
                style={clearBtn}
              >
                清空
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }, [open, pos.x, pos.y, history, input, loading])

  async function onSend() {
    const msg = String(input || '').trim()
    if (!msg || loading) return

    setLoading(true)
    setInput('')

    const newHistory = [...history, { role: 'user', content: msg }]
    setHistory(newHistory)

    try {
      const res = await fetch('/api/deepseek-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: newHistory // 连续对话上下文
        })
      })

      const contentType = res.headers.get('content-type') || ''
      const raw = await res.text()

      if (!contentType.includes('application/json')) {
        throw new Error(`API返回不是JSON\nHTTP ${res.status}\n(body="${raw || ''}")`)
      }

      const data = JSON.parse(raw)
      const answer = data?.answer || '（无返回内容）'

      setHistory(h => [...h, { role: 'assistant', content: answer }])
    } catch (e) {
      setHistory(h => [
        ...h,
        { role: 'assistant', content: `【错误】${String(e.message || e)}` }
      ])
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null
  return createPortal(ui, document.body)
}
