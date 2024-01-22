<script setup lang="ts">
useHead({
  title: 'Writing Assistant',
  meta: [{ name: 'An ai writing assistant' }],
  htmlAttrs: {
    lang: 'en',
  },
})
</script>
<template>
  <NuxtLayout>
    <NuxtLoadingIndicator />
    <NuxtPage />
  </NuxtLayout>
</template>
