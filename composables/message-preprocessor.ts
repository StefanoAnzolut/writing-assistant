import type { ChatMessage } from '~/models/ChatMessage'
import type { Message } from '~/models/Message'

export function preprocessUserMessage(message: Message): Message {
  message.content = message.content.replace('<text>', '').replace('</text>', '')
  if (message.content.includes('Spell check the following content')) {
    message.content = 'Spell checking your highlighted text.'
  }
  message.content = message.content.replace('Spell check the following content', '').replace('</text>', '')
  if (message.content.includes('Summarize the following content')) {
    message.content = 'Summarizing your highlighted text.'
  }
  message.content = message.content.replace('Summarize the following content', '').replace('</text>', '')
  return message
}

/** As we have modified the chat reponse to include the finish_reason to mark the end of the stream. We need to have some pre-processing. */
export function preprocessAssistantMessage(message: Message): Message {
  message.content = message.content.replace('2:"[{\\"done\\":true}]"', '')
  message.content = message.content.trim()
  return message
}

export function addPrefixToAssistantAnswer(chatMessage: ChatMessage, messageInteractionCounter: number): void {
  const matchPrefix = chatMessage.message.content.match(/Answer (\d+)\n([\s\S]*)/)
  if (matchPrefix) {
    if (matchPrefix[2].includes('Answer')) {
      chatMessage.message.content = matchPrefix[2]
    } else {
      chatMessage.message.content = `Answer ${messageInteractionCounter}\n${matchPrefix[2]}`
    }
    return
  }
  // Assistant responses without prefixes yet
  chatMessage.message.content = `Answer ${messageInteractionCounter}\n${chatMessage.message.content}`
}

export function isFinished(assistantAnswer: string) {
  return assistantAnswer.includes('2:"[{\\"done\\":true}]"')
}

export function handleContextMenuAction(
  chatMessage: ChatMessage,
  assistantResponse: string,
  lastContextMenuAction: string
): string {
  let regex = /\[MODIFIED_USER_INPUT\]:(.*?)\[MODIFICATIONS\]:/s
  let match = assistantResponse.match(regex)
  console.log(match)
  if (match && match[1]) {
    assistantResponse = assistantResponse.replace(match[1], '')
    chatMessage.message.html = match[1].trim()
  }
  if (
    assistantResponse.includes('[MODIFICATIONS]:') &&
    (lastContextMenuAction === 'summarize' ||
      lastContextMenuAction === 'simplify' ||
      lastContextMenuAction === 'reformulate')
  ) {
    if (
      assistantResponse.includes('Cannot summarize further') ||
      assistantResponse.includes('Cannot simplify text further')
    ) {
      assistantResponse = assistantResponse.replace('[MODIFICATIONS]:', '')
    } else {
      assistantResponse = assistantResponse.replace(
        '[MODIFICATIONS]:',
        'Here are the modifications, use the paste button to apply them.'
      )
    }
  }

  if (assistantResponse.includes('[MODIFICATIONS]:') && lastContextMenuAction === 'checkSpelling') {
    if (assistantResponse.includes('No corrections were needed')) {
      assistantResponse = assistantResponse.replace('[MODIFICATIONS]:', '')
    } else {
      assistantResponse = assistantResponse.replace(
        '[MODIFICATIONS]:',
        'Here are the corrections, use the paste button to apply them.'
      )
    }
  }
  if (assistantResponse.includes('[USER_INPUT]')) {
    assistantResponse = assistantResponse.replace(/\[USER_INPUT\](.*)$/s, '')
  }
  return assistantResponse.trim()
}

export function newChatMessage(message: Message, messageInteractionCounter: number): ChatMessage {
  return {
    message: {
      id: Date.now().toString(),
      role: message.role,
      content:
        message.role === 'user'
          ? `Prompt ${messageInteractionCounter}\n${message.content}`
          : `Answer ${messageInteractionCounter}\n${message.content}`,
      new: true,
    },
    audioPlayer: newAudioPlayer(),
  }
}
