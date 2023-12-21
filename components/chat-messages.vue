<script setup lang="ts">
import type { ChatMessage } from '~/models/ChatMessage'

const props = defineProps({
  messages: {
    type: Array as PropType<ChatMessage[]>,
    required: true,
  },
  chatHistoryExpanded: {
    type: Boolean as PropType<boolean>,
    required: true,
  },
})
defineEmits(['paste', 'pause', 'toggleChatHistory'])

const chatMessagesExtended = computed(() => {
  let chatMessages = [] as { entry: ChatMessage; index: number }[]
  props.messages.forEach((entry, index) => {
    chatMessages.push({ entry: entry, index: index })
  })

  if (props.chatHistoryExpanded) {
    return chatMessages
  }
  if (props.messages.length > 2 && props.messages[props.messages.length - 1].message.role === 'user') {
    return chatMessages.slice(chatMessages.length - 1, chatMessages.length)
  }
  return chatMessages.slice(chatMessages.length - 2, chatMessages.length)
})

const HTML_EXTRACTION_PLACEHOLDER =
  'Generated a structured response. Expand it using the expand button and let it be read to you with play or paste it to the text editor directly.'

function removeHtmlTags(content: string) {
  return content.replace(/<[^>]*>/g, '')
}

function showHtml(entry: ChatMessage) {
  return entry.message.showHtml && entry.message.content.includes(HTML_EXTRACTION_PLACEHOLDER)
}

async function expand(index: number) {
  props.messages[index].message.showHtml = true
  await nextTick()
  const collapseButton = document.getElementById('collapseButton' + index)
  if (collapseButton) {
    collapseButton.focus()
  }
}
async function collapse(index: number) {
  props.messages[index].message.showHtml = false
  await nextTick()
  const expandButton = document.getElementById('expandButton' + index)
  if (expandButton) {
    expandButton.focus()
  }
}
function extractPrefix(str: string) {
  return str.substring(0, str.indexOf('\n'))
}

function withoutPrefix(str: string) {
  return str.substring(str.indexOf('\n'))
}
</script>
<template>
  <v-container v-if="props.messages.length > 2" class="d-flex flex-row justify-center">
    <v-expansion-panels>
      <v-expansion-panel
        class="ma-1 no-uppercase"
        color="primary"
        @click="$emit('toggleChatHistory')"
        :aria-label="props.chatHistoryExpanded !== true ? `Chat history` : `Chat history`"
        :title="props.chatHistoryExpanded !== true ? `Chat history` : `Chat history`"
      >
      </v-expansion-panel>
    </v-expansion-panels>
  </v-container>
  <div
    v-for="item in chatMessagesExtended"
    :index="item.index"
    key="m.id"
    class="chat-message ma-2 mx-4"
    :class="item.entry.message.role === 'user' ? 'user-message' : 'assistant-message'"
  >
    <div class="chat-inner">
      <h2 class="aria-invisible" v-if="item.entry.message.role === 'user'">
        {{ removeHtmlTags(item.entry.message.content.substring(0, 50)) }}
      </h2>
      <p class="h3-style" v-if="item.entry.message.role === 'user'">
        {{ removeHtmlTags(extractPrefix(item.entry.message.content)) }}
        <span class="regular-font-weight">
          {{ removeHtmlTags(withoutPrefix(item.entry.message.content)) }}
        </span>
      </p>
      <h3 v-if="item.entry.message.role === 'assistant'">
        {{ removeHtmlTags(extractPrefix(item.entry.message.content)) }}
        <span class="regular-font-weight" v-if="!showHtml(item.entry)">
          {{ removeHtmlTags(withoutPrefix(item.entry.message.content)) }}
        </span>
      </h3>
      <div class="regular-font-weight" v-if="showHtml(item.entry)" v-html="item.entry.message.html" />
    </div>
    <v-container class="d-flex flex-row justify-end">
      <v-btn
        :id="'playPauseButton' + item.index"
        :icon="item.entry.audioPlayer.muted ? 'mdi-play' : 'mdi-pause'"
        class="ma-1"
        color="success"
        @click="$emit('pause', item.entry, item.index)"
        :aria-label="
          item.entry.audioPlayer.muted
            ? `Play ${extractPrefix(item.entry.message.content)}`
            : `Pause ${extractPrefix(item.entry.message.content)}`
        "
        size="small"
      >
      </v-btn>
      <v-btn
        v-if="
          item.entry.message.content.includes(HTML_EXTRACTION_PLACEHOLDER) && item.entry.message.role === 'assistant'
        "
        :id="showHtml(item.entry) ? 'collapseButton' + item.index : 'expandButton' + item.index"
        :icon="showHtml(item.entry) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        class="ma-1"
        color="primary"
        :aria-label="
          showHtml(item.entry)
            ? `Collapse structure for ${extractPrefix(item.entry.message.content)}`
            : `Expand structure for ${extractPrefix(item.entry.message.content)}`
        "
        @click="showHtml(item.entry) ? collapse(item.index) : expand(item.index)"
        size="small"
      ></v-btn>
      <v-btn
        :id="'addToChatEditor' + item.index"
        icon="mdi-content-paste"
        class="ma-1"
        color="primary"
        @click="$emit('paste', item.index)"
        :aria-label="`Add ${extractPrefix(item.entry.message.content)} to text editor`"
        size="small"
        v-if="item.entry.message.role === 'assistant'"
      >
      </v-btn>
    </v-container>
  </div>
</template>
<style scoped>
/* Somehow, visibility hidden lead to inconsitent reading order for screen readers.
https://stackoverflow.com/questions/62107074/how-to-hide-a-text-and-make-it-accessible-by-screen-reader */
.aria-invisible {
  border: 0;
  clip: rect(0 0 0 0);
  height: 1px;
  margin: -1px;
  overflow: hidden;
  padding: 0;
  position: absolute;
  width: 1px;
}

.chat-message {
  white-space: pre-wrap;
  display: block;
  margin-block-end: 0.5em;
  margin-inline-start: 0px;
  margin-inline-end: 0px;
}
.chat-inner {
  padding: 0.5rem;
}

.user-message {
  background-color: #c5cae9;
}
.assistant-message {
  background-color: #e8eaf6;
}
.regular-font-weight {
  font-weight: normal;
}
.h3-style {
  font-size: 1.17em;
  margin-inline-start: 0px;
  margin-inline-end: 0px;
  font-weight: bold;
}
.no-uppercase {
  text-transform: unset !important;
}
</style>
