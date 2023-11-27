<script setup lang="ts">
import type { Session } from '~/models/Session'
const props = defineProps({
  drawer: {
    type: Boolean as PropType<boolean>,
    required: true,
  },
  sessions: {
    type: Array as PropType<Session[]>,
    required: true,
  },
})
const emit = defineEmits(['closeDrawer', 'clearHistory', 'newDocument', 'getThisSession'])
</script>

<template>
  <div>
    <v-navigation-drawer
      v-if="props.drawer"
      class="sidebar"
      v-model="props.drawer"
      v-click-outside="hideDrawer"
      temporary
    >
      <v-list density="compact" nav>
        <v-list-item prepend-icon="mdi-forum" title="Current Document" value="Current Document"></v-list-item>
        <v-list-item
          prepend-icon="mdi-refresh"
          title="Clear current document"
          value="Clear current document"
          @click="$emit('clearHistory')"
        ></v-list-item>
        <v-list-item
          prepend-icon="mdi-plus"
          title="Add new document"
          value="Add new document"
          @click="$emit('newDocument')"
        ></v-list-item>
        <v-divider class="my-2"></v-divider>
        <v-list-item
          v-for="(session, i) in props.sessions"
          prepend-icon="mdi-file-document"
          :key="session.id"
          @click="$emit('getThisSession', session.id)"
          :title="'Document ' + (i + 1)"
          :value="'Document #' + (i + 1)"
        ></v-list-item>
      </v-list>
    </v-navigation-drawer>
  </div>
</template>

<style scoped>
.sidebar {
  background-color: #ebeae6;
}
</style>
