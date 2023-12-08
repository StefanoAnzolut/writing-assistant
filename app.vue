<script setup lang="ts">
useHead({
  title: 'Writing Partner',
  meta: [{ name: 'An AI-powered writing partner' }],
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
