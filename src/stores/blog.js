import { defineStore } from 'pinia'
import { api, messageFrom, payload } from '../services/api'

const demoPosts = [
  {
    id: 'demo-1', slug: 'slow-days-in-kyoto', title: '在京都，把日子过慢一点',
    excerpt: '沿着鸭川散步，在小巷里迷路。旅行最好的部分，或许是终于有时间听见自己的心跳。',
    content: '# 在京都，把日子过慢一点\n\n清晨从一杯手冲咖啡开始。窗外的雨刚刚停，石板路映着薄薄的天光。\n\n> 旅行不是逃离生活，而是让生活重新变得可感。\n\n沿着鸭川往北走，风从水面拂来。没有需要赶赴的地方，也没有必须完成的清单。我们在一间旧书店停留，在街角吃一碗热腾腾的荞麦面，最后把下午交给一场不期而遇的阵雨。\n\n这大概就是我想要的旅行：给日常留一道门，让好奇心自由进出。',
    category: '生活随笔', category_id: null, tags: [{ id: 't1', name: '旅行', slug: 'travel' }, { id: 't2', name: '慢生活', slug: 'slow-living' }],
    cover_image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1400&q=85',
    status: 'published', published_at: '2026-10-08T09:00:00.000Z', created_at: '2026-10-08T09:00:00.000Z',
  },
  {
    id: 'demo-2', slug: 'notes-on-creative-work', title: '关于创造，我最近想明白的几件事',
    excerpt: '不必等到灵感降临才开始。创造力更像一盏灯，先动手，它才会慢慢亮起来。',
    content: '# 关于创造，我最近想明白的几件事\n\n创作不是一个人坐在空房间里等待灵感。它更像每天打开窗户，让风进来。\n\n## 先开始，再变好\n\n我们总想准备充分再动手，但很多答案只有在路上才会出现。给自己二十分钟，写下第一个不那么完美的句子。\n\n## 留白也是工作\n\n散步、做饭、发呆，这些看似无用的时间，常常是想法生长的土壤。',
    category: '创作手记', category_id: null, tags: [{ id: 't3', name: '创作', slug: 'creative-work' }, { id: 't4', name: '思考', slug: 'thoughts' }],
    cover_image: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1400&q=85',
    status: 'published', published_at: '2026-09-24T07:30:00.000Z', created_at: '2026-09-24T07:30:00.000Z',
  },
  {
    id: 'demo-3', slug: 'a-small-garden', title: '阳台上的小小花园',
    excerpt: '三盆植物，一把旧椅子，和每周一次的浇水时间。家的松弛感，就从这里开始。',
    content: '# 阳台上的小小花园\n\n今年春天，我把阳台收拾出来，种了薄荷、迷迭香和一盆不知名的小花。',
    category: '日常片段', category_id: null, tags: [{ id: 't4', name: '思考', slug: 'thoughts' }],
    cover_image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1400&q=85',
    status: 'published', published_at: '2026-09-10T08:00:00.000Z', created_at: '2026-09-10T08:00:00.000Z',
  },
]

const demoCategories = [
  { id: 'c1', name: '生活随笔', slug: 'life', description: '关于日常、旅行与生活的小小记录。' },
  { id: 'c2', name: '创作手记', slug: 'writing', description: '写作、阅读，以及持续创造的练习。' },
  { id: 'c3', name: '日常片段', slug: 'moments', description: '那些值得收藏的平凡瞬间。' },
]
const demoTags = ['旅行', '慢生活', '创作', '思考'].map((name, i) => ({ id: `t${i + 1}`, name, slug: ['travel', 'slow-living', 'creative-work', 'thoughts'][i] }))

export const useBlogStore = defineStore('blog', {
  state: () => ({
    posts: demoPosts,
    categories: demoCategories,
    tags: demoTags,
    friends: [
      { id: 'f1', name: '山野来信', url: 'https://example.com', description: '写作、徒步与远方的风。', avatar: '' },
      { id: 'f2', name: '纸上微光', url: 'https://example.org', description: '一个认真生活的人。', avatar: '' },
    ],
    guestbook: [
      { id: 'g1', name: '小满', email: '', content: '喜欢这里安静的文字，祝你每天都有一点小小的欢喜。', status: 'approved', created_at: '2026-10-09T08:30:00.000Z' },
      { id: 'g2', name: '阿禾', email: 'hello@example.com', content: '想申请交换友链，我也在认真记录日常。', status: 'pending', created_at: '2026-10-12T10:00:00.000Z' },
    ],
    comments: [
      { id: 'c1', post_id: 'demo-1', name: '小满', email: 'hello@example.com', content: '读完也想去鸭川边走走，谢谢你的分享。', status: 'approved', created_at: '2026-10-10T09:15:00.000Z' },
      { id: 'c2', post_id: 'demo-2', name: '阿禾', email: 'he@example.com', content: '“先开始，再变好”这句话给了我很多勇气。', status: 'pending', created_at: '2026-10-11T12:00:00.000Z' },
    ],
    settings: { siteTitle: '拾光手记', tagline: '把平凡日子，写成值得回看的故事。', author: '林间来信', bio: '独立写作者 / 慢跑爱好者 / 咖啡初学者' },
    apiOnline: null,
    apiError: '',
    loading: false,
    token: localStorage.getItem('blog-admin-token') || '',
    adminName: localStorage.getItem('blog-admin-name') || '管理员',
  }),
  getters: {
    publishedPosts: (state) => state.posts.filter((post) => post.status === 'published').sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at)),
  },
  actions: {
    async loadPublic() {
      this.loading = true
      const requests = [
        ['posts', () => api.get('/posts?page=1&limit=50'), (data) => Array.isArray(data) ? data : data?.data],
        ['categories', () => api.get('/categories'), (data) => data],
        ['tags', () => api.get('/tags'), (data) => data],
        ['friends', () => api.get('/friends'), (data) => data],
        ['settings', () => api.get('/settings'), (data) => data],
      ]
      let succeeded = 0
      const results = await Promise.allSettled(requests.map(([, call]) => call()))
      results.forEach((result, index) => {
        const [key, , normalize] = requests[index]
        if (result.status === 'fulfilled') {
          const data = normalize(payload(result.value))
          if (key === 'settings') this.settings = { ...this.settings, ...data }
          else if (Array.isArray(data)) this[key] = data
          succeeded += 1
        } else if (!this.apiError) this.apiError = messageFrom(result.reason)
      })
      this.apiOnline = succeeded > 0
      if (succeeded) this.apiError = ''
      this.loading = false
    },
    async getPost(slug) {
      const existing = this.posts.find((post) => post.slug === slug)
      try {
        const post = payload(await api.get(`/posts/${encodeURIComponent(slug)}`))
        const index = this.posts.findIndex((item) => item.slug === slug)
        if (index >= 0) this.posts[index] = { ...this.posts[index], ...post }
        else this.posts.unshift(post)
        this.apiOnline = true
        return post
      } catch (error) {
        if (existing) return existing
        this.apiError = messageFrom(error)
        return null
      }
    },
    async login(username, password) {
      try {
        const response = await api.post('/auth/login', { username, password })
        const data = payload(response)
        this.token = data.access_token
        this.adminName = username
        localStorage.setItem('blog-admin-token', this.token)
        localStorage.setItem('blog-admin-name', username)
        this.apiOnline = true
        return { ok: true }
      } catch (error) {
        if (!error.response && username === 'admin' && password === 'admin') {
          this.token = 'local-demo-session'
          this.adminName = username
          localStorage.setItem('blog-admin-token', this.token)
          localStorage.setItem('blog-admin-name', username)
          return { ok: true, demo: true }
        }
        return { ok: false, error: messageFrom(error) }
      }
    },
    logout() {
      this.token = ''
      localStorage.removeItem('blog-admin-token')
      localStorage.removeItem('blog-admin-name')
    },
  },
})

export { demoPosts }
