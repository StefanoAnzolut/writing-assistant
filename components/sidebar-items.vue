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

  props.sessions.forEach((session, index) => {
    const match = session.editorContent.match(regex)
    if (match) {
      titlesEditorContent.push(match[1])
    } else {
      titlesEditorContent.push('Document ' + (index + 1))
    }
  })
  return titlesEditorContent
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
    <v-list-item
      v-for="(session, i) in props.sessions"
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
