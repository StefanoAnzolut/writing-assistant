import type { AudioPlayer } from './AudioPlayer'
import type { Message } from './Message'

export interface ChatMessage {
  message: Message
  audioPlayer: AudioPlayer
}
