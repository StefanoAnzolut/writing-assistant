import type { ChatHistory } from './ChatHistory'

export interface Session {
  id: string
  chatHistory: ChatHistory
  editorContent: string
  structure: boolean
}
