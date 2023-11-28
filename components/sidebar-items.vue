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
      :title="'Document ' + (i + 1)"
      :value="'Document #' + (i + 1)"
      :class="session.id === props.activeSession.id ? 'is-highlighted' : ''"
    >
    </v-list-item>
  </v-list>
</template>
