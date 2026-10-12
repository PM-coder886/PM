<script setup lang="ts">
import type { Task } from '../types/task'

const props = defineProps<{ task: Task }>()

const emit = defineEmits<{
  toggle: [task: Task]
  delete: [task: Task]
}>()

const priorityLabels: Record<Task['priority'], string> = {
  low: '低优先级',
  medium: '中优先级',
  high: '高优先级',
}

const priorityBorderStyles: Record<Task['priority'], string> = {
  low: 'border-l-emerald-500 dark:border-l-emerald-500',
  medium: 'border-l-amber-500 dark:border-l-amber-500',
  high: 'border-l-rose-500 dark:border-l-rose-500',
}

const priorityBadgeStyles: Record<Task['priority'], string> = {
  low: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  high: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
}

const formatDate = (date: string) =>
  date
    ? new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(
        new Date(`${date}T00:00:00`),
      )
    : '未设置'
</script>

<template>
  <article
    class="flex items-start gap-4 rounded-lg border border-l-4 border-slate-200 bg-white p-4 shadow-sm transition-transform duration-200 hover:scale-[1.02] dark:border-slate-700 dark:bg-slate-900"
    :class="priorityBorderStyles[props.task.priority]"
  >
    <button
      type="button"
      class="mt-0.5 grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      :aria-label="props.task.status === 'done' ? '标记为未完成' : '标记为完成'"
      :aria-pressed="props.task.status === 'done'"
      @click="emit('toggle', props.task)"
    >
      <span
        class="grid size-5 place-items-center rounded-full border transition-colors"
        :class="props.task.status === 'done' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-transparent hover:border-indigo-500 dark:border-slate-600 dark:bg-slate-800'"
      >
        <svg viewBox="0 0 16 16" fill="none" class="size-3" aria-hidden="true">
          <path d="m3.5 8 3 3 6-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </button>

    <div class="min-w-0 flex-1">
      <h2
        class="break-words font-medium text-slate-900 dark:text-slate-100"
        :class="props.task.status === 'done' ? 'text-slate-400 line-through dark:text-slate-500' : ''"
      >
        {{ props.task.title }}
      </h2>
      <p class="mt-1 break-words text-sm leading-6 text-slate-500 dark:text-slate-400">{{ props.task.description }}</p>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <span class="rounded px-2 py-1 text-xs font-medium" :class="priorityBadgeStyles[props.task.priority]">
          {{ priorityLabels[props.task.priority] }}
        </span>
        <span class="text-xs text-slate-500 dark:text-slate-400">截止 {{ formatDate(props.task.dueDate) }}</span>
      </div>
    </div>

    <button
      type="button"
      class="grid size-11 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:text-slate-500 dark:hover:bg-rose-950 dark:hover:text-rose-300"
      aria-label="删除任务"
      title="删除任务"
      @click="emit('delete', props.task)"
    >
      <svg viewBox="0 0 20 20" fill="none" class="size-4" aria-hidden="true">
        <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
      </svg>
    </button>
  </article>
</template>