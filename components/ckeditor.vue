<script setup>
import { watch } from 'vue';

  let CKEditor
  let ClassicEditor = ref()
  const content = ref('')
  // https://github.com/ckeditor/ckeditor5-vue/issues/74
  if (process.client) {
      CKEditor = defineAsyncComponent(() => import('@ckeditor/ckeditor5-vue').then(module => module.component))
      import('@ckeditor/ckeditor5-build-classic').then(e => ClassicEditor.value = e.default)
  }

  const emit = defineEmits(['update'])

  watch(content, (newVal) => {
      emit('update', newVal)
  })
</script>


<template>
  <client-only>
      <CKEditor 
          v-if="ClassicEditor" 
          v-model="content"
          :editor="ClassicEditor"
      ></CKEditor>
  </client-only>
</template>