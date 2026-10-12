import { reactive, watch } from 'vue'
import type { Task } from '../types/task'
import { hasStoredTasks, loadTasks, saveTasks } from '../utils/storage'

type TaskDraft = Pick<Task, 'title' | 'description' | 'priority'>

const createSampleTasks = (): Task[] => [
  {
    id: 'task-1',
    title: '整理本周产品需求',
    description: '汇总反馈并确认下一迭代的优先事项。',
    status: 'in-progress',
    priority: 'high',
    dueDate: '2026-10-14',
    createdAt: '2026-10-10T09:00:00',
  },
  {
    id: 'task-2',
    title: '更新项目文档',
    description: '补充本地开发、环境变量和部署说明。',
    status: 'todo',
    priority: 'medium',
    dueDate: '2026-10-16',
    createdAt: '2026-10-11T09:00:00',
  },
  {
    id: 'task-3',
    title: '检查移动端页面布局',
    description: '验证常用页面在窄屏下的显示效果。',
    status: 'done',
    priority: 'low',
    dueDate: '2026-10-12',
    createdAt: '2026-10-09T09:00:00',
  },
]

export const taskStore = reactive({
  tasks: hasStoredTasks() ? loadTasks() : createSampleTasks(),
})

watch(
  () => taskStore.tasks,
  (tasks) => saveTasks(tasks),
  { deep: true, immediate: true },
)

export const addTask = (draft: TaskDraft) => {
  const task: Task = {
    ...draft,
    id: crypto.randomUUID(),
    status: 'todo',
    dueDate: '',
    createdAt: new Date().toISOString(),
  }

  taskStore.tasks.unshift(task)
}

export const updateTask = (id: string, updates: Partial<Omit<Task, 'id'>>) => {
  const task = taskStore.tasks.find((item) => item.id === id)
  if (task) Object.assign(task, updates)
}

export const deleteTask = (id: string) => {
  const taskIndex = taskStore.tasks.findIndex((task) => task.id === id)
  if (taskIndex !== -1) taskStore.tasks.splice(taskIndex, 1)
}