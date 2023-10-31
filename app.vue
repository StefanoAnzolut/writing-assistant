<script setup lang="ts">
import { useChat } from 'ai/vue'
import ContextMenu from './components/ContextMenu.vue'
import SiteHeader from './components/SiteHeader.vue'
import SkipLinks from './components/SkipLinks.vue'

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
const chatHistory = reactive([])
const contextMenuRef = ref()

function updateRefs(el, index) {
  chatHistory[index] = el
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
  contextMenuRef.value.toggleMenuOnRef()
  contextMenuRef.value.positionMenuRef(e)
}
</script>

<template>
  <SkipLinks />
  <SiteHeader />
  <v-container>
    <v-row>
      <v-col cols="3">
        <div class="card">
          <h2 class="card-title">Chat</h2>
          <div class="card-text">
            <div class="chat">
              <!-- Maybe, pin the last question from the user here -->
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
  <ContextMenu ref="contextMenuRef" @submit="submitSelected" />
</template>

<style scoped>
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
