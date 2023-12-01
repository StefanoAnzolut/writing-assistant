<script setup lang="ts">
import type { ChatMessage } from '~/models/ChatMessage'
import { pause } from '~/composables/audio-player'

const props = defineProps({
  messages: {
    type: Array as PropType<ChatMessage[]>,
    required: true,
  },
})
defineEmits(['paste'])

const HTML_EXTRACTION_PLACEHOLDER =
  'Generated a structure. Expand it using the expand button and paste it with the paste button to the text editor.'

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
</script>
<template>
  <div
    v-for="(entry, i) in props.messages"
    :index="i"
    key="m.id"
    class="chat-message ma-2 mx-4"
    :class="props.messages[i].message.role === 'user' ? 'user-message' : 'assistant-message'"
  >
    <div class="chat-inner">
      <h2 class="aria-invisible" v-if="entry.message.role === 'user'">
        {{ removeHtmlTags(entry.message.content.substring(0, 50)) }}
      </h2>
      <p class="h3-style" v-if="entry.message.role === 'user'">
        {{ removeHtmlTags(entry.message.content.substring(0, entry.message.content.indexOf('\n'))) }}
        <span class="regular-font-weight">
          {{ removeHtmlTags(entry.message.content.substring(entry.message.content.indexOf('\n'))) }}
        </span>
      </p>
      <h3 v-if="entry.message.role === 'assistant'">
        {{ removeHtmlTags(entry.message.content.substring(0, entry.message.content.indexOf('\n'))) }}
        <span class="regular-font-weight" v-if="showHtml(entry)">
          {{ entry.message.html }}
        </span>
        <span class="regular-font-weight" v-else>
          {{ removeHtmlTags(entry.message.content.substring(entry.message.content.indexOf('\n'))) }}
        </span>
      </h3>
    </div>
    <v-container class="d-flex flex-row justify-end">
      <v-btn
        v-if="entry.message.content.includes(HTML_EXTRACTION_PLACEHOLDER) && entry.message.role === 'assistant'"
        :id="showHtml(entry) ? 'collapseButton' + i : 'expandButton' + i"
        :icon="showHtml(entry) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        class="ma-1"
        color="primary"
        :aria-label="
          showHtml(entry)
            ? `Collapse structure for ${entry.message.content.substring(0, entry.message.content.indexOf('\n'))}`
            : `Expand structure for ${entry.message.content.substring(0, entry.message.content.indexOf('\n'))}`
        "
        @click="showHtml(entry) ? collapse(i) : expand(i)"
        size="small"
      ></v-btn>
      <v-btn
        :id="'playPauseButton' + i"
        :icon="entry.audioPlayer.muted ? 'mdi-play' : 'mdi-pause'"
        class="ma-1"
        color="success"
        @click="pause(entry.audioPlayer)"
        :aria-label="
          entry.audioPlayer.muted
            ? `Play ${entry.message.content.substring(0, entry.message.content.indexOf('\n'))}`
            : `Pause ${entry.message.content.substring(0, entry.message.content.indexOf('\n'))}`
        "
        size="small"
      >
      </v-btn>
      <v-btn
        :id="'addToChatEditor' + i"
        icon="mdi-content-paste"
        class="ma-1"
        color="primary"
        @click="$emit('paste', i)"
        :aria-label="`Add ${entry.message.content.substring(0, entry.message.content.indexOf('\n'))} to chat editor`"
        size="small"
        v-if="entry.message.role === 'assistant'"
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
</style>
