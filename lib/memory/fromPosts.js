import { getAllPosts } from '@/lib/notion'

export async function getPostMemory() {
  const posts = await getAllPosts()

  return posts
    .filter(p => p.status === 'Published')
    .slice(0, 20) // 先限制，防 token 爆炸
    .map(p => `- ${p.title}：${p.summary || ''}`)
    .join('\n')
}
