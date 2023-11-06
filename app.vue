<script setup lang="ts">
import { useChat } from 'ai/vue'
import SiteHeader from './components/SiteHeader.vue'
import SkipLinks from './components/SkipLinks.vue'
import { getTokenOrRefresh } from './utils/token_util'
import { ResultReason } from 'microsoft-cognitiveservices-speech-sdk'
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk'
import type { AsyncComponentLoader } from 'vue'

useHead({
  title: 'Writing Partner',
  meta: [{ name: 'An AI-powered writing partner' }],
})

const { messages, input, handleSubmit } = useChat({
  headers: { 'Content-Type': 'application/json' },
})

// let ClassicEditor = ref()
// if (process.client) {
//   CKEditor = defineAsyncComponent(() => import('@ckeditor/ckeditor5-vue').then(module => module.component))
//   import('@ckeditor/ckeditor5-build-classic').then(e => (ClassicEditor.value = e.default))
// }

let ckeditor: AsyncComponentLoader
let editor: any
if (process.client) {
  ckeditor = defineAsyncComponent(() => import('@mayasabha/ckeditor4-vue3').then(module => module.component))
}
const editorUrl = 'https://a11y-editor-proxy.fly.dev/ckeditor.js'

function onNamespaceLoaded() {
  CKEDITOR.on('instanceReady', function (ck) {
    ck.editor.removeMenuItem('cut')
    ck.editor.removeMenuItem('copy')
    ck.editor.removeMenuItem('paste')
    editor = ck.editor
    let actions = [
      {
        name: 'summarize',
        label: 'Summarize',
        prompt:
          'Summarize the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'checkSpelling',
        label: 'Check spelling',
        prompt:
          'Check spelling for the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'reformulate',
        label: 'Reformulate',
        prompt:
          'Reformulate the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'concise',
        label: 'Concise',
        prompt:
          'Concise the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'addStructure',
        label: 'Add structure',
        prompt:
          'Add structure to the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'define',
        label: 'Define',
        prompt:
          'Define the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'findSynonyms',
        label: 'Find synonyms',
        prompt:
          'Find synonyms for the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'giveWritingAdvice',
        label: 'Give writing advice',
        prompt:
          'Give writing advice for the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'adaptToScientificStyle',
        label: 'Adapt to scientific style',
        prompt:
          'Adapt to scientific style the following content and make it such that the response can immediately be added to a text editor Selection start marker:',
      },
      {
        name: 'describeFormatting',
        label: 'Describe formatting',
        prompt:
          'Focus only on the formatting of the following content and accurately return the description of the formatting structure only, do not add unseen formatting, do not return your answer as a list. Selection start marker:',
      },
    ]

    registerActions(editor, actions)
  })
}

function registerActions(editor, actions) {
  let group = 'group'
  let counter = 0
  let contextMenuListener = {}
  actions.forEach(function (action) {
    let groupName = 'group' + counter
    editor.addMenuGroup(groupName)
    editor.addCommand(action.name, {
      exec: function (editor) {
        const eventTemp = new Event('submit')
        submitSelected(eventTemp, action.prompt)
      },
    })
    editor.addMenuItem(action.name, {
      label: action.label,
      command: action.name,
      group: groupName,
    })
    contextMenuListener[action.name] = CKEDITOR.TRISTATE_OFF
  })
  editor.contextMenu.addListener(function (element) {
    return contextMenuListener
  })
}

/** Shared editor content between the user and the writing partner */
const editorContent = ref('')
/** Session chat history between the user and the writing partner */
const chatHistory = reactive([{}])
/** The reference of the context menu for the text editor */
const contextMenuRef = ref()
/** Text-To-Speech Audio Player*/
const tts_audio = ref({ player: new speechsdk.SpeakerAudioDestination(), muted: false })
/** Overlay for the voice interaction */
const overlay = ref(false)

const texts = reactive({
  audioPlayer: {
    pause: 'Pause',
    play: 'Play',
  },
})

tts_audio.value.player.onAudioEnd = () => {
  overlay.value = false
}

tts_audio.value.player.onAudioStart = () => {
  overlay.value = true
  tts_audio.value.muted = false
  let playPauseButton = document.getElementById('playPauseButton')
  playPauseButton.focus()
}

// const voiceInteraction = ref(false)

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
  const range = editor.getSelection().getRanges()[0]
  const selected_fragment = range.cloneContents()
  const selected_text = selected_fragment.$['textContent']
  // const selected = window.getSelection()
  if (selected_text === '') {
    return
  }
  input.value = input.value.concat(prompt + selected_text)
  try {
    handleSubmit(event)
  } catch (e) {
    console.log(e)
  }
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
        // if (!voiceInteraction.value) {
        chatHistory[chatHistory.length - 1].focus()
        // }
      } else {
        editorContent.value = editorContent.value.concat(
          `<p>-----</p><p>Suggestion: ${message.content}</p><p>-----</p>`
        )
        // if (!voiceInteraction.value) {
        chatHistory[chatHistory.length - 1].focus()
        // }
      }
    }
  })
})

function insertText(text: string) {
  editorContent.value = text
}

async function sttFromMic() {
  const tokenObj = await getTokenOrRefresh()
  const speechConfig = speechsdk.SpeechConfig.fromAuthorizationToken(tokenObj.authToken, tokenObj.region)
  speechConfig.speechRecognitionLanguage = 'en-US'
  // Todo: Check additional effort to inlcude auto-detection of language
  const audioConfig = speechsdk.AudioConfig.fromDefaultMicrophoneInput()
  const recognizer = new speechsdk.SpeechRecognizer(speechConfig, audioConfig)

  console.log('speak into your microphone...')

  recognizer.recognizeOnceAsync(result => {
    if (result.reason === ResultReason.RecognizedSpeech) {
      console.log(`RECOGNIZED: Text=${result.text}`)
      input.value = input.value.concat(result.text)
      const eventTemp = new Event('submit')
      handleSubmit(eventTemp)
    } else {
      console.log('ERROR: Speech was cancelled or could not be recognized. Ensure your microphone is working properly.')
      // if (voiceInteraction.value){
      synthesizeSpeech('Speech was cancelled or could not be recognized. Ensure your microphone is working properly.')
      // }
    }
  })
}

async function synthesizeSpeech(textToSpeak: string) {
  const tokenObj = await getTokenOrRefresh()
  const speechConfig = speechsdk.SpeechConfig.fromAuthorizationToken(tokenObj.authToken, tokenObj.region)
  speechConfig.speechSynthesisLanguage = 'en-US'
  /** Leni & Jan für CH. Alle weiteren findet man hier: https://speech.microsoft.com/portal/voicegallery */
  speechConfig.speechSynthesisVoiceName = 'en-US-JennyNeural'
  const audioConfig = speechsdk.AudioConfig.fromSpeakerOutput(tts_audio.value.player)
  let synthesizer = new speechsdk.SpeechSynthesizer(speechConfig, audioConfig)

  console.log(`speaking text: ${textToSpeak}...`)

  // Events are raised as the output audio data becomes available, which is faster than playback to an output device.
  // We must must appropriately synchronize streaming and real-time.
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

async function pause() {
  if (!tts_audio.value.muted) {
    // overlay.value = false
    tts_audio.value.player.pause()
    tts_audio.value.muted = true
  } else {
    // overlay.value = false;
    tts_audio.value.player.resume()
    tts_audio.value.muted = false
  }
}

// async function replayAudio() {
//   overlay.value = true
//   tts_audio.value.player.pause()
//   tts_audio.value.player.resume()
// }

// function demoSpeechSynthesis(){
//   insertText("<ol><li>1. Methods<ol><li>1.1 Qualitative work</li><li>1.2 Data collection<ol><li>1.2.1 Demographics of participants</li></ol></li></ol></li></ol>")
//   synthesizeSpeech(
//           'This is a sample response. The text has the following formatting: Level 1 1. Methods list with one entry Level 2 1.1 Qualitative work 1.2 Data collection list with two entries Level 3 1.2.1 Demographics of participants list with one entry. Check the format in the text editor with the screen reader.'
//   )
//   document.getElementById("speechSynthesis").disabled = true;
// }
</script>

<template>
  <SkipLinks />
  <SiteHeader />
  <!-- <div class="text-center pt-4">
    <button
    id="speechSynthesis"
      class="stt"
      @click="
        demoSpeechSynthesis()
      "
    >
      Voice example
    </button>
  </div> -->
  <v-container>
    <v-row>
      <v-col cols="3">
        <div class="card">
          <p class="card-title">Chat</p>
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
                <h3>
                  {{ m.role === 'user' ? 'User: ' : 'Writing Partner: ' }}
                  {{ m.content }}
                </h3>
              </div>
              <form @submit="submit">
                <h2>
                  <input
                    id="chat-input"
                    class="chat-input"
                    autocomplete="off"
                    v-model="input"
                    placeholder="Send a message"
                    aria-label="chat input"
                  />
                </h2>
              </form>
            </div>
          </div>
        </div>
        <v-btn color="success" class="mt-4" @click="sttFromMic"> Start talking </v-btn>
        <!-- <v-btn
          color="success"
          class="mt-12"
          @click="replayAudio"
        >
          Replay last message
        </v-btn> -->
        <v-overlay v-model="overlay" contained class="align-center justify-center">
          <v-btn id="playPauseButton" color="success" @click="pause()">
            {{ tts_audio.muted ? texts.audioPlayer.play : texts.audioPlayer.pause }}
          </v-btn>
        </v-overlay>
      </v-col>
      <v-col cols="8">
        <div class="card">
          <p class="card-title">Editor</p>
          <div class="card-text">
            <client-only>
              <h2>
                <ckeditor
                  id="text-editor"
                  :editor-url="editorUrl"
                  v-model="editorContent"
                  @namespaceloaded="onNamespaceLoaded"
                ></ckeditor>
              </h2>
            </client-only>
          </div>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.card-title {
  display: block;
  font-size: 1.5em;
  margin-block-start: 0.83em;
  margin-block-end: 0.83em;
  margin-inline-start: 0px;
  margin-inline-end: 0px;
  font-weight: bold;
}

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
  display: block;
  margin-block-start: 1em;
  margin-block-end: 1em;
  margin-inline-start: 0px;
  margin-inline-end: 0px;
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
