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

let chatTitles = reactive([] as string[])

function setUpChatTitles() {
  let titlesEditorContent = [] as string[]
  const regex = /<h1>(.*?)<\/h1>/

  shownSessions.forEach(session => {
    if (session.editorContent.length === 0 && session.chatHistory.messages.length === 0) {
      titlesEditorContent.push('Empty chat')
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

    titlesEditorContent.push('Chat')
  })
  chatTitles = titlesEditorContent
  return
}

onMounted(() => {
  // Workaround as ref are not available before onMounted, and somehow the function cannot be called after the onMounted was triggered
  // Tried https://stackoverflow.com/questions/43531755/using-refs-in-a-computed-property
  // Here we used two methods instead of computed properties
  setTimeout(() => {
    setUpShownSessions()
    setUpChatTitles()
  }, 1000)
})
</script>

<template>
  <h1 id="all-chat-title" class="pa-4">All chats navigation</h1>
  <v-divider class="my-2" aria-hidden="true"></v-divider>
  <v-list density="compact" nav>
    <v-list-item
      id="create-new-chat-button"
      prepend-icon="mdi-plus"
      title="Create new chat"
      value="Create new chat"
      @click="$emit('createNewDocument')"
    ></v-list-item>
    <v-list-item
      prepend-icon="mdi-refresh"
      title="Clear current chat"
      value="Clear current chat"
      @click="$emit('clearDocument')"
    ></v-list-item>
    <v-list-item
      prepend-icon="mdi-delete"
      title="Clear all chats"
      value="Clear all chats"
      @click="$emit('clearAllDocuments')"
    ></v-list-item>
    <v-divider class="my-2" aria-hidden="true"></v-divider>
    <!-- <v-text-field v-model="searchText" label="Search chats" variant="outlined"></v-text-field> -->
    <div aria-label="List of chats">
      <v-list-item
        v-for="(session, i) in shownSessions"
        prepend-icon="mdi-file-document"
        :key="session.id"
        @click="$emit('setActiveSession', session.id)"
        :title="chatTitles[i]"
        :value="'Chat #' + (i + 1)"
        :class="session.id === props.activeSession.id ? 'is-highlighted' : ''"
        :aria-label="chatTitles[i] + ' link'"
      >
      </v-list-item>
    </div>
  </v-list>
</template>

<style scoped>
.is-highlighted {
  background-color: #eceaea;
}
</style>
