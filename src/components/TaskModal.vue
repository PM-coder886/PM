<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import type { Task, TaskPriority } from '../types/task'

type TaskDraft = Pick<Task, 'title' | 'description' | 'priority'>

const emit = defineEmits<{
  create: [task: TaskDraft]
}>()

const isOpen = defineModel<boolean>('show', { default: false })
const titleError = ref('')
const titleInput = ref<HTMLInputElement | null>(null)
const form = reactive<{ title: string; description: string; priority: TaskPriority }>({
  title: '',
  description: '',
  priority: 'medium',
})

watch(isOpen, async (open) => {
  if (open) {
    await nextTick()
    titleInput.value?.focus()
  }
})

const resetForm = () => {
  form.title = ''
  form.description = ''
  form.priority = 'medium'
  titleError.value = ''
}

const closeModal = () => {
  isOpen.value = false
  resetForm()
}

const submitTask = () => {
  const title = form.title.trim()

  if (!title) {
    titleError.value = '标题不能为空'
    titleInput.value?.focus()
    return
  }

  emit('create', {
    title,
    description: form.description.trim(),
    priority: form.priority,
  })
  closeModal()
}
</script>

<template>
  <button
    type="button"
    class="inline-flex min-h-11 items-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
    @click="isOpen = true"
  >
    <svg viewBox="0 0 20 20" fill="none" class="size-4" aria-hidden="true">
      <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
    新建任务
  </button>

  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-0 backdrop-blur-[2px] sm:grid sm:place-items-center sm:p-4"
      @click.self="closeModal"
      @keydown.esc.prevent.window="closeModal"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        class="animate-sheet-in max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl rounded-b-none bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl dark:bg-slate-900 sm:max-h-[85vh] sm:max-w-lg sm:rounded-xl sm:p-7 sm:animate-none"
      >
        <div class="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 id="task-modal-title" class="text-xl font-semibold text-slate-900 dark:text-slate-100">新建任务</h2>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">填写任务信息，稍后也可以继续调整。</p>
          </div>
          <button
            type="button"
            class="grid size-11 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="关闭弹窗"
            @click="closeModal"
          >
            <svg viewBox="0 0 20 20" fill="none" class="size-4" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <form novalidate class="space-y-5" @submit.prevent="submitTask">
          <div>
            <label for="task-title" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">标题</label>
            <input
              id="task-title"
              ref="titleInput"
              v-model="form.title"
              type="text"
              required
              maxlength="120"
              placeholder="输入任务标题"
              :aria-invalid="Boolean(titleError)"
              :aria-describedby="titleError ? 'task-title-error' : undefined"
              class="w-full rounded-md border px-3 py-2.5 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-100 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-indigo-950"
              :class="titleError ? 'border-rose-500 focus:border-rose-500 dark:border-rose-500' : 'border-slate-300 focus:border-indigo-500 dark:border-slate-700 dark:focus:border-indigo-400'"
              @input="titleError = ''"
            />
            <p v-if="titleError" id="task-title-error" class="mt-1.5 text-sm text-rose-600 dark:text-rose-400" role="alert">
              {{ titleError }}
            </p>
          </div>

          <div>
            <label for="task-description" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">描述 <span class="font-normal text-slate-400 dark:text-slate-500">选填</span></label>
            <textarea
              id="task-description"
              v-model="form.description"
              rows="3"
              maxlength="500"
              placeholder="补充任务细节"
              class="w-full resize-y rounded-md border border-slate-300 px-3 py-2.5 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-950"
            ></textarea>
          </div>

          <div>
            <label for="task-priority" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">优先级</label>
            <select
              id="task-priority"
              v-model="form.priority"
              class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-950"
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </div>

          <div class="flex justify-end gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
            <button
              type="button"
              class="min-h-11 rounded-md px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800"
              @click="closeModal"
            >
              取消
            </button>
            <button
              type="submit"
              class="min-h-11 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              创建任务
            </button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>