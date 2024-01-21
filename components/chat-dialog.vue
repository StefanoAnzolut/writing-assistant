<script setup lang="ts">
const props = defineProps({
  dialog: {
    type: Boolean,
    default: false,
  },
})
const emit = defineEmits(['appendDocument', 'newDocument', 'overwriteDocument'])
</script>
<template>
  <div class="text-center">
    <v-dialog v-model="props.dialog" width="auto">
      <v-card>
        <v-card-text>
          You are about to add a different structure. <br />
          Where should this structure be added to?
        </v-card-text>
        <v-container class="d-flex flex-column">
          <v-btn
            id="insert-new-document-dialog"
            class="ma-1 no-uppercase"
            color="primary"
            @click="$emit('newDocument')"
          >
            Insert into new document
          </v-btn>
          <v-btn class="ma-1 no-uppercase" color="primary" @click="$emit('overwriteDocument')">
            Overwrite current document
          </v-btn>
          <v-btn class="ma-1 no-uppercase" color="primary" @click="$emit('appendDocument')">
            Append to current document at the end</v-btn
          >
        </v-container>
      </v-card>
    </v-dialog>
  </div>
</template>

<style>
.no-uppercase {
  text-transform: unset !important;
}
</style>
