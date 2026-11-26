import { useCallback, useEffect, useState } from 'react'
import type {
  CreateTaskInput,
  Task,
  TaskSortBy,
  TaskStatusFilter,
  UpdateTaskInput
} from '@core/models/Task'

export interface UseTasksReturn {
  tasks: Task[]
  isLoading: boolean
  error: string | null
  statusFilter: TaskStatusFilter
  sortBy: TaskSortBy
  openCount: number
  setStatusFilter: (filter: TaskStatusFilter) => void
  setSortBy: (sort: TaskSortBy) => void
  clearError: () => void
  refresh: () => Promise<void>
  createTask: (input: CreateTaskInput) => Promise<Task | null>
  updateTask: (id: number, input: UpdateTaskInput) => Promise<boolean>
  toggleTask: (id: number) => Promise<boolean>
  deleteTask: (id: number) => Promise<boolean>
}

export function useTasks(): UseTasksReturn {
  const [tasks, setTasks] = useState<Task[]>([])
  const [openCount, setOpenCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('all')
  const [sortBy, setSortBy] = useState<TaskSortBy>('due_asc')

  const refresh = useCallback(async (): Promise<void> => {
    if (!window.api?.tasks?.list) return
    setIsLoading(true)
    try {
      const [filteredRes, openRes] = await Promise.all([
        window.api.tasks.list({ status: statusFilter, sortBy }),
        window.api.tasks.list({ status: 'open', sortBy: 'created_desc' })
      ])

      if (filteredRes.success && Array.isArray(filteredRes.tasks)) {
        setTasks(filteredRes.tasks)
        setError(null)
      } else {
        setError(filteredRes.error || 'Không thể tải danh sách công việc.')
      }

      if (openRes.success && Array.isArray(openRes.tasks)) {
        setOpenCount(openRes.tasks.length)
      }
    } catch (err: unknown) {
      console.error('Lỗi khi tải danh sách công việc:', err)
      setError('Không thể tải danh sách công việc lúc này.')
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, sortBy])

  useEffect(() => {
    let isMounted = true
    const load = async (): Promise<void> => {
      await Promise.resolve()
      if (!isMounted || !window.api?.tasks?.list) return
      setIsLoading(true)
      try {
        const [filteredRes, openRes] = await Promise.all([
          window.api.tasks.list({ status: statusFilter, sortBy }),
          window.api.tasks.list({ status: 'open', sortBy: 'created_desc' })
        ])
        if (!isMounted) return
        if (filteredRes.success && Array.isArray(filteredRes.tasks)) {
          setTasks(filteredRes.tasks)
          setError(null)
        } else {
          setError(filteredRes.error || 'Không thể tải danh sách công việc.')
        }
        if (openRes.success && Array.isArray(openRes.tasks)) {
          setOpenCount(openRes.tasks.length)
        }
      } catch (err: unknown) {
        console.error('Lỗi khi tải danh sách công việc:', err)
        if (isMounted) {
          setError('Không thể tải danh sách công việc lúc này.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }
    void load()
    return (): void => {
      isMounted = false
    }
  }, [statusFilter, sortBy])

  useEffect(() => {
    if (!window.api?.tasks?.onUpdated) return
    const unsubscribe = window.api.tasks.onUpdated(() => {
      void refresh()
    })
    return (): void => unsubscribe()
  }, [refresh])

  const createTask = useCallback(
    async (input: CreateTaskInput): Promise<Task | null> => {
      if (!window.api?.tasks?.create) return null
      const res = await window.api.tasks.create(input)
      if (!res.success || !res.task) {
        setError(res.error || 'Không thể thêm công việc.')
        return null
      }
      setError(null)
      await refresh()
      return res.task
    },
    [refresh]
  )

  const updateTask = useCallback(
    async (id: number, input: UpdateTaskInput): Promise<boolean> => {
      if (!window.api?.tasks?.update) return false
      const res = await window.api.tasks.update(id, input)
      if (!res.success) {
        setError(res.error || 'Không thể cập nhật công việc.')
        return false
      }
      setError(null)
      await refresh()
      return true
    },
    [refresh]
  )

  const toggleTask = useCallback(
    async (id: number): Promise<boolean> => {
      if (!window.api?.tasks?.toggle) return false
      const res = await window.api.tasks.toggle(id)
      if (!res.success) {
        setError(res.error || 'Không thể thay đổi trạng thái công việc.')
        return false
      }
      setError(null)
      await refresh()
      return true
    },
    [refresh]
  )

  const deleteTask = useCallback(
    async (id: number): Promise<boolean> => {
      if (!window.api?.tasks?.delete) return false
      const res = await window.api.tasks.delete(id)
      if (!res.success) {
        setError(res.error || 'Không thể xóa công việc.')
        return false
      }
      setError(null)
      await refresh()
      return true
    },
    [refresh]
  )

  const clearError = useCallback((): void => {
    setError(null)
  }, [])

  return {
    tasks,
    isLoading,
    error,
    statusFilter,
    sortBy,
    openCount,
    setStatusFilter,
    setSortBy,
    clearError,
    refresh,
    createTask,
    updateTask,
    toggleTask,
    deleteTask
  }
}
