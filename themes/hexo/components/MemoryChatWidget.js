import { useEffect, useState } from 'react'

export default function MemoryChatWidget() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)

  async function ask() {
    if (!message.trim()) return
    setLoading(true)
    setAnswer('')
    try {
      const res = await fetch('/api/deepseek-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          memory: '' // 先留空，后面你再接 Notion “记忆核心”
        })
      })
      const data = await res.json()
      setAnswer(data?.answer || JSON.stringify(data))
    } catch (e) {
      setAnswer(String(e))
    } finally {
      setLoading(false)
    }
  }

  // esc 关闭
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {/* 右下角按钮 */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
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
        }}
      >
        {open ? '关闭' : '问问茶色'}
      </button>

      {/* 弹窗 */}
      {open && (
        <div
          style={{
            position: 'fixed',
            right: 18,
            bottom: 64,
            width: 360,
            maxWidth: 'calc(100vw - 36px)',
            zIndex: 9999,
            background: '#fff',
            borderRadius: 14,
            boxShadow: '0 18px 50px rgba(0,0,0,0.22)',
            border: '1px solid rgba(0,0,0,0.08)',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              fontWeight: 700,
              borderBottom: '1px solid rgba(0,0,0,0.08)'
            }}
          >
            我正在狠狠回答
          </div>

          <div style={{ padding: 12 }}>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="输入问题…"
              style={{
                width: '100%',
                height: 90,
                resize: 'none',
                borderRadius: 10,
                border: '1px solid rgba(0,0,0,0.12)',
                padding: 10,
                outline: 'none'
              }}
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={ask}
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
                onClick={() => {
                  setMessage('')
                  setAnswer('')
                }}
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

            {answer && (
              <pre
                style={{
                  marginTop: 12,
                  whiteSpace: 'pre-wrap',
                  background: '#f9fafb',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: 10,
                  padding: 10,
                  maxHeight: 220,
                  overflow: 'auto'
                }}
              >
                {answer}
              </pre>
            )}
          </div>
        </div>
      )}
    </>
  )
}
