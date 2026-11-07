export type IntentType = 'create_task' | 'list_tasks' | 'set_reminder' | 'open_app' | 'general_chat'

export interface NormalizedAIResponse {
  type: 'chat' | 'action'
  replyText: string
  intent: IntentType
  parameters: Record<string, unknown>
  needConfirmation: boolean
}
