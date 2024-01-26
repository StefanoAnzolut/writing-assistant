<script setup lang="ts">
const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  inputDisabled: {
    type: Boolean,
    default: false,
  },
})
const emit = defineEmits(['update:modelValue', 'sttFromMic'])
</script>

<template>
  <v-btn
    id="mic-input-btn"
    icon="mdi-microphone"
    color="primary"
    class="no-uppercase mt-3 ml-1"
    @click="$emit('sttFromMic')"
    aria-label="Start talking to ChatGPT"
  ></v-btn>
  <div class="flex-grow-1 mx-2">
    <input
      id="chat-input"
      class="chat-input"
      autocomplete="off"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      placeholder="Send a message"
      aria-label="Enter your prompt to ChatGPT"
      :disabled="inputDisabled"
    />
  </div>
</template>

<style scoped>
.chat-input {
  padding: 0.5rem;
  margin-top: 0.75rem;
  border-radius: 0.25rem;
  border-width: 1px;
  border-color: #d1d5db;
  width: 100%;
  height: 48px;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
}
::placeholder {
  color: black;
  opacity: 1; /* Firefox */
}

.no-uppercase {
  text-transform: unset !important;
}
</style>
