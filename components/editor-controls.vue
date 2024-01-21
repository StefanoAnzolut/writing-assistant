<script setup lang="ts">
import type { AudioPlayer } from '~/models/AudioPlayer'
import { useDisplay } from 'vuetify'
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
const { mdAndUp } = useDisplay()
</script>

<template>
  <v-container class="d-flex justify-end read-aloud" :class="mdAndUp ? 'flex-row' : 'flex-column'">
    <v-btn
      v-if="props.showReadAloud"
      id="playPauseButtonReadAloud"
      :icon="props.audioPlayer.muted ? 'mdi-play' : 'mdi-pause'"
      class="ma-1"
      :color="props.audioPlayer.muted ? 'success' : 'error'"
      :aria-label="props.audioPlayer.muted ? 'Resume' : 'Pause'"
      @click="$emit('pauseReadAloud', props.audioPlayer, props.readAloudPlayerIndex)"
      size="small"
    ></v-btn>
    <v-btn
      :class="mdAndUp === true ? 'v-btn--size-default' : ''"
      class="ma-1 no-uppercase"
      color="primary"
      :size="mdAndUp === true ? 'null' : 'small'"
      @click="$emit('clearEditorContent')"
      >Clear text editor</v-btn
    >
    <v-btn
      id="read-only"
      :class="mdAndUp === true ? 'v-btn--size-default' : ''"
      class="ma-1 no-uppercase"
      :size="mdAndUp === true ? 'null' : 'small'"
      color="primary"
      @click="$emit('toggleReadOnly', props.readOnly)"
      >{{ props.readOnly ? 'Deactivate read only' : 'Activate read only' }}</v-btn
    >
    <v-btn
      id="download-word"
      :class="mdAndUp === true ? 'v-btn--size-default' : ''"
      class="ma-1 no-uppercase"
      color="primary"
      @click="$emit('downloadWord')"
      :size="mdAndUp === true ? 'null' : 'small'"
      >Download document</v-btn
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
