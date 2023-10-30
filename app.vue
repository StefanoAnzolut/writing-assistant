<script setup lang="ts">
import { useChat } from 'ai/vue'

useHead({
  title: 'Writing Assistant',
  meta: [{ name: 'An AI-powered writing assistant' }],
})

const { messages, input, handleSubmit } = useChat({
  headers: { 'Content-Type': 'application/json' },
})

let CKEditor: any
let ClassicEditor = ref()
if (process.client) {
  CKEditor = defineAsyncComponent(() => import('@ckeditor/ckeditor5-vue').then(module => module.component))
  import('@ckeditor/ckeditor5-build-classic').then(e => (ClassicEditor.value = e.default))
}

const editorContent = ref('')
const skipLink = ref()
const contextMenu = ref()
const menuState = ref(0)
const positionMenuRef = ref()
const toggleMenuOffRef = ref()
const toggleMenuOnRef = ref()

const chatHistory = reactive([])

function updateRefs(el, index) {
  chatHistory[index] = el
}

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

function submit(e: any): void {
  if (input.value === '') {
    input.value = input.value.concat(editorContent.value)
  }
  handleSubmit(e)
}

function submitSelected(event: Event, prompt: string) {
  console.log('submitSelected')
  const selected = window.getSelection()
  if (selected.toString() === '') {
    return
  }
  input.value = input.value.concat(prompt + selected)
  handleSubmit(event)
}

watch(messages, (_): void => {
  messages.value.forEach(function (message, idx, array) {
    if (message.role === 'assistant' && idx === array.length - 1) {
      console.log(editorContent.value)
      if (editorContent.value.includes('<p>-----</p><p>Suggestion: ')) {
        editorContent.value = editorContent.value.replace(
          /<p>-----<\/p><p>Suggestion: .*$/g,
          `<p>-----</p><p>Suggestion: ${message.content}</p><p>-----</p>`
        )
        chatHistory[chatHistory.length - 1].focus()
      } else {
        editorContent.value = editorContent.value.concat(
          `<p>-----</p><p>Suggestion: ${message.content}</p><p>-----</p>`
        )
        chatHistory[chatHistory.length - 1].focus()
      }
    }
  })
})

function onContextMenu(e: MouseEvent) {
  //prevent the browser's default menu
  e.preventDefault()
  toggleMenuOnRef.value()
  positionMenuRef.value(e)
}
</script>

<template>
  <ul class="skip-links">
    <li>
      <a href="#chat-input" ref="skipLink" class="skip-link">Skip to chat</a>
    </li>
  </ul>
  <v-container>
    <v-row>
      <v-col cols="12">
        <h1>
          <a href="#">
            <img src="./favicon.svg" alt="Writing Assistant" />
          </a>
        </h1>
      </v-col>
    </v-row>
    <v-row>
      <v-col cols="3">
        <div class="card">
          <h2 class="card-title">Chat</h2>
          <div class="card-text">
            <div class="chat">
              <div
                v-for="(m, i) in messages"
                :index="i"
                key="m.id"
                class="chat-message"
                :ref="el => updateRefs(el, i)"
                tabindex="-1"
              >
                {{ m.role === 'user' ? 'User: ' : 'Writing Assistant: ' }}
                {{ m.content }}
              </div>
              <form @submit="submit">
                <input id="chat-input" class="chat-input" v-model="input" placeholder="Send a message" />
              </form>
            </div>
          </div>
        </div>
      </v-col>
      <v-col cols="8">
        <div class="card">
          <h2 class="card-title">Editor</h2>
          <div class="card-text" @contextmenu="onContextMenu($event)">
            <client-only>
              <CKEditor v-if="ClassicEditor" v-model="editorContent" :editor="ClassicEditor"></CKEditor>
            </client-only>
          </div>
        </div>
      </v-col>
    </v-row>
  </v-container>
  <ul ref="contextMenu" aria-label="Context Menu" class="context-menu">
    <li class="context-menu-list-item">
      <button
        @click="
          submitSelected(
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
          submitSelected(
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
          submitSelected(
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
          submitSelected(
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
          submitSelected(
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
          submitSelected(
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
          submitSelected(
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
          submitSelected(
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
          submitSelected(
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
.chat {
  width: 100%;
  max-width: 28rem;
  background-color: #ffffff;
  border: #000000 2px solid;
  display: flex;
  flex-direction: column;
  max-height: 50vh;
  overflow-y: scroll;
}
.chat-message {
  white-space: pre-wrap;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  border-bottom: #000000 1px solid;
}
.chat-input {
  bottom: 0;
  padding: 0.5rem;
  padding-top: 2rem;
  border-radius: 0.25rem;
  border-width: 1px;
  border-color: #d1d5db;
  border-top: #000000 1px solid;
  width: 100%;
  max-width: 28rem;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
}
</style>
