<script setup lang="ts">
const skipLink = ref()
</script>

<template>
  <div>
    <ul class="skip-to-content">
      <li>
        <a href="#chat-input" ref="skipLink" class="skip-to-content-link">Skip to chat</a>
        <a href="#editor" ref="skipLink" class="skip-to-content-link">Skip to text editor</a>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.skip-to-content-link {
  background-color: #222;
  color: #ffea00;
  display: block;
  font-size: 1.2rem;
  left: 10px;
  line-height: 1;
  padding: 3px 1rem;
  position: absolute;
  top: 10px;
  transform: translateY(-100%) translateY(-14px);
  transition: transform 0.2s;
  z-index: 10000;
}

.skip-to-content-link:focus {
  transform: translateY(0%);
}

.skip-to-content {
  list-style: none;
}
</style>
