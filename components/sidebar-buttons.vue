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
    :class="props.drawer === true ? 'sidebar-container-left' : 'sidebar-container-right'"
  >
    <v-btn
      :class="props.drawer === true ? 'sidebar-button-left' : 'sidebar-button-right'"
      variant="text"
      color="white"
      :icon="props.drawer === true ? 'mdi-chevron-left' : 'mdi-chevron-right'"
      @click.stop="$emit('closeDrawer', !props.drawer)"
      :aria-label="props.drawer === true ? 'Collapse document navigation' : 'Expand document navigation'"
    ></v-btn>
  </div>
</template>

<style scoped>
.sidebar-container-left {
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
.sidebar-container-right {
  position: fixed;
  left: 0;
  top: 50%;
  z-index: 2000;
  transition-property: transform;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 300ms;
  --transform-rotate: 0;
}
.sidebar-button-right {
  margin-left: 8px;
  background-color: #1867c0;
}
.sidebar-button-left {
  margin-left: 264px !important;
  background-color: #1867c0;
}
</style>
