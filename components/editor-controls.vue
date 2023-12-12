<script setup lang="ts">
import type { AudioPlayer } from '~/models/AudioPlayer'

const props = defineProps({
  showReadAloud: {
    type: Boolean as PropType<boolean>,
    required: true,
  },
  audioPlayer: {
    type: Object as PropType<AudioPlayer>,
    required: true,
  },
  readOnly: {
    type: Boolean as PropType<boolean>,
    required: true,
  },
  readAloudPlayerIndex: {
    type: Number as PropType<number>,
    required: true,
  },
})
defineEmits(['pauseReadAloud', 'toggleReadOnly', 'clearEditorContent', 'downloadWord'])
</script>

<template>
  <v-container class="d-flex flex-row justify-end read-aloud">
    <v-btn class="ma-1 no-uppercase" color="primary" @click="$emit('downloadWord')">Download as word</v-btn>
    <v-btn
      v-if="props.showReadAloud"
      id="playPauseButtonReadAloud"
      :icon="props.audioPlayer.muted ? 'mdi-play' : 'mdi-pause'"
      class="ma-1"
      :color="props.audioPlayer.muted ? 'success' : 'error'"
      :aria-label="props.audioPlayer.muted ? 'Play' : 'Pause'"
      @click="$emit('pauseReadAloud', props.audioPlayer, props.readAloudPlayerIndex)"
      size="small"
    ></v-btn>
    <v-btn
      v-if="props.readOnly === true"
      class="ma-1 no-uppercase"
      color="primary"
      @click="$emit('toggleReadOnly', readOnly)"
      >Deactivate read only</v-btn
    >
    <v-btn v-else class="ma-1 no-uppercase" color="primary" @click="$emit('toggleReadOnly', readOnly)"
      >Activate read only</v-btn
    >
    <v-btn class="ma-1 no-uppercase" color="primary" @click="$emit('clearEditorContent')">Clear text editor</v-btn>
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
