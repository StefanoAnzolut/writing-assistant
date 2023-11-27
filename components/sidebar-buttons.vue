<script setup lang="ts">
const props = defineProps({
  drawer: {
    type: Boolean as PropType<boolean>,
    required: true,
  },
})
defineEmits(['closeDrawer'])
</script>

<template>
  <div
    class="d-flex justify-center align-center"
    :class="props.drawer === true ? 'sidebar-button-left' : 'sidebar-button-right'"
    aria-label="Toggle sidebar"
  >
    <v-btn
      variant="text"
      :icon="props.drawer === true ? 'mdi-chevron-right' : 'mdi-chevron-left'"
      @click.stop="$emit('closeDrawer', !props.drawer)"
      :aria-label="props.drawer === true ? 'Close sidebar' : 'Open sidebar'"
    ></v-btn>
  </div>
</template>

<style scoped>
.sidebar-button-left {
  position: fixed;
  left: 0;
  top: 50%;
  z-index: 2000;
  transition-property: transform;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 300ms;
  --transform-rotate: 180deg;
  --transform-translate-x: 0;
}
.sidebar-button-right {
  position: fixed;
  left: 0;
  top: 50%;
  z-index: 2000;
  transition-property: transform;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 300ms;
  --transform-rotate: 0;
}
</style>
