import { useEffect, useRef, useState } from 'react'

export default function MemoryChatWidget() {
  const [open, setOpen] = useState(false)
  const [memory, setMemory] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [chat, setChat] = useState([]) // {role:'user'|'assistant', content:string}[]
  const boxRef = useRef(null)

  useEffect(() => {
    // 记忆 & 聊天记录本地保存，防止刷新丢失
    const savedMemory = localStorage.getItem('tawney_memory') || ''
    const savedChat = localStorage.getItem('tawney_chat') || '[]'
    setMemory(savedMemory)
    try {
      setChat(JSON.parse(savedChat))
    } catch {
      setChat([])
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('tawney_memory', memory)
  }, [memory])

  useEffect(() => {
    localStorage.setItem('tawney_chat', JSON.stringify(chat))
    // 自动滚到底
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [chat, open])

  async function send() {
    const text = message.trim()
    if (!text || loading) return
    setMessage('')
    setLoading(true)
    setChat(prev => [...prev, { role: 'user', content: text }])

    try {
      const resp = await fetch('/api/deepseek-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          memory: memory?.trim() || ''
        })
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Request failed')

      setChat(prev => [
        ...prev,
        { role: 'assistant', content: data?.answer || '(无返回)' }
      ])
    } catch (e) {
      setChat(prev => [
        ...prev,
        { role: 'assistant', content: `【报错】${e.message}` }
      ])
    } finally {
      setLoading(false)
    }
  }

  function clearAll() {
    if (!confirm('清空记忆与对话？')) return
    setMemory('')
    setChat([])
    localStorage.removeItem('tawney_memory')
    localStorage.removeItem('tawney_chat')
  }

  return (
    <div className="fixed right-4 bottom-4 z-[9999]">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="shadow-lg rounded-full px-4 py-3 bg-black/80 text-white backdrop-blur hover:bg-black"
        >
          问我一下
        </button>
      ) : (
        <div className="w-[360px] max-w-[90vw] h-[520px] max-h-[80vh] rounded-2xl overflow-hidden shadow-2xl border border-black/10 bg-white">
          <div className="flex items-center justify-between px-4 py-3 bg-black text-white">
            <div className="font-semibold">茶色 · 记忆问答</div>
            <div className="flex gap-2">
              <button className="text-white/80 hover:text-white" onClick={clearAll}>
                清空
              </button>
              <button className="text-white/80 hover:text-white" onClick={() => setOpen(false)}>
                关闭
              </button>
            </div>
          </div>

          <div className="p-3 border-b bg-gray-50">
            <div className="text-xs text-gray-600 mb-1">记忆（可粘贴/编辑，会自动保存本地）</div>
            <textarea
              value={memory}
              onChange={e => setMemory(e.target.value)}
              className="w-full h-[72px] text-sm p-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black/10"
              placeholder="把你 Notion 的『茶色-记忆核心』内容粘贴在这（先这样做，最稳）"
            />
          </div>

          <div ref={boxRef} className="p-3 h-[290px] overflow-auto space-y-2">
            {chat.length === 0 ? (
              <div className="text-sm text-gray-500">
                你可以直接问：<br />
                - 你是谁？<br />
                - 你能帮我做什么？<br />
                - 以我的风格回复这条消息：……
              </div>
            ) : (
              chat.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                  <div
                    className={
                      'inline-block max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ' +
                      (m.role === 'user'
                        ? 'bg-black text-white'
                        : 'bg-gray-100 text-gray-900')
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t flex gap-2">
            <input
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              className="flex-1 text-sm p-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black/10"
              placeholder={loading ? '正在回答…' : '输入问题，回车发送'}
              disabled={loading}
            />
            <button
              onClick={send}
              disabled={loading}
              className="px-3 py-2 rounded-lg bg-black text-white text-sm disabled:opacity-50"
            >
              发送
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
