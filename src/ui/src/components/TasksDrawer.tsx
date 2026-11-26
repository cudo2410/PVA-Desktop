import React, { useEffect, useState } from 'react'
import type { Task, TaskSortBy } from '@core/models/Task'
import type { Reminder, ReminderState } from '@core/models/Reminder'
import { RECURRENCE_LABELS } from '@core/models/Recurrence'
import type { RecurrenceRule } from '@core/models/Recurrence'
import type { UseTasksReturn } from '../hooks/useTasks'
import type { UseRemindersReturn } from '../hooks/useReminders'
import { ConfirmModal } from './ConfirmModal'
import { GlassDateTimePicker } from './GlassDateTimePicker'
import { GlassSelect } from './GlassSelect'
import type { GlassSelectOption } from './GlassSelect'
import './TasksDrawer.css'

export type UnifiedFilter = 'all' | 'open' | 'done' | 'with_reminder' | 'missed'

export interface TasksDrawerProps {
  isOpen: boolean
  onClose: () => void
  tasksState: UseTasksReturn
  remindersState: UseRemindersReturn
}

const RECURRENCE_OPTIONS: readonly GlassSelectOption<RecurrenceRule>[] = [
  { value: 'none', label: 'Không lặp', description: 'Chỉ thực hiện một lần' },
  { value: 'daily', label: 'Hàng ngày', description: 'Tự tạo chu kỳ mới mỗi ngày' },
  { value: 'weekly', label: 'Hàng tuần', description: 'Lặp lại cùng thứ mỗi tuần' },
  { value: 'monthly', label: 'Hàng tháng', description: 'Lặp lại cùng ngày mỗi tháng' }
]

const SORT_OPTIONS: readonly GlassSelectOption<TaskSortBy>[] = [
  { value: 'due_asc', label: 'Hạn gần nhất' },
  { value: 'due_desc', label: 'Hạn xa nhất' },
  { value: 'created_desc', label: 'Mới tạo' }
]

function formatDateTimeShort(iso: string | null): string {
  if (!iso) return 'Không có hạn'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function isFutureIso(iso: string): boolean {
  return Date.parse(iso) > Date.now()
}

function getReminderStateLabel(state: ReminderState): string {
  switch (state) {
    case 'scheduled':
      return 'Đang chờ'
    case 'fired':
      return 'Đã nhắc'
    case 'missed':
      return 'Đã lỡ'
    case 'cancelled':
      return 'Đã hủy'
  }
}

function pickPrimaryReminder(list: Reminder[]): Reminder | null {
  if (list.length === 0) return null
  const priority: Record<ReminderState, number> = {
    scheduled: 0,
    missed: 1,
    fired: 2,
    cancelled: 3
  }
  return [...list].sort((a, b) => priority[a.state] - priority[b.state])[0]
}

const RepeatIcon = (): React.JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
)

const FilterIcon = (): React.JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
)

export function TasksDrawer({
  isOpen,
  onClose,
  tasksState,
  remindersState
}: TasksDrawerProps): React.JSX.Element | null {
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  const [rendered, setRendered] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  // Bộ lọc gộp (1 màn hình thống nhất)
  const [unifiedFilter, setUnifiedFilter] = useState<UnifiedFilter>('all')

  // State form tạo thống nhất
  const [title, setTitle] = useState('')
  const [dueAtIso, setDueAtIso] = useState<string | null>(null)
  const [recurrence, setRecurrence] = useState<RecurrenceRule>('none')
  const [enableReminder, setEnableReminder] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // State sửa công việc inline
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDueAtIso, setEditDueAtIso] = useState<string | null>(null)
  const [editRecurrence, setEditRecurrence] = useState<RecurrenceRule>('none')
  const [editEnableReminder, setEditEnableReminder] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // State xác nhận xóa
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<Task | null>(null)
  const [deleteReminderTarget, setDeleteReminderTarget] = useState<Reminder | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const timer = setInterval(() => {
      setNowMs(Date.now())
    }, 30_000)
    return (): void => clearInterval(timer)
  }, [isOpen])

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) {
      setRendered(true)
      setIsClosing(false)
    } else if (rendered) {
      setIsClosing(true)
    }
  }

  const handleAnimationEnd = (e: React.AnimationEvent): void => {
    if (e.target === e.currentTarget && isClosing) {
      setRendered(false)
      setIsClosing(false)
    }
  }

  // Đảm bảo hook luôn giữ trạng thái gốc 'all' khi dùng bộ lọc gộp
  useEffect(() => {
    if (tasksState.statusFilter !== 'all') {
      tasksState.setStatusFilter('all')
    }
    if (remindersState.stateFilter !== 'all') {
      remindersState.setStateFilter('all')
    }
  }, [tasksState, remindersState])

  const handleCreateUnified = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setFormError('Vui lòng nhập tiêu đề công việc hoặc nội dung cần nhắc.')
      return
    }

    if (enableReminder) {
      if (!dueAtIso) {
        setFormError('Vui lòng chọn ngày giờ để đặt nhắc nhở.')
        return
      }
      if (Date.parse(dueAtIso) <= Date.now()) {
        setFormError('Thời điểm nhắc nhở phải ở tương lai.')
        return
      }
    }

    setFormError(null)
    // 1. Luôn lưu bản ghi công việc vào bảng `tasks`
    const createdTask = await tasksState.createTask({
      title: trimmed,
      dueAt: dueAtIso,
      recurrence
    })
    if (!createdTask) return

    // 2. Nếu bật "Nhắc đúng giờ" -> lưu riêng bản ghi liên kết vào bảng `reminders` (giữ 2 bảng lịch sử độc lập)
    if (enableReminder && dueAtIso) {
      const remOk = await remindersState.createReminder({
        text: trimmed,
        remindAt: dueAtIso,
        taskId: createdTask.id,
        recurrence
      })
      if (!remOk) return
    }

    setTitle('')
    setDueAtIso(null)
    setRecurrence('none')
    setEnableReminder(false)
  }

  const startEditTask = (task: Task): void => {
    const hasScheduledReminder = remindersState.reminders.some(
      (r) => r.taskId === task.id && r.state === 'scheduled'
    )
    setEditingTaskId(task.id)
    setEditTitle(task.title)
    setEditDueAtIso(task.dueAt)
    setEditRecurrence(task.recurrence)
    setEditEnableReminder(hasScheduledReminder)
    setEditError(null)
    setFormError(null)
    tasksState.clearError()
  }

  const handleSaveEditTask = async (taskId: number): Promise<void> => {
    const trimmed = editTitle.trim()
    if (!trimmed) {
      setEditError('Tiêu đề công việc không được để trống.')
      return
    }

    if (editEnableReminder) {
      if (!editDueAtIso) {
        setEditError('Vui lòng chọn ngày giờ để đặt nhắc hẹn.')
        return
      }
      if (!isFutureIso(editDueAtIso)) {
        setEditError('Thời điểm nhắc hẹn phải ở tương lai.')
        return
      }
    }

    setEditError(null)
    const ok = await tasksState.updateTask(taskId, {
      title: trimmed,
      dueAt: editDueAtIso,
      recurrence: editRecurrence
    })
    if (!ok) return

    const activeScheduled = remindersState.reminders.filter(
      (r) => r.taskId === taskId && r.state === 'scheduled'
    )

    if (!editEnableReminder) {
      for (const rem of activeScheduled) {
        await remindersState.cancelReminder(rem.id)
      }
    } else if (editDueAtIso) {
      const unchanged =
        activeScheduled.length === 1 &&
        activeScheduled[0].text === trimmed &&
        activeScheduled[0].remindAt === editDueAtIso &&
        activeScheduled[0].recurrence === editRecurrence

      if (!unchanged) {
        for (const rem of activeScheduled) {
          await remindersState.cancelReminder(rem.id)
        }
        const remOk = await remindersState.createReminder({
          text: trimmed,
          remindAt: editDueAtIso,
          taskId,
          recurrence: editRecurrence
        })
        if (!remOk) return
      }
    }

    setEditingTaskId(null)
  }

  const handleConfirmDeleteTask = async (): Promise<void> => {
    if (!deleteTaskTarget) return
    const targetId = deleteTaskTarget.id
    setDeleteTaskTarget(null)
    await tasksState.deleteTask(targetId)
    await remindersState.refresh()
  }

  const handleConfirmDeleteReminder = async (): Promise<void> => {
    if (!deleteReminderTarget) return
    const targetId = deleteReminderTarget.id
    setDeleteReminderTarget(null)
    await remindersState.deleteReminder(targetId)
  }

  if (!rendered) {
    return null
  }

  // Nhóm các nhắc nhở theo taskId để hiển thị gắn kết trên thẻ công việc, còn nhắc tự do (taskId === null) hiển thị chung trong danh sách
  const remindersByTask = new Map<number, Reminder[]>()
  const standaloneReminders: Reminder[] = []
  for (const rem of remindersState.reminders) {
    if (rem.taskId !== null) {
      const existing = remindersByTask.get(rem.taskId) ?? []
      existing.push(rem)
      remindersByTask.set(rem.taskId, existing)
    } else {
      standaloneReminders.push(rem)
    }
  }

  const visibleTasks = tasksState.tasks.filter((task) => {
    const linked = remindersByTask.get(task.id) ?? []
    if (unifiedFilter === 'open') return task.status === 'open'
    if (unifiedFilter === 'done') return task.status === 'done'
    if (unifiedFilter === 'with_reminder') return linked.length > 0
    if (unifiedFilter === 'missed') return linked.some((r) => r.state === 'missed')
    return true
  })

  const visibleStandaloneReminders = standaloneReminders.filter((rem) => {
    if (unifiedFilter === 'open') return rem.state === 'scheduled'
    if (unifiedFilter === 'done') return rem.state === 'fired' || rem.state === 'cancelled'
    if (unifiedFilter === 'with_reminder') return true
    if (unifiedFilter === 'missed') return rem.state === 'missed'
    return true
  })

  const totalVisibleCount = visibleTasks.length + visibleStandaloneReminders.length

  const isOverdueTask = (task: Task): boolean => {
    if (task.status === 'done' || !task.dueAt) return false
    return Date.parse(task.dueAt) < nowMs
  }

  return (
    <>
      <div
        className={`drawer-overlay ${isClosing ? 'closing' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`tasks-drawer ${isClosing ? 'closing' : ''}`}
        aria-label="Quản lý công việc và nhắc nhở"
        onAnimationEnd={handleAnimationEnd}
      >
        <div className="drawer-header">
          <div className="drawer-title-group">
            <h2 className="drawer-title">Công việc &amp; Nhắc nhở</h2>
            {(tasksState.openCount > 0 || remindersState.missedCount > 0) && (
              <span
                className={`drawer-summary-pill ${remindersState.missedCount > 0 ? 'has-missed' : ''}`}
              >
                {tasksState.openCount} việc
                {remindersState.missedCount > 0 ? ` · ${remindersState.missedCount} lỡ` : ''}
              </span>
            )}
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            title="Đóng bảng công việc"
            aria-label="Đóng"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="tasks-panel-body">
          {/* Form gộp duy nhất — dùng 100% GlassDateTimePicker & GlassSelect riêng */}
          <form className="task-create-form" onSubmit={(e) => void handleCreateUnified(e)}>
            <input
              type="text"
              className="glass-input"
              placeholder="Thêm công việc hoặc nội dung cần nhắc..."
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (formError) setFormError(null)
              }}
              maxLength={200}
              aria-label="Tiêu đề công việc hoặc nội dung cần nhắc"
            />

            <div className="task-form-row">
              <GlassDateTimePicker
                value={dueAtIso}
                onChange={(nextIso) => {
                  setDueAtIso(nextIso)
                  if (formError) setFormError(null)
                }}
                placeholder="Chọn ngày giờ..."
                ariaLabel="Chọn ngày giờ hạn hoặc nhắc nhở"
              />

              <GlassSelect
                value={recurrence}
                options={RECURRENCE_OPTIONS}
                onChange={setRecurrence}
                ariaLabel="Chọn chu kỳ lặp lại"
                prefixIcon={<RepeatIcon />}
                accentTone={recurrence === 'none' ? 'neutral' : 'purple'}
                menuWidth={228}
              />
            </div>

            <div className="task-form-footer-row">
              <button
                type="button"
                role="switch"
                aria-checked={enableReminder}
                className={`glass-switch-row ${enableReminder ? 'is-on' : ''}`}
                onClick={() => {
                  setEnableReminder((prev) => !prev)
                  if (formError) setFormError(null)
                }}
              >
                <span className="glass-switch-track">
                  <span className="glass-switch-knob" />
                </span>
                <span className="glass-switch-label">Nhắc hẹn</span>
              </button>

              <button type="submit" className="glass-primary-btn">
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Thêm</span>
              </button>
            </div>

            {(formError || tasksState.error || remindersState.error) && (
              <p className="inline-form-error" role="alert">
                {formError || tasksState.error || remindersState.error}
              </p>
            )}
          </form>

          {/* Thanh 2 Dropdown: Bộ lọc (căn trái) & Sắp xếp (căn phải) */}
          <div className="tasks-controls-bar">
            <div className="tasks-sort-row">
              <GlassSelect
                value={unifiedFilter}
                options={[
                  { value: 'all', label: 'Tất cả' },
                  { value: 'open', label: 'Chưa xong' },
                  { value: 'done', label: 'Đã xong' },
                  { value: 'with_reminder', label: 'Có nhắc' },
                  {
                    value: 'missed',
                    label:
                      remindersState.missedCount > 0
                        ? `Đã lỡ (${remindersState.missedCount})`
                        : 'Đã lỡ'
                  }
                ]}
                onChange={setUnifiedFilter}
                ariaLabel="Lọc công việc và nhắc nhở"
                prefixIcon={<FilterIcon />}
                accentTone={
                  unifiedFilter === 'missed'
                    ? 'danger'
                    : unifiedFilter === 'all'
                      ? 'neutral'
                      : 'emerald'
                }
                compact={true}
                align="left"
                menuWidth={168}
              />

              <GlassSelect
                value={tasksState.sortBy}
                options={SORT_OPTIONS}
                onChange={tasksState.setSortBy}
                ariaLabel="Sắp xếp danh sách"
                prefixLabel="Sắp xếp"
                compact={true}
                align="right"
                menuWidth={176}
              />
            </div>
          </div>

          {/* Danh sách thống nhất (Công việc + Nhắc nhở độc lập) */}
          <div className="drawer-content tasks-scroll-list">
            {tasksState.isLoading && totalVisibleCount === 0 ? (
              <div className="drawer-loading">
                <span className="loading-spinner" />
                <span>Đang tải dữ liệu...</span>
              </div>
            ) : totalVisibleCount === 0 ? (
              <div className="drawer-empty-state">
                <p className="empty-drawer-text">
                  {unifiedFilter === 'all'
                    ? 'Chưa có công việc hay nhắc nhở nào. Hãy thêm ở trên hoặc nhắn "thêm việc ..." / "nhắc tôi ... sau 2 phút".'
                    : 'Không có mục nào khớp với bộ lọc hiện tại.'}
                </p>
              </div>
            ) : (
              <div className="task-items-list">
                {/* 1. Nhắc nhở tự do bị lỡ được ưu tiên lên đầu để người dùng dễ thấy */}
                {visibleStandaloneReminders
                  .filter((r) => r.state === 'missed')
                  .map((rem) => (
                    <div key={`rem-${rem.id}`} className="task-card reminder-card state-missed">
                      <span className="standalone-bell-badge state-missed" aria-hidden="true">
                        <svg
                          viewBox="0 0 24 24"
                          width="13"
                          height="13"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                      </span>
                      <div className="task-card-body">
                        <div className="task-card-title">{rem.text}</div>
                        <div className="task-card-meta">
                          <span className="reminder-state-badge state-missed">Đã lỡ</span>
                          <span className="task-due-label overdue">
                            {formatDateTimeShort(rem.remindAt)}
                          </span>
                          {rem.recurrence !== 'none' && (
                            <span className="recurrence-badge">
                              ↻ {RECURRENCE_LABELS[rem.recurrence]}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="task-card-actions">
                        <button
                          type="button"
                          className="task-icon-btn danger"
                          onClick={() => setDeleteReminderTarget(rem)}
                          title="Xóa nhắc nhở"
                          aria-label="Xóa nhắc nhở"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="14"
                            height="14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}

                {/* 2. Danh sách công việc (kèm badge lặp lại + nhắc nhở liên kết) */}
                {visibleTasks.map((task) => {
                  const isEditing = editingTaskId === task.id
                  const overdue = isOverdueTask(task)
                  const linkedReminder = pickPrimaryReminder(remindersByTask.get(task.id) ?? [])

                  return (
                    <div
                      key={`task-${task.id}`}
                      className={`task-card ${task.status === 'done' ? 'is-done' : ''} ${overdue || linkedReminder?.state === 'missed' ? 'is-overdue' : ''}`}
                    >
                      {isEditing ? (
                        <div className="task-edit-box">
                          <input
                            type="text"
                            className="glass-input"
                            value={editTitle}
                            onChange={(e) => {
                              setEditTitle(e.target.value)
                              if (editError) setEditError(null)
                            }}
                            aria-label="Sửa tiêu đề công việc"
                          />
                          <div className="task-form-row">
                            <GlassDateTimePicker
                              value={editDueAtIso}
                              onChange={(nextIso) => {
                                setEditDueAtIso(nextIso)
                                if (editError) setEditError(null)
                              }}
                              placeholder="Chọn hạn..."
                              ariaLabel="Sửa hạn công việc"
                              compact={true}
                            />
                            <GlassSelect
                              value={editRecurrence}
                              options={RECURRENCE_OPTIONS}
                              onChange={setEditRecurrence}
                              ariaLabel="Sửa chu kỳ lặp lại"
                              prefixIcon={<RepeatIcon />}
                              accentTone={editRecurrence === 'none' ? 'neutral' : 'purple'}
                              compact={true}
                              menuWidth={210}
                            />
                          </div>
                          <div className="task-edit-footer-row">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={editEnableReminder}
                              className={`glass-switch-row ${editEnableReminder ? 'is-on' : ''}`}
                              onClick={() => {
                                setEditEnableReminder((prev) => !prev)
                                if (editError) setEditError(null)
                              }}
                            >
                              <span className="glass-switch-track">
                                <span className="glass-switch-knob" />
                              </span>
                              <span className="glass-switch-label">Nhắc hẹn</span>
                            </button>

                            <div className="task-edit-actions">
                              <button
                                type="button"
                                className="task-mini-btn"
                                onClick={() => {
                                  setEditingTaskId(null)
                                  setEditError(null)
                                }}
                              >
                                Hủy
                              </button>
                              <button
                                type="button"
                                className="task-mini-btn primary"
                                onClick={() => void handleSaveEditTask(task.id)}
                              >
                                Lưu thay đổi
                              </button>
                            </div>
                          </div>
                          {editError && (
                            <p className="inline-form-error" role="alert">
                              {editError}
                            </p>
                          )}
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={`task-check-btn ${task.status === 'done' ? 'checked' : ''}`}
                            onClick={() => void tasksState.toggleTask(task.id)}
                            title={
                              task.status === 'done'
                                ? 'Đánh dấu chưa hoàn thành'
                                : task.recurrence !== 'none'
                                  ? `Hoàn thành & tạo chu kỳ ${RECURRENCE_LABELS[task.recurrence].toLowerCase()} tiếp theo`
                                  : 'Đánh dấu hoàn thành'
                            }
                            aria-label={
                              task.status === 'done'
                                ? `Mở lại công việc ${task.title}`
                                : `Hoàn thành công việc ${task.title}`
                            }
                          >
                            {task.status === 'done' && (
                              <svg
                                viewBox="0 0 24 24"
                                width="12"
                                height="12"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>

                          <div className="task-card-body">
                            <div className="task-card-title">{task.title}</div>
                            <div className="task-card-meta">
                              <span className={`task-due-label ${overdue ? 'overdue' : ''}`}>
                                {overdue ? 'Quá hạn · ' : ''}
                                {formatDateTimeShort(task.dueAt)}
                              </span>
                              {task.recurrence !== 'none' && (
                                <span className="recurrence-badge">
                                  ↻ {RECURRENCE_LABELS[task.recurrence]}
                                </span>
                              )}
                              {linkedReminder &&
                                (linkedReminder.state === 'missed' ||
                                  linkedReminder.state === 'fired') && (
                                  <span
                                    className={`reminder-state-badge state-${linkedReminder.state}`}
                                    title={`Nhắc lúc ${formatDateTimeShort(linkedReminder.remindAt)}`}
                                  >
                                    {getReminderStateLabel(linkedReminder.state)}
                                  </span>
                                )}
                            </div>
                          </div>

                          <div className="task-card-actions">
                            <button
                              type="button"
                              className="task-icon-btn"
                              onClick={() => startEditTask(task)}
                              title="Sửa công việc"
                              aria-label="Sửa"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                width="14"
                                height="14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="task-icon-btn danger"
                              onClick={() => setDeleteTaskTarget(task)}
                              title="Xóa công việc"
                              aria-label="Xóa"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                width="14"
                                height="14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                              </svg>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}

                {/* 3. Các nhắc nhở tự do khác (đang chờ / đã nhắc / đã hủy, ví dụ tạo từ chat) */}
                {visibleStandaloneReminders
                  .filter((r) => r.state !== 'missed')
                  .map((rem) => (
                    <div
                      key={`rem-${rem.id}`}
                      className={`task-card reminder-card state-${rem.state}`}
                    >
                      <span
                        className={`standalone-bell-badge state-${rem.state}`}
                        aria-hidden="true"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="13"
                          height="13"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                      </span>
                      <div className="task-card-body">
                        <div className="task-card-title">{rem.text}</div>
                        <div className="task-card-meta">
                          {rem.state !== 'scheduled' && (
                            <span className={`reminder-state-badge state-${rem.state}`}>
                              {getReminderStateLabel(rem.state)}
                            </span>
                          )}
                          <span className="task-due-label">
                            {formatDateTimeShort(rem.remindAt)}
                          </span>
                          {rem.recurrence !== 'none' && (
                            <span className="recurrence-badge">
                              ↻ {RECURRENCE_LABELS[rem.recurrence]}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="task-card-actions">
                        {rem.state === 'scheduled' && (
                          <button
                            type="button"
                            className="task-mini-btn"
                            onClick={() => void remindersState.cancelReminder(rem.id)}
                            title="Hủy lịch nhắc"
                          >
                            Hủy
                          </button>
                        )}
                        <button
                          type="button"
                          className="task-icon-btn danger"
                          onClick={() => setDeleteReminderTarget(rem)}
                          title="Xóa nhắc nhở"
                          aria-label="Xóa nhắc nhở"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="14"
                            height="14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Xác nhận xóa công việc (FR-04) */}
      <ConfirmModal
        isOpen={Boolean(deleteTaskTarget)}
        title="Xóa công việc?"
        message={deleteTaskTarget ? `Bạn có chắc muốn xóa "${deleteTaskTarget.title}"?` : ''}
        subMessage="Công việc sẽ bị xóa vĩnh viễn và các nhắc nhở đang chờ gắn kèm sẽ được hủy."
        confirmText="Xóa"
        cancelText="Hủy"
        isDanger={true}
        onConfirm={() => void handleConfirmDeleteTask()}
        onCancel={() => setDeleteTaskTarget(null)}
      />

      {/* Xác nhận xóa nhắc nhở */}
      <ConfirmModal
        isOpen={Boolean(deleteReminderTarget)}
        title="Xóa nhắc nhở?"
        message={
          deleteReminderTarget
            ? `Bạn có chắc muốn xóa nhắc nhở "${deleteReminderTarget.text}"?`
            : ''
        }
        subMessage="Nhắc nhở sẽ bị hủy và xóa khỏi danh sách."
        confirmText="Xóa"
        cancelText="Hủy"
        isDanger={true}
        onConfirm={() => void handleConfirmDeleteReminder()}
        onCancel={() => setDeleteReminderTarget(null)}
      />
    </>
  )
}
