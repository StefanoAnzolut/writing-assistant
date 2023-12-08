<script setup lang="ts">
const props = defineProps({
  chatHistoryExpanded: {
    type: Boolean as PropType<boolean>,
    required: true,
  },
})
defineEmits(['toggleChatHistory'])
</script>

<template>
  <v-container v-if="props.chatHistoryExpanded" class="d-flex flex-row justify-center read-aloud">
    <v-btn
      class="ma-1 no-uppercase"
      color="primary"
      @click="$emit('toggleChatHistory')"
      :aria-label="`Expand chat history`"
    >
      Collapse chat history</v-btn
    >
  </v-container>
</template>

<style scoped>
.read-aloud {
  border-left: #ccced1 1px solid;
  border-bottom: #ccced1 1px solid;
  border-right: #ccced1 1px solid;
  padding: 4px 8px 4px;
}
.no-uppercase {
  text-transform: unset !important;
}
</style>
