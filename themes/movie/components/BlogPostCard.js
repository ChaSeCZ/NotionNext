import { siteConfig } from '@/lib/config'
import Link from 'next/link'
import TagItemMini from './TagItemMini'
import CONFIG from '../config'
import TwikooCommentCount from '@/components/TwikooCommentCount'
import LazyImage from '@/components/LazyImage'
import { formatDateFmt } from '@/lib/utils/formatDate'
import { checkContainHttp, sliceUrlFromHttp } from '@/lib/utils'
import NotionIcon from '@/components/NotionIcon'

const BlogPostCard = ({ index, post, showSummary, siteInfo }) => {
  // 主题默认强制显示图片
  if (post && !post.pageCoverThumbnail) {
    post.pageCoverThumbnail =
      siteInfo?.pageCover || siteConfig('RANDOM_IMAGE_URL')
  }

  const url = checkContainHttp(post.slug)
    ? sliceUrlFromHttp(post.slug)
    : `${siteConfig('SUB_PATH', '')}/${post.slug}`

  return (
    <article className="w-full mb-4 cursor-pointer overflow-hidden shadow-movie dark:bg-hexo-black-gray">
      <Link href={url} passHref legacyBehavior>
        {/* 固定高度 ，空白用图片拉升填充 */}
        <div className="group flex flex-col aspect-[2/3] justify-between relative">
          {/* 图片 填充卡片 */}
          <div className="flex flex-grow w-full h-full relative duration-200  cursor-pointer transform overflow-hidden">
            <LazyImage
              src={post?.pageCoverThumbnail}
              alt={post.title}
              className="h-full w-full group-hover:scale-105 transform object-cover duration-500"
            />
          </div>

          <div className="absolute bottom-32 z-20">
            {post?.tagItems && post?.tagItems.length > 0 && (
              <>
                <div className="px-6 justify-between flex p-2">
                  {post.tagItems.map(tag => (
                    <TagItemMini key={tag.name} tag={tag} />
                  ))}
                </div>
              </>
            )}
          </div>
          {/* 阴影遮罩 */}
          <h2 className="absolute bottom-10 px-6 transition-all duration-200 text-white text-2xl font-semibold break-words shadow-text z-20">
            <NotionIcon icon={post.pageIcon} />
            {post.title}
          </h2>

          <div className="h-3/4 w-full absolute left-0 bottom-0 z-10">
            <div className="h-full w-full absolute opacity-80 group-hover:opacity-100 transition-all duration-1000 bg-gradient-to-b from-transparent to-black"></div>
          </div>
        </div>
      </Link>
    </article>
  )
}

export default BlogPostCard
