<script setup lang="ts">
import { useChat } from 'ai/vue'
import ContextMenu from './components/ContextMenu.vue'
import SiteHeader from './components/SiteHeader.vue'
import SkipLinks from './components/SkipLinks.vue'
import { getTokenOrRefresh } from './utils/token_util'
import { ResultReason } from 'microsoft-cognitiveservices-speech-sdk'
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk'

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

/** Shared editor content between the user and the writing partner */
const editorContent = ref('')
/** Session chat history between the user and the writing partner */
const chatHistory = reactive([{}])
/** The reference of the context menu for the text editor */
const contextMenuRef = ref()
/** Text-To-Speech Audio Player*/
const tts_audio = ref({ player: new speechsdk.SpeakerAudioDestination(), muted: false })

/** Set the references of chat messages in order to focus on specific ones */
function updateRefs(messageElement: Element, index: number) {
  chatHistory[index] = messageElement
}

/** Text completion submission wrapper */
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

/** Suggestion text box for the writing partner in the text editor
 * uses the editorContent for the shared state
 */
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

async function sttFromMic() {
  const tokenObj = await getTokenOrRefresh()
  const speechConfig = speechsdk.SpeechConfig.fromAuthorizationToken(tokenObj.authToken, tokenObj.region)
  speechConfig.speechRecognitionLanguage = 'de-DE'

  const audioConfig = speechsdk.AudioConfig.fromDefaultMicrophoneInput()
  const recognizer = new speechsdk.SpeechRecognizer(speechConfig, audioConfig)

  console.log('speak into your microphone...')

  recognizer.recognizeOnceAsync(result => {
    if (result.reason === ResultReason.RecognizedSpeech) {
      console.log(`RECOGNIZED: Text=${result.text}`)
    } else {
      console.log('ERROR: Speech was cancelled or could not be recognized. Ensure your microphone is working properly.')
    }
  })
}

async function synthesizeSpeech() {
  const tokenObj = await getTokenOrRefresh()
  const speechConfig = speechsdk.SpeechConfig.fromAuthorizationToken(tokenObj.authToken, tokenObj.region)
  speechConfig.speechSynthesisLanguage = 'de-DE'
  /** Leni & Jan für CH. Alle weiteren findet man hier: https://speech.microsoft.com/portal/voicegallery */
  speechConfig.speechSynthesisVoiceName = 'de-CH-JanNeural'
  const audioConfig = speechsdk.AudioConfig.fromSpeakerOutput(tts_audio.value.player)
  let synthesizer = new speechsdk.SpeechSynthesizer(speechConfig, audioConfig)

  const textToSpeak = 'Dies ist ein Beispiel für die Sprachsynthese eines langen Textabschnitts.'
  console.log(`speaking text: ${textToSpeak}...`)
  synthesizer.speakTextAsync(
    textToSpeak,
    result => {
      let text
      if (result.reason === speechsdk.ResultReason.SynthesizingAudioCompleted) {
        text = `synthesis finished for "${textToSpeak}".\n`
      } else if (result.reason === speechsdk.ResultReason.Canceled) {
        text = `synthesis failed. Error detail: ${result.errorDetails}.\n`
      }
      synthesizer.close()
      console.log(text)
    },
    function (err) {
      console.log(`Error: ${err}.\n`)

      synthesizer.close()
    }
  )
}

async function handleMute() {
  if (!tts_audio.value.muted) {
    tts_audio.value.player.pause()
    tts_audio.value.muted = true
  } else {
    tts_audio.value.player.resume()
    tts_audio.value.muted = false
  }
}

async function replayAudio() {
  tts_audio.value.player.pause()
  tts_audio.value.player.resume()
}
</script>

<template>
  <SkipLinks />
  <SiteHeader />
  <div class="text-center pt-4">
    <button class="stt" @click="sttFromMic">Activate voice</button>
    <button class="stt" @click="synthesizeSpeech">Text to speech</button>
    <button class="stt" @click="handleMute">Pause/Continue</button>
    <button class="stt" @click="replayAudio">Replay audio</button>
  </div>
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
                {{ m.role === 'user' ? 'User: ' : 'Writing Partner: ' }}
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
  border: #ccced1 1px solid;
  display: flex;
  flex-direction: column;
  max-height: 50vh;
  overflow-y: scroll;
}
.chat-message {
  white-space: pre-wrap;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  border-bottom: #ccced1 1px solid;
}
.chat-input {
  bottom: 0;
  padding: 0.5rem;
  padding-top: 2rem;
  border-radius: 0.25rem;
  border-width: 1px;
  border-color: #d1d5db;
  width: 100%;
  max-width: 28rem;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
}
.stt {
  border: 3px solid;
  border-color: #000000;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  padding-top: 1rem;
  padding-bottom: 1rem;
  border-radius: 0.5rem;
  border-width: 1px;
  filter: drop-shadow(0 0 0.75rem #d1d5db);
}
</style>
