<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { api, messageFrom, payload } from '../services/api'
import { useBlogStore } from '../stores/blog'
import { renderMarkdown } from '../utils/markdown'

const store = useBlogStore()
const route = useRoute()
const router = useRouter()
const post = ref(null)
const postLoading = ref(false)
const comments = ref([])
const replyTo = ref(null)
const guestbook = ref([])
const busy = ref(false)
const notice = ref('')
const query = ref(String(route.query.q || ''))
const commentForm = ref({ name: '', email: '', content: '' })
const guestForm = ref({ name: '', email: '', content: '' })
const friendForm = ref({ name: '', url: '', description: '' })
const likes = ref(0)
const liked = ref(false)
const bookmarked = ref(false)
const bookmarkCount = ref(0)
const filteredApiPosts = ref(null)
const listLoading = ref(false)
const toolText = ref('# 写下你的想法\n\n在这里输入 Markdown，右侧会即时预览。')
const slugText = ref('')
const gallery = [
  ['清晨的山', 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1100&q=85'],
  ['湖边小屋', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1100&q=85'],
  ['窗边的光', 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1100&q=85'],
  ['沿途风景', 'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=1100&q=85'],
  ['海边日落', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1100&q=85'],
  ['一页书', 'https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=1100&q=85'],
]
const pageTitle = computed(() => ({
  articles: '所有文章', categories: '文章分类', tags: '写作标签', archives: '时光归档',
  about: '关于我', gallery: '生活相册', friends: '友人帐', guestbook: '留言板', tools: '小小工具箱',
}[route.name] || ''))
const visiblePosts = computed(() => {
  if (filteredApiPosts.value !== null && ['articles', 'category', 'tag', 'search'].includes(route.name)) return filteredApiPosts.value
  let posts = store.publishedPosts
  if (route.name === 'category') posts = posts.filter((item) => item.category?.toLowerCase() === route.params.slug || store.categories.find((category) => category.slug === route.params.slug)?.name === item.category)
  if (route.name === 'tag') posts = posts.filter((item) => item.tags?.some((tag) => tag.slug === route.params.slug))
  if (route.name === 'search') {
    const term = String(route.query.q || '').trim().toLowerCase()
    posts = posts.filter((item) => [item.title, item.excerpt, item.content, item.category, ...(item.tags || []).map((tag) => tag.name)].join(' ').toLowerCase().includes(term))
  }
  return posts
})
const threadComments = computed(() => {
  const byParent = new Map()
  const byId = new Map(comments.value.map((comment) => [comment.id, comment]))
  for (const comment of comments.value) {
    const key = comment.parent_id || ''
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(comment)
  }
  const visited = new Set()
  const flattened = []
  const visit = (comment, depth, parentName = '') => {
    if (visited.has(comment.id)) return
    visited.add(comment.id)
    flattened.push({ ...comment, depth, parentName })
    for (const child of byParent.get(comment.id) || []) visit(child, depth + 1, comment.name)
  }
  for (const comment of comments.value) {
    if (!comment.parent_id || !byId.has(comment.parent_id)) visit(comment, 0)
  }
  for (const comment of comments.value) visit(comment, 0)
  return flattened
})
const archives = computed(() => {
  const groups = {}
  for (const item of store.publishedPosts) {
    const key = (item.published_at || item.created_at || '').slice(0, 7)
    if (key) (groups[key] ||= []).push(item)
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
})
const wordCount = computed(() => (toolText.value.match(/[\u3400-\u9fff]|[A-Za-z0-9]+/g) || []).length)

async function loadDetail() {
  if (route.name !== 'article') { postLoading.value = false; return }
  postLoading.value = true
  liked.value = false
  bookmarked.value = false
  likes.value = 0
  bookmarkCount.value = 0
  post.value = await store.getPost(route.params.slug)
  comments.value = []
  if (!post.value) { postLoading.value = false; return }
  const [commentsResult, likesResult] = await Promise.allSettled([
    api.get(`/posts/${post.value.id}/comments?page=1&limit=50`),
    api.get(`/posts/${post.value.id}/likes`),
  ])
  if (commentsResult.status === 'fulfilled') {
    comments.value = payload(commentsResult.value) || []
  } else {
    comments.value = store.comments.filter((comment) => comment.post_id === post.value.id && comment.status === 'approved')
  }
  if (likesResult.status === 'fulfilled') {
    const state = payload(likesResult.value)
    likes.value = state?.count || 0
    liked.value = Boolean(state?.liked)
    bookmarked.value = Boolean(state?.bookmarked)
    bookmarkCount.value = state?.bookmark_count || 0
  }
  postLoading.value = false
}
watch(() => [route.name, route.params.slug], loadDetail, { immediate: true })
watch(() => route.query.q, (value) => { query.value = String(value || '') })
let listRequestId = 0
watch(() => [route.name, route.params.slug, route.query.q], async ([name, slug, searchTerm]) => {
  const requestId = ++listRequestId
  if (!['articles', 'category', 'tag', 'search'].includes(name)) {
    filteredApiPosts.value = null
    listLoading.value = false
    return
  }
  listLoading.value = true
  const params = { page: 1, limit: 50 }
  if (name === 'category') params.category = slug
  if (name === 'tag') params.tag = slug
  if (name === 'search' && String(searchTerm || '').trim()) params.q = String(searchTerm).trim()
  try {
    const result = payload(await api.get('/posts', { params }))
    if (requestId === listRequestId) filteredApiPosts.value = Array.isArray(result) ? result : result?.data || []
  } catch {
    if (requestId === listRequestId) filteredApiPosts.value = null
  } finally {
    if (requestId === listRequestId) listLoading.value = false
  }
}, { immediate: true })
watch(() => route.name, async (name) => {
  if (name === 'guestbook') {
    try { guestbook.value = payload(await api.get('/guestbook?page=1&limit=50')) || [] } catch { guestbook.value = store.guestbook.filter((entry) => entry.status === 'approved') }
  }
}, { immediate: true })

async function submitComment() {
  if (!post.value) return
  busy.value = true
  const parentId = replyTo.value?.id || null
  const submittedComment = { ...commentForm.value, parent_id: parentId }
  try {
    await api.post(`/posts/${post.value.id}/comments`, submittedComment)
    notice.value = parentId ? '回复已提交，审核通过后就会显示。' : '评论已提交，审核通过后就会显示。'
    commentForm.value = { name: '', email: '', content: '' }
    replyTo.value = null
  } catch (error) {
    if (!error.response) {
      comments.value.unshift({ ...submittedComment, id: Date.now(), created_at: new Date().toISOString() })
      notice.value = '评论已保存在本地预览中。'
      commentForm.value = { name: '', email: '', content: '' }
      replyTo.value = null
    } else notice.value = messageFrom(error)
  }
  busy.value = false
}
async function submitGuestbook() {
  busy.value = true
  try {
    const entry = payload(await api.post('/guestbook', guestForm.value))
    notice.value = '谢谢你的留言！审核通过后会出现在这里。'
    guestForm.value = { name: '', email: '', content: '' }
  } catch (error) {
    if (!error.response) {
      guestbook.value.unshift({ ...guestForm.value, created_at: new Date().toISOString(), id: Date.now() })
      notice.value = '留言已保存在本地预览中。'
      guestForm.value = { name: '', email: '', content: '' }
    } else notice.value = messageFrom(error)
  }
  busy.value = false
}
async function toggleLike() {
  if (!post.value) return
  try {
    const data = payload(await (liked.value ? api.delete(`/posts/${post.value.id}/likes`) : api.post(`/posts/${post.value.id}/likes`)))
    likes.value = data?.count ?? likes.value + (liked.value ? -1 : 1)
    liked.value = !liked.value
  } catch { notice.value = '点赞服务暂不可用，稍后再试试。' }
}
async function toggleBookmark() {
  if (!post.value) return
  try {
    const response = await (bookmarked.value
      ? api.delete(`/posts/${post.value.id}/bookmarks`)
      : api.post(`/posts/${post.value.id}/bookmarks`))
    const result = payload(response)
    bookmarked.value = Boolean(result?.bookmarked)
    bookmarkCount.value = Math.max(0, bookmarkCount.value + (bookmarked.value ? 1 : -1))
  } catch (error) {
    notice.value = messageFrom(error)
  }
}
async function submitFriend() {
  if (!friendForm.value.name || !friendForm.value.url) return
  busy.value = true
  notice.value = ''
  try {
    await api.post('/friends', {
      name: friendForm.value.name.trim(),
      url: friendForm.value.url.trim(),
      description: friendForm.value.description.trim(),
      avatar: friendForm.value.avatar.trim() || null,
    })
    notice.value = '友链申请已提交，审核通过后会出现在友人帐里。'
    friendForm.value = { name: '', url: '', description: '', avatar: '' }
  } catch (error) {
    notice.value = error.response
      ? messageFrom(error)
      : '暂时无法连接服务，友链申请没有提交成功，请稍后重试。'
  } finally {
    busy.value = false
  }
}
function safeHttpUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#'
  } catch { return '#' }
}
function searchPosts() {
  router.push({ name: 'search', query: { q: query.value.trim() } })
}
function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => { notice.value = '已复制到剪贴板。' }).catch(() => { notice.value = '复制失败，请手动选择文本。' })
}
function formatDate(date) {
  if (!date) return '尚未发布'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(date))
}
</script>

<template>
  <div v-if="route.name === 'home'" class="home-layout">
    <section class="hero-panel">
      <div class="hero-copy">
        <span class="eyebrow"><i></i> 一个人的生活记录</span>
        <h1>把平凡日子，<br /><em>写成值得回看的故事。</em></h1>
        <p>{{ store.settings.tagline || '在这里，收藏日常的微光与远方。' }}</p>
        <div class="hero-links"><RouterLink class="button button-dark" to="/articles">读读最近的文字 <span>↗</span></RouterLink><RouterLink class="text-link" to="/about">认识一下我 <span>→</span></RouterLink></div>
        <div class="hero-note"><span class="avatar avatar-small">林</span><span><b>{{ store.settings.author || '林间来信' }}</b><small>写作者 · 记录生活的人</small></span></div>
      </div>
      <div class="hero-art">
        <img src="https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1200&q=90" alt="晨光洒进山谷" />
        <span class="art-caption">慢一点，也没关系。<small>somewhere in the morning</small></span>
        <span class="sun-stamp">take<br />it slow</span>
      </div>
      <span class="hero-index">01 / JOURNAL</span>
    </section>
    <section class="section-block home-posts">
      <div class="section-heading"><div><span class="eyebrow">RECENT NOTES · 最近更新</span><h2>新鲜写下的</h2></div><RouterLink class="text-link" to="/articles">全部文章 <span>→</span></RouterLink></div>
      <div class="post-grid">
        <article v-for="(item, index) in store.publishedPosts.slice(0, 3)" :key="item.id" class="post-card" :class="{ 'post-card-featured': index === 0 }">
          <RouterLink :to="{ name: 'article', params: { slug: item.slug } }" class="post-cover"><img :src="item.cover_image || gallery[index][1]" :alt="item.title" /><span class="cover-arrow">↗</span></RouterLink>
          <div class="post-meta"><span>{{ item.category || '随笔' }}</span><i></i>{{ formatDate(item.published_at || item.created_at) }}</div>
          <h3><RouterLink :to="{ name: 'article', params: { slug: item.slug } }">{{ item.title }}</RouterLink></h3>
          <p>{{ item.excerpt }}</p>
          <div class="tag-line"><RouterLink v-for="tag in item.tags?.slice(0, 2)" :key="tag.slug" :to="{ name: 'tag', params: { slug: tag.slug } }"># {{ tag.name }}</RouterLink></div>
        </article>
      </div>
    </section>
    <section class="quote-banner"><span class="quote-mark">“</span><p>日子不是用来赶路的，<br />每一步都值得好好经过。</p><span class="quote-byline">— 写给每一个慢下来的下午</span><span class="quote-scribble">everyday<br />is a story</span></section>
    <section class="section-block bottom-invite"><div><span class="eyebrow">A LITTLE HELLO</span><h2>留下你的来信吧。</h2><p>分享一段最近的小确幸，或只是说声你好。</p></div><RouterLink to="/guestbook" class="button button-outline">去留言板看看 <span>↗</span></RouterLink></section>
  </div>

  <div v-else-if="route.name === 'article'" class="article-layout">
    <div v-if="postLoading" class="empty-state"><span class="empty-icon">◌</span><h2>正在寻找这篇文章…</h2><p>请稍等片刻。</p></div>
    <div v-else-if="!post" class="empty-state"><span class="empty-icon">✳</span><h2>暂时找不到这篇文章</h2><p>它可能已经搬家了，去文章列表里逛逛吧。</p><RouterLink class="button button-dark" to="/articles">浏览文章</RouterLink></div>
    <template v-else>
      <RouterLink class="back-link" to="/articles">← 返回文章列表</RouterLink>
      <article class="article">
        <header class="article-header"><span class="eyebrow">{{ post.category || '生活随笔' }}　·　{{ formatDate(post.published_at || post.created_at) }}</span><h1>{{ post.title }}</h1><p class="article-excerpt">{{ post.excerpt }}</p><div class="article-byline"><span class="avatar avatar-small">林</span><span>{{ store.settings.author || '林间来信' }}<small>用一点时间，认真生活。</small></span><button class="like-button" :class="{ liked }" :aria-pressed="liked" @click="toggleLike">♡ <span>{{ likes }}</span> 喜欢</button><button class="like-button bookmark-button" :class="{ liked: bookmarked }" :aria-pressed="bookmarked" @click="toggleBookmark">{{ bookmarked ? '▣ 已收藏' : '▢ 收藏' }} <span>{{ bookmarkCount }}</span></button></div></header>
        <img v-if="post.cover_image" class="article-cover" :src="post.cover_image" :alt="post.title" />
        <div class="markdown-body" v-html="renderMarkdown(post.content)"></div>
        <div class="article-tags"><RouterLink v-for="tag in post.tags || []" :key="tag.slug" :to="{ name: 'tag', params: { slug: tag.slug } }"># {{ tag.name }}</RouterLink></div>
      </article>
      <section class="comment-section"><div class="section-heading"><div><span class="eyebrow">SAY SOMETHING</span><h2>聊一聊</h2></div><span class="muted">{{ comments.length }} 条留言</span></div>
        <form class="form-card comment-form" @submit.prevent="submitComment"><div v-if="replyTo" class="replying-to">正在回复 {{ replyTo.name }} <button type="button" class="text-link" @click="replyTo = null">取消回复</button></div><div class="form-row"><label>怎么称呼你？<input v-model="commentForm.name" required maxlength="80" placeholder="你的名字" /></label><label>邮箱（不会公开）<input v-model="commentForm.email" required type="email" placeholder="you@example.com" /></label></div><label>{{ replyTo ? '写下你的回复' : '写下你的想法' }}<textarea v-model="commentForm.content" required maxlength="3000" rows="4" placeholder="友善交流，让文字继续生长……"></textarea></label><div class="form-footer"><span class="muted">评论经审核后展示 · 邮箱必填且不会公开</span><button class="button button-dark" :disabled="busy">{{ replyTo ? '发送回复 ↗' : '发送留言 ↗' }}</button></div></form>
        <p v-if="notice" class="inline-notice">{{ notice }}</p>
        <div v-for="comment in threadComments" :key="comment.id" class="message-item comment-thread" :class="{ 'comment-reply': comment.depth }" :style="{ marginLeft: `${Math.min(comment.depth, 4) * 22}px` }"><span class="avatar">{{ (comment.name || '友')[0] }}</span><div><b>{{ comment.name }} <small v-if="comment.parentName">回复 {{ comment.parentName }}</small></b><p>{{ comment.content }}</p><small>{{ formatDate(comment.created_at) }}</small></div><button type="button" class="reply-button" @click="replyTo = comment">回复</button></div>
      </section>
    </template>
  </div>

  <div v-else-if="['articles', 'category', 'tag', 'search'].includes(route.name)" class="listing-page">
    <header class="page-heading"><span class="eyebrow">{{ route.name === 'search' ? 'FIND YOUR NOTE' : 'THE JOURNAL' }}</span><h1>{{ route.name === 'category' ? store.categories.find((item) => item.slug === route.params.slug)?.name || '分类文章' : route.name === 'tag' ? `# ${store.tags.find((item) => item.slug === route.params.slug)?.name || route.params.slug}` : route.name === 'search' ? '搜索结果' : pageTitle }}</h1><p>{{ route.name === 'search' ? `关于「${route.query.q || ''}」的文字` : '那些关于日常、远方与自己的记录。' }}</p></header>
    <form v-if="route.name === 'search'" class="search-page-form" @submit.prevent="searchPosts"><input v-model="query" autofocus placeholder="试试搜索：旅行、日常、创作…" aria-label="搜索文章" /><button class="button button-dark">搜索　↗</button></form>
    <div v-if="listLoading && filteredApiPosts === null" class="empty-state"><span class="empty-icon">◌</span><h2>正在整理文章…</h2></div>
    <div v-else-if="visiblePosts.length" class="post-grid listing-grid"><article v-for="item in visiblePosts" :key="item.id" class="post-card"><RouterLink :to="{ name: 'article', params: { slug: item.slug } }" class="post-cover"><img :src="item.cover_image || gallery[0][1]" :alt="item.title" /><span class="cover-arrow">↗</span></RouterLink><div class="post-meta"><span>{{ item.category || '随笔' }}</span><i></i>{{ formatDate(item.published_at || item.created_at) }}</div><h3><RouterLink :to="{ name: 'article', params: { slug: item.slug } }">{{ item.title }}</RouterLink></h3><p>{{ item.excerpt }}</p><div class="tag-line"><RouterLink v-for="tag in item.tags || []" :key="tag.slug" :to="{ name: 'tag', params: { slug: tag.slug } }"># {{ tag.name }}</RouterLink></div></article></div>
    <div v-else class="empty-state"><span class="empty-icon">⌕</span><h2>还没有找到相关文字</h2><p>换个关键词试试，或者看看全部文章。</p><RouterLink class="text-link" to="/articles">返回文章列表 →</RouterLink></div>
  </div>

  <div v-else-if="route.name === 'categories' || route.name === 'tags'" class="listing-page"><header class="page-heading"><span class="eyebrow">ORGANIZE THE STORIES</span><h1>{{ pageTitle }}</h1><p>从不同的角度，重新认识这些日常记录。</p></header>
    <div v-if="route.name === 'categories'" class="taxonomy-grid"><RouterLink v-for="(category, index) in store.categories" :key="category.id" :to="{ name: 'category', params: { slug: category.slug } }" class="taxonomy-card"><span>0{{ index + 1 }}</span><div><h2>{{ category.name }}</h2><p>{{ category.description || '在这里发现相关的故事。' }}</p></div><b>↗</b></RouterLink></div>
    <div v-else class="tag-cloud"><RouterLink v-for="tag in store.tags" :key="tag.id" :to="{ name: 'tag', params: { slug: tag.slug } }"># {{ tag.name }}</RouterLink></div>
  </div>

  <div v-else-if="route.name === 'archives'" class="listing-page"><header class="page-heading"><span class="eyebrow">A TIMELINE OF WORDS</span><h1>{{ pageTitle }}</h1><p>回看每一段曾经认真生活的时光。</p></header><div class="timeline"><section v-for="[month, posts] in archives" :key="month" class="timeline-year"><h2>{{ month.replace('-', ' · ') }}<small>{{ posts.length }} 篇记录</small></h2><div v-for="item in posts" :key="item.id" class="timeline-item"><time>{{ (item.published_at || item.created_at || '').slice(8, 10) }}</time><RouterLink :to="{ name: 'article', params: { slug: item.slug } }">{{ item.title }}</RouterLink><span>{{ item.category || '随笔' }}</span></div></section></div></div>

  <div v-else-if="route.name === 'about'" class="about-page"><div class="about-photo"><img src="https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1100&q=85" alt="窗外晨光与山野" /><span>stay curious, stay kind.</span></div><article class="about-copy"><span class="eyebrow">A LITTLE ABOUT ME</span><h1>你好，我是{{ store.settings.author || '林间来信' }}。</h1><p class="about-lead">{{ store.settings.bio || '喜欢写字、散步，也喜欢在普通的一天里发现一点点新鲜。' }}</p><p>这里是我的个人博客，也是一个收集生活碎片的小角落。我会写旅行路上的见闻、读过的书、偶尔冒出的念头，还有那些不太起眼却让我开心的瞬间。</p><p>希望这些文字，能像一封慢慢抵达的信。谢谢你来这里坐一会儿。</p><div class="about-signature">林间来信 <span>✳</span></div><RouterLink class="button button-dark" to="/guestbook">给我留封信 ↗</RouterLink></article></div>

  <div v-else-if="route.name === 'gallery'" class="listing-page"><header class="page-heading"><span class="eyebrow">SMALL MOMENTS, KEPT</span><h1>{{ pageTitle }}</h1><p>一些没有特别理由，却想好好记住的画面。</p></header><div class="gallery-grid"><figure v-for="[caption, image] in gallery" :key="caption"><img :src="image" :alt="caption" loading="lazy" /><figcaption>{{ caption }} <span>✳</span></figcaption></figure></div></div>

  <div v-else-if="route.name === 'friends'" class="listing-page"><header class="page-heading"><span class="eyebrow">PEOPLE I LIKE TO READ</span><h1>{{ pageTitle }}</h1><p>在网络的一角，遇见认真生活的人。</p></header><div class="friends-grid"><a v-for="(friend, index) in store.friends" :key="friend.id" :href="safeHttpUrl(friend.url)" target="_blank" rel="noopener noreferrer" class="friend-card"><img v-if="friend.avatar" :src="safeHttpUrl(friend.avatar)" :alt="friend.name" /><span v-else class="friend-avatar">{{ friend.name?.[0] || '友' }}</span><div><b>{{ friend.name }}</b><p>{{ friend.description }}</p><small>一个值得常来看看的网站 ↗</small></div><span class="friend-number">0{{ index + 1 }}</span></a></div><div class="friend-invite"><h2>也想出现在友人帐里？</h2><p>留下你的站点信息，一起交换一份网络里的善意。</p><form class="inline-friend-form" @submit.prevent="submitFriend"><input v-model="friendForm.name" placeholder="站点名称" required /><input v-model="friendForm.url" type="url" placeholder="https://your.site" required /><input v-model="friendForm.description" placeholder="一句话介绍（选填）" /><input v-model="friendForm.avatar" type="url" placeholder="头像链接（选填）" /><button class="button button-dark" :disabled="busy">{{ busy ? '正在提交…' : '申请友链 ↗' }}</button></form><p v-if="notice" class="inline-notice" role="status">{{ notice }}</p></div></div>

  <div v-else-if="route.name === 'guestbook'" class="guestbook-page"><header class="page-heading"><span class="eyebrow">LETTERS FROM YOU</span><h1>{{ pageTitle }}</h1><p>欢迎留下几句话。最近读到什么好书？今天的天气怎么样？</p></header><div class="guestbook-layout"><form class="form-card guest-form" @submit.prevent="submitGuestbook"><h2>写一封小小的来信</h2><label>怎么称呼你？<input v-model="guestForm.name" required maxlength="80" placeholder="你的名字" /></label><label>邮箱（选填，不会公开）<input v-model="guestForm.email" type="email" placeholder="hello@example.com" /></label><label>想说些什么？<textarea v-model="guestForm.content" required maxlength="2000" rows="5" placeholder="给我留一句话吧……"></textarea></label><button class="button button-dark" :disabled="busy">送出留言　↗</button><p class="muted">留言将在审核后公开显示。</p><p v-if="notice" class="inline-notice">{{ notice }}</p></form><div class="guestbook-entries"><div class="entries-title"><span class="eyebrow">THE GUESTBOOK</span><span>{{ guestbook.length }} 条留言</span></div><article v-for="entry in guestbook" :key="entry.id" class="guest-entry"><span class="avatar">{{ entry.name?.[0] || '友' }}</span><div><b>{{ entry.name }}</b><small>{{ formatDate(entry.created_at) }}</small><p>{{ entry.content }}</p></div></article><div v-if="!guestbook.length" class="quiet-empty">第一封来信，等你来写。<span>✳</span></div></div></div></div>

  <div v-else-if="route.name === 'tools'" class="listing-page"><header class="page-heading"><span class="eyebrow">TINY HELPERS FOR WRITERS</span><h1>{{ pageTitle }}</h1><p>几个轻巧的小工具，让灵感更顺手一些。</p></header><div class="tools-grid"><section class="tool-card slug-tool"><span class="tool-icon">Aa</span><h2>标题转链接</h2><p>给文章标题生成一个简洁的英文 URL slug。</p><input v-model="slugText" placeholder="输入英文标题或链接" /><div class="slug-output"><code>{{ slugText.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'your-post-title' }}</code><button class="icon-button" aria-label="复制链接" @click="copyText(slugText.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'your-post-title')">▢</button></div></section><section class="tool-card"><span class="tool-icon">¶</span><h2>Markdown 即时预览</h2><p>在写作时预览 Markdown 的排版效果。</p><div class="markdown-tool"><textarea v-model="toolText" aria-label="Markdown 内容" rows="8"></textarea><div class="markdown-body preview-body" v-html="renderMarkdown(toolText)"></div></div><small class="muted">约 {{ wordCount }} 个字 / 词</small></section></div></div>
</template>
