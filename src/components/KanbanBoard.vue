<script setup lang="ts">
import { computed, ref } from 'vue'
import TaskCard from './TaskCard.vue'
import type { Task, TaskStatus } from '../types/task'

const props = defineProps<{ tasks: Task[] }>()

const emit = defineEmits<{
  move: [taskId: string, status: TaskStatus]
  toggle: [task: Task]
  delete: [task: Task]
}>()

const columns: { status: TaskStatus; title: string }[] = [
  { status: 'todo', title: '待办' },
  { status: 'in-progress', title: '进行中' },
  { status: 'done', title: '已完成' },
]

const draggedTaskId = ref<string | null>(null)
const activeDropStatus = ref<TaskStatus | null>(null)

const tasksByStatus = computed(() => {
  const groupedTasks: Record<TaskStatus, Task[]> = {
    todo: [],
    'in-progress': [],
    done: [],
  }

  for (const task of props.tasks) {
    groupedTasks[task.status].push(task)
  }

  for (const tasks of Object.values(groupedTasks)) {
    tasks.sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))
  }

  return groupedTasks
})

const startDrag = (event: DragEvent, task: Task) => {
  draggedTaskId.value = task.id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', task.id)
  }
}

const allowDrop = (event: DragEvent, status: TaskStatus) => {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  activeDropStatus.value = status
}

const dropTask = (event: DragEvent, status: TaskStatus) => {
  event.preventDefault()
  const taskId = event.dataTransfer?.getData('text/plain') || draggedTaskId.value
  if (taskId) emit('move', taskId, status)
  draggedTaskId.value = null
  activeDropStatus.value = null
}
</script>

<template>
  <div class="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
    <section
      v-for="column in columns"
      :key="column.status"
      class="min-w-0 rounded-lg border p-3 transition-colors sm:p-4"
      :class="activeDropStatus === column.status ? 'border-indigo-300 bg-indigo-50/70 dark:border-indigo-700 dark:bg-indigo-950/60' : 'border-slate-200 bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/70'"
      :aria-label="`${column.title}任务列`"
      @dragover="allowDrop($event, column.status)"
      @dragleave.self="activeDropStatus = null"
      @drop="dropTask($event, column.status)"
    >
      <header class="mb-3 flex items-center justify-between px-1">
        <h2 class="text-sm font-semibold text-slate-800 dark:text-slate-200">{{ column.title }}</h2>
        <span class="grid min-w-6 place-items-center rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {{ tasksByStatus[column.status].length }}
        </span>
      </header>

      <ul class="min-h-36 space-y-3">
        <li v-for="task in tasksByStatus[column.status]" :key="task.id">
          <div
            draggable="true"
            :aria-label="`拖拽任务：${task.title}`"
            class="cursor-grab active:cursor-grabbing"
            @dragstart="startDrag($event, task)"
            @dragend="draggedTaskId = null; activeDropStatus = null"
          >
            <TaskCard
              :task="task"
              @toggle="emit('toggle', $event)"
              @delete="emit('delete', $event)"
            />
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>