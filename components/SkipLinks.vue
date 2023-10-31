<script setup lang="ts">
const skipLink = ref()
</script>

<template>
  <ul class="skip-links">
    <li>
      <a href="#chat-input" ref="skipLink" class="skip-link">Skip to chat</a>
    </li>
  </ul>
</template>

<style scoped>
.skip-link {
  white-space: nowrap;
  margin: 1em auto;
  top: 0;
  position: fixed;
  left: 50%;
  margin-left: -72px;
  opacity: 0;
}
.skip-link:focus {
  opacity: 1;
  background-color: white;
  padding: 0.5em;
  border: 1px solid black;
}
</style>
