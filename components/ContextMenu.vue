<script setup lang="ts">
const contextMenu = ref()
const menuState = ref(0)
const positionMenuRef = ref()
const toggleMenuOffRef = ref()
const toggleMenuOnRef = ref()

if (process.client) {
  contextMenu.value = document.querySelector('.context-menu')
  console.log(contextMenu)
  console.log(contextMenu.value)

  // Event Listener for Close Context Menu when outside of menu clicked
  document.addEventListener('click', e => {
    var button = e.which || e.button
    if (button === 1) {
      toggleMenuOff()
    }
  })
  // Get the position of the right-click in window and returns the X and Y coordinates
  function getPosition(e) {
    var posx = 0
    var posy = 0

    if (!e) var e = window.event

    if (e.pageX || e.pageY) {
      posx = e.pageX
      posy = e.pageY
    } else if (e.clientX || e.clientY) {
      posx = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft
      posy = e.clientY + document.body.scrollTop + document.documentElement.scrollTop
    }

    return {
      x: posx,
      y: posy,
    }
  }
  // Position the Context Menu in right position.
  function positionMenu(event: Event) {
    let clickCoords = getPosition(event)
    let clickCoordsX = clickCoords.x
    let clickCoordsY = clickCoords.y
    if (contextMenu.value === null) {
      console.log(contextMenu.value)
      return
    }
    let menuWidth = contextMenu.value.offsetWidth + 4
    let menuHeight = contextMenu.value.offsetHeight + 4

    let windowWidth = window.innerWidth
    let windowHeight = window.innerHeight

    if (windowWidth - clickCoordsX < menuWidth) {
      contextMenu.value.style.left = windowWidth - menuWidth + 'px'
    } else {
      contextMenu.value.style.left = clickCoordsX + 'px'
    }

    if (windowHeight - clickCoordsY < menuHeight) {
      contextMenu.value.style.top = windowHeight - menuHeight + 'px'
    } else {
      contextMenu.value.style.top = clickCoordsY + 'px'
    }
  }
  // Close Context Menu on Esc key press
  window.onkeyup = function (e) {
    if (e.keyCode === 27) {
      toggleMenuOff()
    }
  }
  positionMenuRef.value = positionMenu

  function toggleMenuOff() {
    if (menuState.value !== 0) {
      menuState.value = 0
      if (contextMenu.value !== null) {
        contextMenu.value.classList.remove('d-block')
      }
    }
  }
  toggleMenuOffRef.value = toggleMenuOff

  function toggleMenuOn() {
    if (menuState.value !== 1) {
      menuState.value = 1
      if (contextMenu.value !== null) {
        contextMenu.value.classList.add('d-block')
      }
    }
  }
  toggleMenuOnRef.value = toggleMenuOn
}

defineExpose({
  toggleMenuOnRef,
  toggleMenuOffRef,
  positionMenuRef,
})
</script>

<template>
  <ul ref="contextMenu" aria-label="Context Menu" class="context-menu">
    <li class="context-menu-list-item">
      <button
        @click="
          $emit(
            'submit',
            $event,
            'Summarize the following content and make it such that the response can immediately be added to a text editor: '
          )
        "
      >
        Summarize
      </button>
    </li>
    <li class="context-menu-list-item">
      <button
        @click="
          $emit(
            'submit',
            $event,
            'Check spelling for the following content and make it such that the response can immediately be added to a text editor: '
          )
        "
      >
        Check spelling
      </button>
    </li>
    <li class="context-menu-list-item">
      <button
        @click="
          $emit(
            'submit',
            $event,
            'Reformulate the following content and make it such that the response can immediately be added to a text editor: '
          )
        "
      >
        Reformulate
      </button>
    </li>
    <li class="context-menu-list-item">
      <button
        @click="
          $emit(
            'submit',
            $event,
            'Concise the following content and make it such that the response can immediately be added to a text editor: '
          )
        "
      >
        Concise
      </button>
    </li>
    <li class="context-menu-list-item">
      <button
        @click="
          $emit(
            'submit',
            $event,
            'Add structure to the following content and make it such that the response can immediately be added to a text editor: '
          )
        "
      >
        Add structure
      </button>
    </li>
    <li class="context-menu-list-item">
      <button
        @click="
          $emit(
            'submit',
            $event,
            'Define the following content and make it such that the response can immediately be added to a text editor: '
          )
        "
      >
        Define
      </button>
    </li>
    <li class="context-menu-list-item">
      <button
        @click="
          $emit(
            'submit',
            $event,
            'Find synonyms for the following content and make it such that the response can immediately be added to a text editor: '
          )
        "
      >
        Find synonyms
      </button>
    </li>
    <li class="context-menu-list-item">
      <button
        @click="
          $emit(
            'submit',
            $event,
            'Give writing advice for the following content and make it such that the response can immediately be added to a text editor: '
          )
        "
      >
        Give writing advice
      </button>
    </li>
    <li class="context-menu-list-item">
      <button
        @click="
          $emit(
            'submit',
            $event,
            'Adapt to scientific style the following content and make it such that the response can immediately be added to a text editor: '
          )
        "
      >
        Adapt to scientific style
      </button>
    </li>
  </ul>
</template>

<style scoped>
.context-menu {
  display: none;
  position: absolute;
  z-index: 10;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  padding-top: 1rem;
  padding-bottom: 1rem;
  flex-direction: column;
  border-radius: 0.5rem;
  border-width: 1px;
  border-color: #d1d5db;
  font-size: 0.875rem;
  line-height: 1.25rem;
  background-color: #ffffff;
  filter: drop-shadow(0 0 0.75rem #d1d5db);
}
.context-menu-list-item {
  display: flex;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  padding-left: 1.5rem;
  padding-right: 1.5rem;
  border-radius: 0.25rem;
  cursor: pointer;
}
.context-menu-list-item:hover {
  background-color: #f1f1f1;
}

context-menu-list-item-icon {
  width: 1.25rem;
  color: #111827;
}

.context-menu-list-item-text {
  margin-left: 1rem;
  color: #2e2e2e;
}
</style>
