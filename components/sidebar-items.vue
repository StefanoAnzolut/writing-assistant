<script setup lang="ts">
import type { Session } from '~/models/Session'

const props = defineProps({
  sessions: {
    type: Array as PropType<Session[]>,
    required: true,
  },
  activeSession: {
    type: Object as PropType<Session>,
    required: true,
  },
})
const emit = defineEmits(['createNewDocument', 'clearDocument', 'clearAllDocuments', 'setActiveSession'])

const documentTitles = computed(() => {
  let titlesEditorContent = [] as string[]
  const regex = /<h1>(.*?)<\/h1>/

  shownSessions.value.forEach(session => {
    if (session.editorContent.length === 0 && session.chatHistory.messages.length === 0) {
      titlesEditorContent.push('Empty document')
      return
    }
    const match = session.editorContent.match(regex)
    if (match) {
      titlesEditorContent.push(match[1])
      return
    }
    const headingTwoRegex = /<h2>(.*?)<\/h2>/
    const fallbackMatch = session.editorContent.match(headingTwoRegex)
    if (fallbackMatch) {
      titlesEditorContent.push(fallbackMatch[1])
      return
    }

    const lastUserPrompt = session.chatHistory.messages
      .filter(message => message.message.role === 'user')
      .map(message => message.message.content)
      .pop()
    if (lastUserPrompt) {
      titlesEditorContent.push(lastUserPrompt)
      return
    }

    titlesEditorContent.push('Document')
  })
  return titlesEditorContent
})

const searchText = ref('')

const shownSessions = computed(() => {
  let tempSessionsSet = new Set<Session>()

  if (searchText.value.length === 0) {
    return props.sessions
  }
  if (searchText.value.length > 0) {
    props.sessions.forEach(session => {
      if (session.editorContent.includes(searchText.value)) {
        tempSessionsSet.add(session)
      }
      session.chatHistory.messages.forEach(message => {
        if (message.message.content.includes(searchText.value)) {
          tempSessionsSet.add(session)
        }
      })
    })
  }
  return Array.from(tempSessionsSet)
})
</script>

<template>
  <v-list density="compact" nav>
    <v-list-item
      prepend-icon="mdi-plus"
      title="Add new document"
      value="Add new document"
      @click="$emit('createNewDocument')"
    ></v-list-item>
    <v-list-item
      prepend-icon="mdi-refresh"
      title="Clear current document"
      value="Clear current document"
      @click="$emit('clearDocument')"
    ></v-list-item>
    <v-list-item
      prepend-icon="mdi-delete"
      title="Clear all documents"
      value="Clear all documents"
      @click="$emit('clearAllDocuments')"
    ></v-list-item>
    <v-divider class="my-2"></v-divider>
    <v-text-field v-model="searchText" label="Search documents" variant="outlined"></v-text-field>
    <v-list-item
      v-for="(session, i) in shownSessions"
      prepend-icon="mdi-file-document"
      :key="session.id"
      @click="$emit('setActiveSession', session.id)"
      :title="documentTitles[i]"
      :value="'Document #' + (i + 1)"
      :class="session.id === props.activeSession.id ? 'is-highlighted' : ''"
      :aria-label="documentTitles[i].includes('Document') ? documentTitles[i] : `Document ${documentTitles[i]}`"
    >
    </v-list-item>
  </v-list>
</template>

<style scoped>
.is-highlighted {
  background-color: #eceaea;
}
</style>
