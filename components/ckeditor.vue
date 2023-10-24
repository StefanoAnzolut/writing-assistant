<script setup lang="ts">
  // This project is using defineModel(), which is an experimental feature. 
  // Simplified bi-directional communication (replaces need for boilerplate props and events code)
  // It may receive breaking changes or be removed in the future, so use at your own risk.
  // Follow the RFC at https://github.com/vuejs/rfcs/discussions/503.
  const editorContent = defineModel<string>({ default: '' }); // ^? Ref<any>
    
  // https://github.com/ckeditor/ckeditor5-vue/issues/74
  let CKEditor: any
  let ClassicEditor = ref()
  if (process.client) {
      CKEditor = defineAsyncComponent(() => import('@ckeditor/ckeditor5-vue').then(module => module.component))
      import('@ckeditor/ckeditor5-build-classic').then(e => ClassicEditor.value = e.default)
  }
</script>


<template>
  <client-only>
      <CKEditor 
          v-if="ClassicEditor" 
          v-model="editorContent"
          :editor="ClassicEditor"
      ></CKEditor>
  </client-only>
</template>