<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useBlogStore } from './stores/blog'

const store = useBlogStore()
const route = useRoute()
const router = useRouter()
const search = ref('')
const menuOpen = ref(false)
const isDark = ref(localStorage.getItem('blog-theme') === 'dark')
const isAdmin = computed(() => route.path.startsWith('/admin'))
const navItems = [
  { label: '首页', to: '/' }, { label: '文章', to: '/articles' },
  { label: '分类', to: '/categories' }, { label: '归档', to: '/archives' },
  { label: '关于', to: '/about' },
]

function toggleTheme() {
  isDark.value = !isDark.value
  localStorage.setItem('blog-theme', isDark.value ? 'dark' : 'light')
}
function doSearch() {
  if (!search.value.trim()) return
  router.push({ name: 'search', query: { q: search.value.trim() } })
  menuOpen.value = false
}
watch(isDark, (value) => document.documentElement.classList.toggle('dark', value), { immediate: true })
watch(() => route.fullPath, () => { menuOpen.value = false })
onMounted(() => store.loadPublic())
</script>

<template>
  <div class="site-shell" :class="{ 'admin-shell': isAdmin }">
    <template v-if="!isAdmin">
      <header class="site-header">
        <div class="header-inner">
          <RouterLink class="brand" to="/" aria-label="拾光手记首页">
            <span class="brand-mark">拾</span>
            <span class="brand-copy"><strong>{{ store.settings.siteTitle }}</strong><small>NOTES FROM THE EVERYDAY</small></span>
          </RouterLink>
          <button class="mobile-menu icon-button" :aria-label="menuOpen ? '关闭菜单' : '打开菜单'" @click="menuOpen = !menuOpen">☰</button>
          <nav class="main-nav" :class="{ open: menuOpen }" aria-label="主导航">
            <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" :class="{ active: route.path === item.to }">{{ item.label }}</RouterLink>
            <RouterLink to="/gallery">相册</RouterLink>
            <RouterLink to="/friends">友链</RouterLink>
            <RouterLink to="/guestbook">留言</RouterLink>
            <RouterLink to="/tools">工具箱</RouterLink>
          </nav>
          <div class="header-actions">
            <form class="header-search" role="search" @submit.prevent="doSearch">
              <span aria-hidden="true">⌕</span><input v-model="search" aria-label="搜索文章" placeholder="搜索…" />
            </form>
            <button class="icon-button theme-button" :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'" @click="toggleTheme">{{ isDark ? '☼' : '☾' }}</button>
          </div>
        </div>
      </header>
      <div v-if="store.apiOnline === false" class="connection-note">
        <span>◌</span> 当前为本地预览模式，内容可浏览；连接 API 后即可同步文章与留言。
      </div>
      <main class="page-wrap"><RouterView /></main>
      <footer class="site-footer">
        <div><RouterLink to="/" class="footer-brand">拾光手记</RouterLink><span>把平凡日子，写成值得回看的故事。</span></div>
        <span>用心记录 · 慢慢生活　 © {{ new Date().getFullYear() }} {{ store.settings.author || '林间来信' }}</span>
        <RouterLink to="/admin/login" class="admin-entry">管理入口</RouterLink>
      </footer>
    </template>
    <RouterView v-else />
  </div>
</template>
