import type { RecurrenceRule } from '../models/Recurrence'

export type ActionIntentName = 'create_task' | 'set_reminder' | 'open_target'

export type RoutedIntent =
  | {
      type: 'create_task'
      title: string
      dueAt?: string
      rawTimeText?: string
      recurrence?: RecurrenceRule
      confidence: number
    }
  | {
      type: 'set_reminder'
      text: string
      remindAt: string
      rawTimeText: string
      recurrence?: RecurrenceRule
      confidence: number
    }
  | {
      type: 'open_target'
      target: string
      confidence: number
    }
  | {
      type: 'ambiguous'
      suggestedIntent: ActionIntentName
      reason: string
      originalText: string
      confidence: number
    }
  | {
      type: 'chat'
      confidence: number
    }

/**
 * Port bộ định tuyến ý định (IntentRouter) — Điểm mở rộng cho Giai đoạn 2
 * (thay thế RuleRouter bằng LlmToolRouter dùng LLM tool-calling mà không đổi ChatService).
 */
export interface IntentRouter {
  route(input: string, now?: Date): Promise<RoutedIntent>
}
