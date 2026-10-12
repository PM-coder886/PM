<script setup lang="ts">
import { ref } from 'vue'
import KanbanBoard from './components/KanbanBoard.vue'
import TaskList from './components/TaskList.vue'
import TaskModal from './components/TaskModal.vue'
import ThemeToggle from './components/ThemeToggle.vue'
import { addTask, deleteTask, taskStore, updateTask } from './stores/taskStore'
import type { Task, TaskStatus } from './types/task'

const isTaskModalOpen = ref(false)
const activeView = ref<'list' | 'kanban'>('list')
const isMenuOpen = ref(false)

const toggleTask = (task: Task) => {
  updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' })
}

const moveTask = (taskId: string, status: TaskStatus) => {
  updateTask(taskId, { status })
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <header class="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <nav class="relative mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8" aria-label="主导航">
        <a href="#" class="flex min-w-0 items-center gap-3 font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">V</span>
          <span class="truncate">Vibe Coding Test</span>
        </a>
        <div class="flex shrink-0 items-center gap-2">
          <span class="hidden text-sm text-slate-500 dark:text-slate-400 md:block">任务管理</span>
          <ThemeToggle />
          <button
            type="button"
            class="grid size-11 place-items-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
            :aria-label="isMenuOpen ? '关闭导航菜单' : '打开导航菜单'"
            :aria-expanded="isMenuOpen"
            aria-controls="mobile-navigation"
            @click="isMenuOpen = !isMenuOpen"
          >
            <svg v-if="!isMenuOpen" viewBox="0 0 24 24" fill="none" class="size-5" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" class="size-5" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <div
          v-if="isMenuOpen"
          id="mobile-navigation"
          class="absolute inset-x-0 top-full z-40 space-y-1 border-b border-slate-200 bg-white px-5 py-3 shadow-md dark:border-slate-800 dark:bg-slate-900 md:hidden"
        >
          <button
            type="button"
            class="min-h-11 w-full rounded-md px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="activeView = 'list'; isMenuOpen = false"
          >
            列表视图
          </button>
          <button
            type="button"
            class="min-h-11 w-full rounded-md px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="activeView = 'kanban'; isMenuOpen = false"
          >
            看板视图
          </button>
        </div>
      </nav>
    </header>

    <main class="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <section aria-labelledby="tasks-heading">
        <div class="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="mb-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">工作空间 / 概览</p>
            <h1 id="tasks-heading" class="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">我的任务</h1>
            <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">把重要的事情，一件一件做好。</p>
          </div>
          <div class="flex flex-wrap items-center gap-4">
            <div class="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="任务视图">
              <button
                id="list-view-tab"
                type="button"
                role="tab"
                aria-controls="list-view-panel"
                :aria-selected="activeView === 'list'"
                class="min-h-11 min-w-14 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600"
                :class="activeView === 'list' ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-indigo-300' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'"
                @click="activeView = 'list'"
              >
                列表
              </button>
              <button
                id="kanban-view-tab"
                type="button"
                role="tab"
                aria-controls="kanban-view-panel"
                :aria-selected="activeView === 'kanban'"
                class="min-h-11 min-w-14 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600"
                :class="activeView === 'kanban' ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-indigo-300' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'"
                @click="activeView = 'kanban'"
              >
                看板
              </button>
            </div>
            <div class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span class="size-2 rounded-full bg-indigo-500"></span>
              共 {{ taskStore.tasks.length }} 项任务
            </div>
            <TaskModal v-model:show="isTaskModalOpen" @create="addTask" />
          </div>
        </div>

        <div v-if="activeView === 'list'" id="list-view-panel" role="tabpanel" aria-labelledby="list-view-tab">
          <TaskList :tasks="taskStore.tasks" @toggle="toggleTask" @delete="deleteTask($event.id)" />
        </div>
        <div v-else id="kanban-view-panel" role="tabpanel" aria-labelledby="kanban-view-tab">
          <KanbanBoard
            :tasks="taskStore.tasks"
            @move="moveTask"
            @toggle="toggleTask"
            @delete="deleteTask($event.id)"
          />
        </div>
      </section>
    </main>
  </div>
</template>
