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
  drawer: {
    type: Boolean as PropType<boolean>,
    required: true,
  },
})
const emit = defineEmits(['createNewDocument', 'clearDocument', 'clearAllDocuments', 'setActiveSession', 'showDrawer'])

const searchText = ref('')

let shownSessions = reactive([] as Session[])

function setUpShownSessions() {
  let tempSessionsSet = new Set<Session>()

  if (searchText.value.length === 0) {
    shownSessions = props.sessions
    return
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
  shownSessions = Array.from(tempSessionsSet)
}

let documentTitles = reactive([] as string[])

function setDocumentTitles() {
  let titlesEditorContent = [] as string[]
  const regex = /<h1>(.*?)<\/h1>/

  shownSessions.forEach(session => {
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

    titlesEditorContent.push('Document without title')
  })
  documentTitles = titlesEditorContent
  return
}

function checkInFocus() {
  const activeElement = document.activeElement
  if (activeElement) {
    const activeElementId = activeElement.id
    if (
      activeElementId === 'navgiation-title' ||
      activeElementId === 'create-new-document' ||
      activeElementId === 'clear-document' ||
      activeElementId === 'clear-all-documents'
    ) {
      return true
    }
    for (let i = 0; i < shownSessions.length; i++) {
      if (activeElementId === 'document-list-item' + i) {
        return true
      }
    }
  }
  return false
}
if (process.client) {
  setInterval(() => {
    if (checkInFocus() && props.drawer === false) {
      emit('showDrawer', true)
    }
  }, 500)
  setInterval(() => {
    setUpShownSessions()
    setDocumentTitles()
  }, 3000)
}

onMounted(() => {
  // Workaround as ref are not available before onMounted, and somehow the function cannot be called after the onMounted was triggered
  // Tried https://stackoverflow.com/questions/43531755/using-refs-in-a-computed-property
  // Here we used two methods instead of computed properties
  setTimeout(() => {
    setUpShownSessions()
    setDocumentTitles()
  }, 500)
})
</script>

<template>
  <h1 id="navgiation-title" class="pa-4">Navigation</h1>
  <v-divider class="my-2" aria-hidden="true"></v-divider>
  <v-list density="compact" nav>
    <v-list-item
      class="item-icon"
      id="create-new-document"
      prepend-icon="mdi-plus"
      title="Create new document"
      value="Create new document"
      @click="$emit('createNewDocument')"
    ></v-list-item>
    <v-list-item
      class="item-icon"
      id="clear-document"
      prepend-icon="mdi-refresh"
      title="Clear current document"
      value="Clear current document"
      @click="$emit('clearDocument')"
    ></v-list-item>
    <v-list-item
      class="item-icon"
      id="clear-all-documents"
      prepend-icon="mdi-delete"
      title="Clear all documents"
      value="Clear all documents"
      @click="$emit('clearAllDocuments')"
    ></v-list-item>
    <v-divider class="my-2" aria-hidden="true"></v-divider>
    <!-- <v-text-field v-model="searchText" label="Search chats" variant="outlined"></v-text-field> -->
    <div aria-label="List of documents">
      <v-list-item
        class="item-icon"
        v-for="(session, i) in shownSessions"
        prepend-icon="mdi-file-document"
        :id="'document-list-item' + i"
        :key="session.id"
        @click="$emit('setActiveSession', session.id)"
        :title="documentTitles[i]"
        :value="'Document #' + (i + 1)"
        :class="session.id === props.activeSession.id ? 'is-highlighted' : ''"
        :aria-label="documentTitles[i] + ' link'"
      >
      </v-list-item>
    </div>
  </v-list>
</template>

<style scoped>
.is-highlighted {
  background-color: #eceaea;
}
.item-icon :deep(.v-icon) {
  opacity: 0.75;
}
</style>
