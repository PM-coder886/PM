import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('./views/BlogPage.vue') },
  { path: '/articles', name: 'articles', component: () => import('./views/BlogPage.vue') },
  { path: '/article/:slug', name: 'article', component: () => import('./views/BlogPage.vue') },
  { path: '/categories', name: 'categories', component: () => import('./views/BlogPage.vue') },
  { path: '/category/:slug', name: 'category', component: () => import('./views/BlogPage.vue') },
  { path: '/tags', name: 'tags', component: () => import('./views/BlogPage.vue') },
  { path: '/tag/:slug', name: 'tag', component: () => import('./views/BlogPage.vue') },
  { path: '/archives', name: 'archives', component: () => import('./views/BlogPage.vue') },
  { path: '/search', name: 'search', component: () => import('./views/BlogPage.vue') },
  { path: '/about', name: 'about', component: () => import('./views/BlogPage.vue') },
  { path: '/gallery', name: 'gallery', component: () => import('./views/BlogPage.vue') },
  { path: '/friends', name: 'friends', component: () => import('./views/BlogPage.vue') },
  { path: '/guestbook', name: 'guestbook', component: () => import('./views/BlogPage.vue') },
  { path: '/tools', name: 'tools', component: () => import('./views/BlogPage.vue') },
  { path: '/admin/login', name: 'admin-login', component: () => import('./views/AdminPage.vue') },
  { path: '/admin', name: 'admin', component: () => import('./views/AdminPage.vue'), meta: { requiresAuth: true } },
  { path: '/admin/posts', name: 'admin-posts', component: () => import('./views/AdminPage.vue'), meta: { requiresAuth: true } },
  { path: '/admin/posts/new', name: 'admin-post-new', component: () => import('./views/AdminPage.vue'), meta: { requiresAuth: true } },
  { path: '/admin/posts/:id', name: 'admin-post-edit', component: () => import('./views/AdminPage.vue'), meta: { requiresAuth: true } },
  { path: '/admin/comments', name: 'admin-comments', component: () => import('./views/AdminPage.vue'), meta: { requiresAuth: true } },
  { path: '/admin/community', name: 'admin-community', component: () => import('./views/AdminPage.vue'), meta: { requiresAuth: true } },
  { path: '/admin/settings', name: 'admin-settings', component: () => import('./views/AdminPage.vue'), meta: { requiresAuth: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({ history: createWebHistory(), routes, scrollBehavior: () => ({ top: 0 }) })

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !localStorage.getItem('blog-admin-token')) {
    return { name: 'admin-login', query: { redirect: to.fullPath } }
  }
})

export default router
