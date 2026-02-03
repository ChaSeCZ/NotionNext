// pages/api/deepseek-chat.js

const path = require('path')

const VERSION = 'deepseek-chat-api-2026-02-03-v2'

function safeJson(res, status, obj) {
  try {
    res.status(status).json(obj)
  } catch (e) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(status).end(JSON.stringify(obj))
  }
}

function clampText(s, max = 16000) {
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

function pickAny(mod, keys = []) {
  if (!mod) return null
  for (const k of keys) {
    if (mod[k] != null) return mod[k]
  }
  if (mod.default) {
    for (const k of keys) {
      if (mod.default[k] != null) return mod.default[k]
    }
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

/**
 * 读取 Notion 里的“记忆页”，支持：
 * - 直接 getPostBySlug(slug)
 * - 或者 getAllPosts() 找 slug，再 getNotionPost(pageId) 拿 blockMap
 */
async function loadMemoryFromNotion() {
  const slugCandidates = [
    process.env.MEMORY_SLUG,
    'memory',
    'memroy',
    'memory-core',
    'memort'
  ].filter(Boolean)

  // 1) 先加载 “正文提取”函数（可选）
  let getPageContentText = null
  {
    const r = tryRequire(path.join(process.cwd(), 'lib/notion/getPageContentText.js'))
    if (r.ok) {
      getPageContentText = pickFn(r.mod, ['getPageContentText'])
    }
  }

  // 2) 尝试直接拿 getPostBySlug（如果你项目里有）
  let getPostBySlug = null
  {
    const r = tryRequire(path.join(process.cwd(), 'lib/notion/getNotionPost.js'))
    if (r.ok) {
      getPostBySlug = pickFn(r.mod, ['getPostBySlug'])
    }
  }
  if (!getPostBySlug) {
    const r2 = tryRequire(path.join(process.cwd(), 'lib/notion/getNotionAPI.js'))
    if (r2.ok) {
      getPostBySlug = pickFn(r2.mod, ['getPostBySlug'])
    }
  }

  // ✅ 路线 A：有 getPostBySlug 就直接用
  if (getPostBySlug) {
    for (const slug of slugCandidates) {
      const got = await safeCall(getPostBySlug, [[slug]])
      if (got.ok && got.ret) {
        const page = got.ret
        let text = ''
        if (getPageContentText && page.blockMap) {
          const t = await safeCall(getPageContentText, [[page.blockMap]])
          if (t.ok && t.ret) text = t.ret
        }
        if (!text) text = [page.title || '', page.summary || ''].filter(Boolean).join('\n')
        text = clampText(text, 16000)
        if (text) return { ok: true, memory: text, usedSlug: slug, reason: 'loaded_by_getPostBySlug' }
      }
    }
    return { ok: false, memory: '', usedSlug: '', reason: 'getPostBySlug_found_but_page_not_found' }
  }

  // ✅ 路线 B：没有 getPostBySlug → 用 getAllPosts 找 slug → 再 getNotionPost(pageId)
  let getAllPosts = null
  {
    const candidates = [
      path.join(process.cwd(), 'lib/notion/getAllPosts.js'),
      path.join(process.cwd(), 'lib/notion/getAllPost.js'),
      path.join(process.cwd(), 'lib/notion/getAllPagedIds.js') // 有些分支会在这里再封装
    ]
    for (const p of candidates) {
      const r = tryRequire(p)
      if (!r.ok) continue
      getAllPosts = pickFn(r.mod, ['getAllPosts'])
      if (getAllPosts) break
    }
  }

  let getNotionPost = null
  {
    const r = tryRequire(path.join(process.cwd(), 'lib/notion/getNotionPost.js'))
    if (r.ok) {
      getNotionPost = pickFn(r.mod, ['getNotionPost'])
    }
  }

  if (!getAllPosts || !getNotionPost) {
    return {
      ok: false,
      memory: '',
      usedSlug: '',
      reason: !getAllPosts ? 'getAllPosts_not_found' : 'getNotionPost_not_found'
    }
  }

  // 拉全站 posts
  const postsRet = await safeCall(getAllPosts, [[], [null], [{}]])
  if (!postsRet.ok || !Array.isArray(postsRet.ret)) {
    return { ok: false, memory: '', usedSlug: '', reason: 'getAllPosts_call_failed' }
  }

  const posts = postsRet.ret

  // 用 slugCandidates 依次匹配
  for (const slug of slugCandidates) {
    const post =
      posts.find(p => p?.slug === slug) ||
      posts.find(p => p?.slug?.endsWith('/' + slug)) ||
      posts.find(p => p?.path === slug) ||
      null

    if (!post) continue

    const pageId =
      post?.id ||
      post?.pageId ||
      post?.page_id ||
      post?.notionId ||
      post?.notion_id ||
      null

    if (!pageId) continue

    const pageRet = await safeCall(getNotionPost, [[pageId], [pageId, null], [pageId, '']])
    if (!pageRet.ok || !pageRet.ret) continue

    const page = pageRet.ret

    let text = ''
    if (getPageContentText && page.blockMap) {
      const t = await safeCall(getPageContentText, [[page.blockMap]])
      if (t.ok && t.ret) text = t.ret
    }
    if (!text) text = [page.title || '', page.summary || ''].filter(Boolean).join('\n')

    text = clampText(text, 16000)
    if (text) {
      return { ok: true, memory: text, usedSlug: slug, reason: 'loaded_by_getAllPosts_then_getNotionPost' }
    }
  }

  return { ok: false, memory: '', usedSlug: '', reason: 'slug_not_found_in_posts' }
}

async function callDeepSeek({ apiKey, system, memory, history, message }) {
  const messages = []

  messages.push({ role: 'system', content: system })

  if (memory) {
    messages.push({
      role: 'system',
      content:
        '【记忆（来自Notion，视为事实来源）】\n' +
        memory +
        '\n\n【硬规则】只允许基于“记忆”回答事实；记忆没有就说“不确定”，并问1-2个关键追问；禁止编造。'
    })
  }

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
      temperature: 0.35
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
    return safeJson(res, 405, { ok: false, error: 'Method Not Allowed' })
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return safeJson(res, 500, { ok: false, error: 'Missing DEEPSEEK_API_KEY' })
    }

    const body = req.body || {}
    const message = body.message
    const history = body.history || []

    if (!message || !String(message).trim()) {
      return safeJson(res, 400, { ok: false, error: 'Missing message' })
    }

    const mem = await loadMemoryFromNotion()

    // 🔥 关键：记忆没加载到 -> 直接返回错误，不让模型瞎编
    if (!mem.ok) {
      return safeJson(res, 500, {
        ok: false,
        error: 'MEMORY_NOT_LOADED',
        memory_used: false,
        memory_slug: '',
        memory_reason: mem.reason,
        version: VERSION
      })
    }

    const system = `
你就是杨超哲（Tawney / 茶色），在和别人正常聊天。
风格要求：
- 直接、清晰、有判断，但不无礼、不阴阳怪气。
- 像人一样对话：自然、简洁，不说“我是AI助手”。
- 对方问“你是谁”：回答“你好，我是杨超哲，也可以叫我茶色。”
- 必须遵守：只基于记忆回答事实；记忆没有就说不确定并追问；禁止编造。
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
        memory_slug: mem.usedSlug,
        memory_reason: mem.reason,
        version: VERSION
      })
    }

    return safeJson(res, 200, {
      ok: true,
      answer: result.answer,
      memory_used: true,
      memory_slug: mem.usedSlug,
      memory_reason: mem.reason,
      version: VERSION
    })
  } catch (e) {
    return safeJson(res, 500, { ok: false, error: String(e), version: VERSION })
  }
}
