<script setup lang="ts">
import { computed, ref } from 'vue'
import TaskCard from './TaskCard.vue'
import type { Task, TaskStatus } from '../types/task'

const props = defineProps<{ tasks: Task[] }>()

const emit = defineEmits<{
  toggle: [task: Task]
  delete: [task: Task]
}>()

type TaskFilter = 'all' | TaskStatus

const filters: { label: string; value: TaskFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '待办', value: 'todo' },
  { label: '进行中', value: 'in-progress' },
  { label: '完成', value: 'done' },
]

const activeFilter = ref<TaskFilter>('all')

const sortedTasks = computed(() =>
  [...props.tasks].sort(
    (first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt),
  ),
)

const visibleTasks = computed(() =>
  activeFilter.value === 'all'
    ? sortedTasks.value
    : sortedTasks.value.filter((task) => task.status === activeFilter.value),
)
</script>

<template>
  <section aria-label="任务列表">
    <div class="mb-5 flex flex-wrap gap-2" role="group" aria-label="按状态筛选任务">
      <button
        v-for="filter in filters"
        :key="filter.value"
        type="button"
        class="min-h-11 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        :class="activeFilter === filter.value ? 'bg-indigo-600 text-white dark:bg-indigo-500' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'"
        :aria-pressed="activeFilter === filter.value"
        @click="activeFilter = filter.value"
      >
        {{ filter.label }}
      </button>
    </div>

    <ul v-if="visibleTasks.length" class="space-y-3">
      <li v-for="task in visibleTasks" :key="task.id">
        <TaskCard
          :task="task"
          @toggle="emit('toggle', $event)"
          @delete="emit('delete', $event)"
        />
      </li>
    </ul>

    <div
      v-else-if="props.tasks.length === 0"
      class="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
    >
      还没有任务，点击下方按钮创建第一个吧
    </div>
    <div v-else class="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
      当前状态下没有任务
    </div>
  </section>
</template>