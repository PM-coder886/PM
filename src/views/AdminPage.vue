<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { api, messageFrom, payload } from '../services/api'
import { useBlogStore } from '../stores/blog'

const store = useBlogStore()
const route = useRoute()
const router = useRouter()
const username = ref('')
const password = ref('')
const loginError = ref('')
const localPreview = ref(false)
const darkMode = ref(document.documentElement.classList.contains('dark'))
const adminPosts = ref([])
const adminComments = ref([])
const adminGuestbook = ref([])
const adminFriends = ref([])
const selectedCommunity = ref('comments')
const statusFilter = ref('')
const searchText = ref('')
const notice = ref('')
const busy = ref(false)
const editor = ref({ id: '', slug: '', title: '', excerpt: '', content: '', cover_image: '', status: 'draft', scheduled_at: '', category_id: '', tag_ids: [] })
const settingsForm = ref({ ...store.settings })
const taxonomyForm = ref({ category: { name: '', slug: '', description: '' }, tag: { name: '', slug: '' } })
const friendForm = ref({ name: '', url: '', description: '', avatar: '', status: 'approved', sort_order: 0 })
const currentPage = computed(() => route.name)
const demoMode = computed(() => store.token === 'local-demo-session')
const title = computed(() => ({
  admin: '工作台', 'admin-posts': '文章管理', 'admin-post-new': '写一篇新文章',
  'admin-post-edit': '编辑文章', 'admin-comments': '评论管理', 'admin-community': '社区管理',
  'admin-settings': '站点设置',
}[currentPage.value] || '工作台'))
const filteredPosts = computed(() => adminPosts.value.filter((post) => (!statusFilter.value || post.status === statusFilter.value) && (!searchText.value || `${post.title} ${post.slug}`.toLowerCase().includes(searchText.value.toLowerCase()))))

async function loadAdmin() {
  if (!store.token || route.name === 'admin-login') return
  try {
    const result = payload(await api.get('/admin/posts?page=1&limit=100'))
    adminPosts.value = result?.data || result || []
    if (Array.isArray(adminPosts.value)) store.posts = [...new Map([...store.posts, ...adminPosts.value].map((post) => [post.id, post])).values()]
  } catch { adminPosts.value = [...store.posts] }
  if (route.name === 'admin-comments' || route.name === 'admin-community') await loadCommunity()
  if (route.name === 'admin-settings') {
    try { settingsForm.value = { ...settingsForm.value, ...(payload(await api.get('/settings')) || {}) } } catch { /* keep editable local settings */ }
  }
  if (route.name === 'admin-post-edit') await loadEditor(route.params.id)
}
async function loadCommunity() {
  try {
    const [comments, guestbook, friends, categories, tags] = await Promise.all([
      api.get('/admin/comments?limit=100'), api.get('/admin/guestbook'), api.get('/admin/friends'),
      api.get('/categories'), api.get('/tags'),
    ])
    adminComments.value = payload(comments) || []
    adminGuestbook.value = payload(guestbook) || []
    adminFriends.value = payload(friends) || []
    store.categories = payload(categories) || store.categories
    store.tags = payload(tags) || store.tags
  } catch {
    adminComments.value = store.comments
    adminGuestbook.value = store.guestbook
    adminFriends.value = store.friends
  }
}
async function loadEditor(id) {
  const existing = adminPosts.value.find((post) => post.id === id) || store.posts.find((post) => post.id === id)
  if (existing) editor.value = { ...editor.value, ...existing, category_id: existing.category_id || '', tag_ids: (existing.tags || []).map((tag) => tag.id), cover_image: existing.cover_image || '', scheduled_at: existing.scheduled_at ? new Date(existing.scheduled_at).toISOString().slice(0, 16) : '' }
  try {
    const data = payload(await api.get(`/admin/posts/${id}`))
    editor.value = { ...editor.value, ...data, category_id: data.category_id || '', tag_ids: (data.tags || []).map((tag) => tag.id), cover_image: data.cover_image || '', scheduled_at: data.scheduled_at ? new Date(data.scheduled_at).toISOString().slice(0, 16) : '' }
  } catch { /* use local post when API is offline */ }
}
watch(() => route.fullPath, loadAdmin)
onMounted(() => {
  localPreview.value = demoMode.value
  loadAdmin()
})

async function login() {
  loginError.value = ''
  busy.value = true
  const result = await store.login(username.value, password.value)
  busy.value = false
  if (!result.ok) { loginError.value = result.error; return }
  localPreview.value = Boolean(result.demo)
  const redirect = String(route.query.redirect || '/admin')
  router.replace(redirect.startsWith('/admin') ? redirect : '/admin')
}
function logout() { store.logout(); router.replace('/admin/login') }
function newPost() {
  editor.value = { id: '', slug: `new-note-${new Date().toISOString().slice(0, 10)}`, title: '', excerpt: '', content: '', cover_image: '', status: 'draft', scheduled_at: '', category_id: '', tag_ids: [] }
  router.push('/admin/posts/new')
}
function editPost(post) { router.push(`/admin/posts/${post.id}`) }
function formPayload() {
  const result = { slug: editor.value.slug.trim(), title: editor.value.title.trim(), excerpt: editor.value.excerpt, content: editor.value.content, status: editor.value.status, category_id: editor.value.category_id || null, tag_ids: editor.value.tag_ids || [], cover_image: editor.value.cover_image || null }
  if (result.status === 'scheduled' && editor.value.scheduled_at) result.scheduled_at = new Date(editor.value.scheduled_at).toISOString()
  return result
}
async function savePost() {
  busy.value = true
  notice.value = ''
  const data = formPayload()
  if (!data.title || !data.slug || !data.content) { notice.value = '标题、链接和正文不能为空。'; busy.value = false; return }
  try {
    const response = editor.value.id ? await api.patch(`/posts/${editor.value.id}`, data) : await api.post('/posts', data)
    const saved = payload(response)
    const localPost = { ...data, ...saved, id: saved.id || editor.value.id || `local-${Date.now()}`, category: store.categories.find((category) => category.id === data.category_id)?.name || '', tags: store.tags.filter((tag) => data.tag_ids.includes(tag.id)), published_at: data.status === 'published' ? new Date().toISOString() : null, created_at: new Date().toISOString() }
    upsertPost(localPost)
    notice.value = '文章已保存。'
    router.push('/admin/posts')
  } catch (error) {
    if (!error.response || demoMode.value) {
      const localPost = { ...data, id: editor.value.id || `local-${Date.now()}`, category: store.categories.find((category) => category.id === data.category_id)?.name || '', tags: store.tags.filter((tag) => data.tag_ids.includes(tag.id)), published_at: data.status === 'published' ? new Date().toISOString() : null, created_at: new Date().toISOString() }
      upsertPost(localPost)
      notice.value = 'API 暂不可用，文章仅保存在当前预览会话中。'
      router.push('/admin/posts')
    } else notice.value = messageFrom(error)
  }
  busy.value = false
}
function upsertPost(post) {
  store.posts = [post, ...store.posts.filter((item) => item.id !== post.id)]
  adminPosts.value = [post, ...adminPosts.value.filter((item) => item.id !== post.id)]
}
async function deletePost(post) {
  if (!window.confirm(`确定删除《${post.title}》吗？`)) return
  try { await api.delete(`/posts/${post.id}`) } catch (error) { if (error.response && !demoMode.value) { notice.value = messageFrom(error); return } }
  adminPosts.value = adminPosts.value.filter((item) => item.id !== post.id)
  store.posts = store.posts.filter((item) => item.id !== post.id)
  notice.value = '文章已删除。'
}
async function moderate(kind, item, status) {
  const path = kind === 'comment' ? `/admin/comments/${item.id}` : kind === 'guestbook' ? `/admin/guestbook/${item.id}` : `/admin/friends/${item.id}`
  try { await api.patch(path, { status }) } catch (error) { if (error.response && !demoMode.value) { notice.value = messageFrom(error); return } }
  item.status = status
  notice.value = status === 'approved' ? '已通过审核。' : '状态已更新。'
}
async function removeCommunity(kind, item) {
  const path = kind === 'comment' ? `/admin/comments/${item.id}` : kind === 'guestbook' ? `/admin/guestbook/${item.id}` : `/admin/friends/${item.id}`
  try { await api.delete(path) } catch (error) { if (error.response && !demoMode.value) { notice.value = messageFrom(error); return } }
  const collection = kind === 'comment' ? adminComments : kind === 'guestbook' ? adminGuestbook : adminFriends
  collection.value = collection.value.filter((entry) => entry.id !== item.id)
}
async function createTaxonomy(kind) {
  const form = taxonomyForm.value[kind]
  if (!form.name || !form.slug) { notice.value = '请填写名称和英文链接。'; return }
  const path = kind === 'category' ? '/categories' : '/tags'
  try {
    const result = payload(await api.post(path, form))
    store[kind === 'category' ? 'categories' : 'tags'].push(result)
    taxonomyForm.value[kind] = { name: '', slug: '', ...(kind === 'category' ? { description: '' } : {}) }
    notice.value = '已新增。'
  } catch (error) {
    if (!error.response || demoMode.value) {
      const collection = store[kind === 'category' ? 'categories' : 'tags']
      collection.push({ id: `local-${Date.now()}`, ...form })
      taxonomyForm.value[kind] = { name: '', slug: '', ...(kind === 'category' ? { description: '' } : {}) }
      notice.value = '已在本地预览中新增。'
    } else notice.value = messageFrom(error)
  }
}
async function deleteTaxonomy(kind, item) {
  const path = kind === 'category' ? '/categories' : '/tags'
  try { await api.delete(`${path}/${item.id}`) } catch (error) { if (error.response && !demoMode.value) { notice.value = messageFrom(error); return } }
  const key = kind === 'category' ? 'categories' : 'tags'
  store[key] = store[key].filter((row) => row.id !== item.id)
}
async function createFriend() {
  try {
    const friend = payload(await api.post('/admin/friends', friendForm.value))
    adminFriends.value.unshift(friend)
    friendForm.value = { name: '', url: '', description: '', avatar: '', status: 'approved', sort_order: 0 }
    notice.value = '友链已添加。'
  } catch (error) {
    if (!error.response || demoMode.value) {
      adminFriends.value.unshift({ ...friendForm.value, id: `local-${Date.now()}` })
      friendForm.value = { name: '', url: '', description: '', avatar: '', status: 'approved', sort_order: 0 }
      notice.value = '已在本地预览中添加友链。'
    } else notice.value = messageFrom(error)
  }
}
async function saveSettings() {
  try {
    await api.put('/admin/settings', settingsForm.value)
    store.settings = { ...settingsForm.value }
    notice.value = '站点设置已保存。'
  } catch (error) {
    if (!error.response || demoMode.value) {
      store.settings = { ...settingsForm.value }
      notice.value = '已在本地预览中更新；连接 API 后可同步到站点。'
    } else notice.value = messageFrom(error)
  }
}
async function uploadCover(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const form = new FormData()
  form.append('file', file)
  try {
    const result = payload(await api.post('/admin/uploads', form))
    editor.value.cover_image = result.url
    notice.value = '图片上传成功。'
  } catch (error) {
    if (!error.response || demoMode.value) {
      editor.value.cover_image = URL.createObjectURL(file)
      notice.value = '封面仅在当前预览会话中可见；连接 API 后即可上传保存。'
    } else notice.value = messageFrom(error)
  }
}
function toSlug(value) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function toggleAdminTheme() {
  darkMode.value = !darkMode.value
  document.documentElement.classList.toggle('dark', darkMode.value)
  localStorage.setItem('blog-theme', darkMode.value ? 'dark' : 'light')
}
</script>

<template>
  <div v-if="route.name === 'admin-login'" class="admin-login-wrap">
    <RouterLink to="/" class="login-back">← 回到拾光手记</RouterLink>
    <form class="login-card" @submit.prevent="login"><span class="brand-mark">拾</span><span class="eyebrow">WELCOME BACK</span><h1>管理后台</h1><p>登录后，继续整理你的文字与日常。</p><label>管理员账号<input v-model="username" required autocomplete="username" placeholder="输入账号" /></label><label>登录密码<input v-model="password" required type="password" autocomplete="current-password" placeholder="输入密码" /></label><p v-if="loginError" class="form-error">{{ loginError }}</p><button class="button button-dark login-submit" :disabled="busy">{{ busy ? '正在登录…' : '登录后台　→' }}</button><small class="muted login-hint">本地预览：API 不可用时可使用 admin / admin</small></form>
  </div>
  <div v-else class="admin-layout">
    <aside class="admin-sidebar"><RouterLink to="/" class="admin-brand"><span class="brand-mark">拾</span><span>拾光手记<small>STUDIO</small></span></RouterLink><div class="sidebar-label">工作空间</div><RouterLink to="/admin" class="admin-nav-link" :class="{ selected: route.name === 'admin' }"><span>⌂</span> 概览</RouterLink><RouterLink to="/admin/posts" class="admin-nav-link" :class="{ selected: route.path.includes('/posts') }"><span>▤</span> 文章管理</RouterLink><RouterLink to="/admin/comments" class="admin-nav-link" :class="{ selected: route.name === 'admin-comments' }"><span>◌</span> 评论审核</RouterLink><RouterLink to="/admin/community" class="admin-nav-link" :class="{ selected: route.name === 'admin-community' }"><span>♡</span> 社区与友链</RouterLink><RouterLink to="/admin/settings" class="admin-nav-link" :class="{ selected: route.name === 'admin-settings' }"><span>⚙</span> 站点设置</RouterLink><div class="sidebar-bottom"><span class="avatar avatar-small">{{ store.adminName[0] || '管' }}</span><span>{{ store.adminName }}<small>站点管理员</small></span><button class="icon-button" aria-label="退出登录" title="退出登录" @click="logout">↗</button></div></aside>
    <main class="admin-main"><header class="admin-topbar"><div><span class="eyebrow">YOUR SPACE / {{ title }}</span><h1>{{ title }}</h1></div><div class="admin-top-actions"><span v-if="localPreview" class="preview-pill">本地预览</span><RouterLink to="/" class="text-link">查看网站 ↗</RouterLink><button class="icon-button" :aria-label="darkMode ? '切换到浅色模式' : '切换到深色模式'" title="切换主题" @click="toggleAdminTheme">{{ darkMode ? '☼' : '☾' }}</button><button class="icon-button" title="退出登录" @click="logout">⇥</button></div></header>
      <p v-if="notice" class="admin-notice">{{ notice }}</p>
      <template v-if="route.name === 'admin'">
        <section class="welcome-card"><div><span class="eyebrow">一个新的好日子</span><h2>你好，{{ store.adminName }}。<br />今天也写下一点什么吧。</h2><p>你的个人博客正在静静等候下一篇故事。</p><button class="button button-dark" @click="newPost">开始写作　↗</button></div><div class="welcome-plant">✳<small>WRITE<br />A LITTLE</small></div></section>
        <div class="stats-grid"><div class="stat-card"><span>全部文章</span><strong>{{ adminPosts.length || store.posts.length }}</strong><RouterLink to="/admin/posts">查看文章　→</RouterLink></div><div class="stat-card"><span>已发布</span><strong>{{ store.publishedPosts.length }}</strong><small>正在与世界分享</small></div><div class="stat-card"><span>分类 / 标签</span><strong>{{ store.categories.length }} <i>/</i> {{ store.tags.length }}</strong><RouterLink to="/admin/community">管理内容　→</RouterLink></div></div>
        <section class="admin-panel"><div class="panel-heading"><div><span class="eyebrow">LATEST STORIES</span><h2>最近的文章</h2></div><RouterLink class="text-link" to="/admin/posts">全部文章 →</RouterLink></div><div v-for="item in adminPosts.slice(0, 5)" :key="item.id" class="admin-post-row"><div><b>{{ item.title }}</b><small>{{ item.category || '未分类' }} · {{ item.slug }}</small></div><span class="status-pill" :class="`status-${item.status}`">{{ { published: '已发布', draft: '草稿', scheduled: '定时' }[item.status] || item.status }}</span><button class="text-link" @click="editPost(item)">编辑 ↗</button></div></section>
      </template>
      <template v-else-if="route.name === 'admin-posts'">
        <section class="admin-panel"><div class="list-toolbar"><div class="toolbar-search"><span>⌕</span><input v-model="searchText" placeholder="搜索文章标题或链接…" /></div><select v-model="statusFilter" aria-label="筛选文章状态"><option value="">全部状态</option><option value="published">已发布</option><option value="draft">草稿</option><option value="scheduled">定时发布</option></select><button class="button button-dark" @click="newPost">＋ 写文章</button></div><div v-if="filteredPosts.length" class="admin-table"><div class="table-head"><span>文章</span><span>状态</span><span>更新时间</span><span>操作</span></div><div v-for="item in filteredPosts" :key="item.id" class="table-row"><div><b>{{ item.title }}</b><small>{{ item.slug }}</small></div><span class="status-pill" :class="`status-${item.status}`">{{ { published: '已发布', draft: '草稿', scheduled: '定时' }[item.status] || item.status }}</span><span class="muted">{{ (item.updated_at || item.created_at || '').slice(0, 10) }}</span><div class="row-actions"><button @click="editPost(item)">编辑</button><button class="delete-action" @click="deletePost(item)">删除</button></div></div></div><div v-else class="quiet-empty">还没有文章，写下第一篇吧。✳</div></section>
      </template>
      <template v-else-if="route.name === 'admin-post-new' || route.name === 'admin-post-edit'">
        <div class="editor-layout"><section class="admin-panel editor-main"><label>文章标题<input v-model="editor.title" class="editor-title-input" placeholder="给这篇文章起个名字…" @input="!editor.id && (editor.slug = toSlug(editor.title) || editor.slug)" /></label><label>文章链接 <div class="slug-field"><span>/article/</span><input v-model="editor.slug" placeholder="a-little-story" /></div></label><label>文章摘要<textarea v-model="editor.excerpt" maxlength="500" rows="2" placeholder="用一两句话介绍这篇文章…"></textarea></label><label>正文内容 <small class="muted">支持 Markdown</small><textarea v-model="editor.content" class="editor-content" rows="22" placeholder="# 从这里开始写…"></textarea></label></section><aside class="editor-aside"><section class="admin-panel"><h3>发布设置</h3><label>状态<select v-model="editor.status"><option value="draft">保存为草稿</option><option value="published">立即发布</option><option value="scheduled">定时发布</option></select></label><label v-if="editor.status === 'scheduled'">发布时间<input v-model="editor.scheduled_at" type="datetime-local" /></label><label>文章分类<select v-model="editor.category_id"><option value="">未分类</option><option v-for="category in store.categories" :key="category.id" :value="category.id">{{ category.name }}</option></select></label><div class="tag-checks"><span>文章标签</span><label v-for="tag in store.tags" :key="tag.id"><input v-model="editor.tag_ids" type="checkbox" :value="tag.id" /> {{ tag.name }}</label></div></section><section class="admin-panel"><h3>封面图片</h3><input v-model="editor.cover_image" placeholder="图片 URL" /><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" @change="uploadCover" /><img v-if="editor.cover_image" class="cover-preview" :src="editor.cover_image" alt="文章封面预览" /></section><button class="button button-dark save-article" :disabled="busy" @click="savePost">保存文章　↗</button><RouterLink to="/admin/posts" class="cancel-edit">取消，返回文章列表</RouterLink></aside></div>
      </template>
      <template v-else-if="route.name === 'admin-comments'">
        <section class="admin-panel"><div class="panel-heading"><div><span class="eyebrow">KIND WORDS</span><h2>读者评论</h2></div><select v-model="selectedCommunity"><option value="comments">文章评论</option><option value="guestbook">留言板</option></select></div><div v-for="item in (selectedCommunity === 'comments' ? adminComments : adminGuestbook)" :key="item.id" class="moderation-row"><div class="avatar">{{ item.name?.[0] || '友' }}</div><div class="moderation-content"><b>{{ item.name }} <small>{{ item.email || '' }}</small></b><p>{{ item.content }}</p><small>{{ item.created_at }}</small></div><span class="status-pill" :class="`status-${item.status}`">{{ item.status }}</span><div class="moderation-actions"><button @click="moderate(selectedCommunity === 'comments' ? 'comment' : 'guestbook', item, 'approved')">通过</button><button @click="moderate(selectedCommunity === 'comments' ? 'comment' : 'guestbook', item, 'rejected')">拒绝</button><button class="delete-action" @click="removeCommunity(selectedCommunity === 'comments' ? 'comment' : 'guestbook', item)">删除</button></div></div><div v-if="!(selectedCommunity === 'comments' ? adminComments : adminGuestbook).length" class="quiet-empty">暂时没有需要审核的内容。</div></section>
      </template>
      <template v-else-if="route.name === 'admin-community'">
        <section class="admin-panel community-panel"><div class="panel-heading"><div><span class="eyebrow">YOUR LITTLE CORNER</span><h2>分类与标签</h2></div></div><div class="taxonomy-admin-columns"><div><h3>文章分类</h3><form class="taxonomy-add-form" @submit.prevent="createTaxonomy('category')"><input v-model="taxonomyForm.category.name" required placeholder="分类名称" /><input v-model="taxonomyForm.category.slug" required placeholder="英文链接" /><input v-model="taxonomyForm.category.description" placeholder="一句话介绍" /><button class="button button-dark">新增</button></form><div v-for="item in store.categories" :key="item.id" class="taxonomy-admin-row"><span>{{ item.name }} <small>/{{ item.slug }}</small></span><button class="delete-action" @click="deleteTaxonomy('category', item)">移除</button></div></div><div><h3>文章标签</h3><form class="taxonomy-add-form" @submit.prevent="createTaxonomy('tag')"><input v-model="taxonomyForm.tag.name" required placeholder="标签名称" /><input v-model="taxonomyForm.tag.slug" required placeholder="英文链接" /><button class="button button-dark">新增</button></form><div v-for="item in store.tags" :key="item.id" class="taxonomy-admin-row"><span># {{ item.name }} <small>/{{ item.slug }}</small></span><button class="delete-action" @click="deleteTaxonomy('tag', item)">移除</button></div></div></div></section>
        <section class="admin-panel"><div class="panel-heading"><div><span class="eyebrow">BLOGROLL</span><h2>友链管理</h2></div></div><form class="friend-admin-form" @submit.prevent="createFriend"><input v-model="friendForm.name" required placeholder="站点名称" /><input v-model="friendForm.url" required type="url" placeholder="https://example.com" /><input v-model="friendForm.description" placeholder="站点简介" /><select v-model="friendForm.status"><option value="approved">直接展示</option><option value="pending">待审核</option></select><button class="button button-dark">添加友链</button></form><div v-for="friend in adminFriends" :key="friend.id" class="taxonomy-admin-row"><span>{{ friend.name }} <small>{{ friend.url }} · {{ friend.status }}</small></span><div><button @click="moderate('friend', friend, friend.status === 'approved' ? 'pending' : 'approved')">{{ friend.status === 'approved' ? '隐藏' : '通过' }}</button><button class="delete-action" @click="removeCommunity('friend', friend)">删除</button></div></div><div v-if="!adminFriends.length" class="quiet-empty">添加一些你喜欢的网站。</div></section>
        <section class="admin-panel"><div class="panel-heading"><div><span class="eyebrow">COMMUNITY CARE</span><h2>快速审核留言</h2></div><RouterLink to="/admin/comments" class="text-link">全部审核 →</RouterLink></div><div v-for="entry in adminGuestbook.filter((item) => item.status === 'pending').slice(0, 4)" :key="entry.id" class="taxonomy-admin-row"><span>{{ entry.name }} <small>{{ entry.content }}</small></span><button @click="moderate('guestbook', entry, 'approved')">通过</button></div></section>
      </template>
      <template v-else-if="route.name === 'admin-settings'">
        <section class="admin-panel settings-panel"><span class="eyebrow">MAKE IT YOURS</span><h2>站点信息</h2><p class="muted">这些公开信息会显示在博客首页与关于页面。</p><label>站点名称<input v-model="settingsForm.siteTitle" /></label><label>首页副标题<input v-model="settingsForm.tagline" /></label><label>作者昵称<input v-model="settingsForm.author" /></label><label>个人简介<textarea v-model="settingsForm.bio" rows="4"></textarea></label><button class="button button-dark" @click="saveSettings">保存设置　↗</button></section><section class="admin-panel settings-panel"><span class="eyebrow">CONNECTION</span><h2>API 服务</h2><p>API 地址由 <code>VITE_API_BASE_URL</code> 配置，默认连接本地 <code>http://localhost:8787/api/v1</code>。</p><span class="connection-status"><i :class="{ online: store.apiOnline }"></i>{{ store.apiOnline ? '服务已连接' : '本地预览模式' }}</span></section>
      </template>
    </main>
  </div>
</template>
