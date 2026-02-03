// pages/api/deepseek-chat.js

const path = require('path')

const VERSION = 'deepseek-chat-api-2026-02-03-stable-v3'

function safeJson(res, status, obj) {
  try {
    res.status(status).json(obj)
  } catch (e) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(status).end(JSON.stringify(obj))
  }
}

function clampText(s, max = 20000) {
  if (!s) return ''
  const t = String(s)
  return t.length > max ? t.slice(0, max) + '\n…（已截断）' : t
}

function tryRequire(absPath) {
  try {
    return { ok: true, mod: require(absPath), path: absPath }
  } catch (e) {
    return { ok: false, error: e }
  }
}

function pickFn(mod, names = []) {
  if (!mod) return null
  for (const n of names) {
    if (typeof mod[n] === 'function') return mod[n]
  }
  if (typeof mod === 'function') return mod
  if (mod.default && typeof mod.default === 'function') return mod.default
  for (const n of names) {
    if (mod.default && typeof mod.default[n] === 'function') return mod.default[n]
  }
  return null
}

async function safeCall(fn, argsList) {
  if (typeof fn !== 'function') return { ok: false, error: 'fn_not_function' }
  const attempts = Array.isArray(argsList) ? argsList : [[]]
  let lastErr = null
  for (const args of attempts) {
    try {
      const ret = await fn(...args)
      return { ok: true, ret }
    } catch (e) {
      lastErr = e
    }
  }
  return { ok: false, error: lastErr ? String(lastErr) : 'call_failed' }
}

function normalizeNotionId(id) {
  if (!id) return ''
  const s = String(id).trim()
  // 允许带横线或不带横线；NotionNext 通常都能处理
  return s
}

/**
 * ✅ 用 MEMORY_PAGE_ID 直接读 Notion 记忆页（最稳，不依赖 getAllPosts）
 */
async function loadMemoryFromNotionByPageId() {
  const memoryPageId = normalizeNotionId(process.env.MEMORY_PAGE_ID)
  if (!memoryPageId) {
    return { ok: false, memory: '', used: false, reason: 'MEMORY_PAGE_ID_not_set' }
  }

  // 只用你项目里肯定存在的两个文件（你截图里都有）
  const postMod = tryRequire(path.join(process.cwd(), 'lib/notion/getNotionPost.js'))
  if (!postMod.ok) {
    return { ok: false, memory: '', used: false, reason: 'getNotionPost_module_not_found' }
  }
  const getNotionPost = pickFn(postMod.mod, ['getNotionPost'])
  if (!getNotionPost) {
    return { ok: false, memory: '', used: false, reason: 'getNotionPost_fn_not_found' }
  }

  const textMod = tryRequire(path.join(process.cwd(), 'lib/notion/getPageContentText.js'))
  const getPageContentText = textMod.ok ? pickFn(textMod.mod, ['getPageContentText']) : null

  const pageRet = await safeCall(getNotionPost, [[memoryPageId], [memoryPageId, null], [memoryPageId, '']])
  if (!pageRet.ok || !pageRet.ret) {
    return { ok: false, memory: '', used: false, reason: 'getNotionPost_call_failed' }
  }

  const page = pageRet.ret

  let memoryText = ''
  if (getPageContentText && page.blockMap) {
    const t = await safeCall(getPageContentText, [[page.blockMap]])
    if (t.ok && t.ret) memoryText = String(t.ret)
  }

  if (!memoryText) {
    memoryText = [page.title || '', page.summary || ''].filter(Boolean).join('\n')
  }

  memoryText = clampText(memoryText, 20000).trim()
  if (!memoryText) {
    return { ok: false, memory: '', used: false, reason: 'memory_text_empty' }
  }

  return { ok: true, memory: memoryText, used: true, reason: 'loaded_by_MEMORY_PAGE_ID' }
}

async function callDeepSeek({ apiKey, system, memory, history, message }) {
  const messages = []

  messages.push({ role: 'system', content: system })

  messages.push({
    role: 'system',
    content:
      '【记忆（来自Notion，视为事实来源）】\n' +
      memory +
      '\n\n【规则】\n' +
      '1) 只允许基于“记忆”回答事实。\n' +
      '2) 记忆里没有就说“不确定”，并追问1-2个关键问题。\n' +
      '3) 禁止编造任何经历、年份、细节。\n'
  })

  if (Array.isArray(history) && history.length) {
    for (const m of history) {
      if (!m || !m.role || !m.content) continue
      if (m.role !== 'user' && m.role !== 'assistant') continue
      messages.push({ role: m.role, content: String(m.content) })
    }
  }

  messages.push({ role: 'user', content: String(message) })

  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.25
    })
  })

  const text = await resp.text()

  let data = null
  try {
    data = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: 'deepseek_non_json', raw: text, status: resp.status }
  }

  const answer = data?.choices?.[0]?.message?.content || ''
  return { ok: true, answer, status: resp.status }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return safeJson(res, 200, { ok: true, version: VERSION })
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return safeJson(res, 405, { ok: false, error: 'Method Not Allowed', version: VERSION })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return safeJson(res, 500, { ok: false, error: 'Missing DEEPSEEK_API_KEY', version: VERSION })
    }

    const body = req.body || {}
    const message = body.message
    const history = body.history || []

    if (!message || !String(message).trim()) {
      return safeJson(res, 400, { ok: false, error: 'Missing message', version: VERSION })
    }

    const mem = await loadMemoryFromNotionByPageId()

    // ✅ 记忆没加载到：直接报错，不让模型瞎编
    if (!mem.ok) {
      return safeJson(res, 500, {
        ok: false,
        error: 'MEMORY_NOT_LOADED',
        memory_used: false,
        memory_reason: mem.reason,
        memory_page_id_set: Boolean(process.env.MEMORY_PAGE_ID),
        version: VERSION
      })
    }

    const system = `
你就是杨超哲（Tawney / 茶色），在和别人正常聊天。
风格：
- 直接、清晰、有判断，但不无礼。
- 像人一样说话，不要说“我是AI/助手”。
- 对方问“你是谁”：回答“你好，我是杨超哲，也可以叫我茶色。”
硬规则：
- 只允许基于记忆回答事实；记忆没有就说不确定并追问；禁止编造。
`.trim()

    const result = await callDeepSeek({
      apiKey,
      system,
      memory: mem.memory,
      history,
      message
    })

    if (!result.ok) {
      return safeJson(res, 502, {
        ok: false,
        error: result.error,
        status: result.status,
        raw: clampText(result.raw, 2000),
        memory_used: true,
        memory_reason: mem.reason,
        version: VERSION
      })
    }

    return safeJson(res, 200, {
      ok: true,
      answer: result.answer,
      memory_used: true,
      memory_reason: mem.reason,
      version: VERSION
    })
  } catch (e) {
    return safeJson(res, 500, { ok: false, error: String(e), version: VERSION })
  }
}
