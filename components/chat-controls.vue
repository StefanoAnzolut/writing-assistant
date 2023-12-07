<script setup lang="ts">
const props = defineProps({
  chatHistoryExpanded: {
    type: Boolean as PropType<boolean>,
    required: true,
  },
})
defineEmits(['readLastAnswer', 'toggleChatHistory'])
</script>

<template>
  <v-container class="d-flex flex-row justify-end read-aloud">
    <v-btn
      v-if="props.chatHistoryExpanded"
      class="ma-1 no-uppercase"
      color="primary"
      @click="$emit('toggleChatHistory')"
      :aria-label="`Expand chat history`"
    >
      Collapse chat history</v-btn
    >
    <v-btn class="ma-1 no-uppercase" color="primary" @click="$emit('readLastAnswer')"> Read last answer</v-btn>
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
