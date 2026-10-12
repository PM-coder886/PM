<script setup lang="ts">
import { ref } from 'vue'

type Theme = 'light' | 'dark'

const storageKey = 'vibe-coding-runoob-theme'

const getInitialTheme = (): Theme => {
  try {
    const savedTheme = localStorage.getItem(storageKey)
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme
  } catch {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const theme = ref<Theme>(getInitialTheme())

const applyTheme = (nextTheme: Theme, savePreference = false) => {
  document.documentElement.classList.toggle('dark', nextTheme === 'dark')
  if (!savePreference) return

  try {
    localStorage.setItem(storageKey, nextTheme)
  } catch {
    return
  }
}

applyTheme(theme.value)

const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme(theme.value, true)
}
</script>

<template>
  <button
    type="button"
    class="grid size-11 place-items-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
    :aria-label="theme === 'dark' ? '切换亮色模式' : '切换深色模式'"
    :title="theme === 'dark' ? '切换亮色模式' : '切换深色模式'"
    @click="toggleTheme"
  >
    <svg v-if="theme === 'dark'" viewBox="0 0 24 24" fill="none" class="size-5" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.7" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
    </svg>
    <svg v-else viewBox="0 0 24 24" fill="none" class="size-5" aria-hidden="true">
      <path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
    </svg>
  </button>
</template>