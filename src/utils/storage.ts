import type { Task } from '../types/task'

export const TASKS_STORAGE_KEY = 'vibe-coding-test-tasks'

export const hasStoredTasks = () => {
  try {
    return localStorage.getItem(TASKS_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

export const saveTasks = (tasks: Task[]) => {
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks))
  } catch {
    return
  }
}

export const loadTasks = (): Task[] => {
  try {
    const storedTasks = localStorage.getItem(TASKS_STORAGE_KEY)
    if (!storedTasks) return []

    const parsedTasks: unknown = JSON.parse(storedTasks)
    return Array.isArray(parsedTasks) ? (parsedTasks as Task[]) : []
  } catch {
    return []
  }
}