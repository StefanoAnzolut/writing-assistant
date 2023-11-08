<script setup lang="ts">
import { useChat } from 'ai/vue'
import SiteHeader from './components/SiteHeader.vue'
import { getTokenOrRefresh } from './utils/token_util'
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk'
import type { AsyncComponentLoader } from 'vue'
import * as Tone from 'tone'

useHead({
  title: 'Writing Partner',
  meta: [{ name: 'An AI-powered writing partner' }],
})

const { messages, input, handleSubmit } = useChat({
  headers: { 'Content-Type': 'application/json' },
})

/** Shared editor content between the user and the writing partner */
const editorContent = ref('')

const assistantIntermediateResponse = ref('')

/** A temporary store for the selected text from the text editor for custom questions */
const selectedTextForPrompt = ref('')
/** Session chat history between the user and the writing partner */
const chatHistory = reactive([{}])
/** Text-To-Speech Audio Player*/
const ttsAudio = ref({ player: {}, muted: false })
/** Speech-To-Text Recognizer */
const speechRecognizer = ref({})
/** Overlay for the voice interaction */
const overlay = ref(false)
/** Ref to check if voice is activated */
const voiceActive = ref(false)
/** Voice response from ChatGPT */
const voiceResponse = ref({ response: '', alreadyPlayed: false })

const texts = reactive({
  audioPlayer: {
    pause: 'Pause',
    play: 'Play',
  },
})

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
  if (selectedTextForPrompt.value !== '') {
    input.value = input.value.concat(selectedTextForPrompt.value)
    selectedTextForPrompt.value = ''
  }
  handleSubmit(e)
  playEnvelopeSignal()
  waitForAssistant().then(assistantResponse => {
    setResponse(assistantResponse)
  })
}

function submitSelected(event: Event, prompt: string) {
  const range = editor.getSelection().getRanges()[0]
  const selected_fragment = range.cloneContents()
  const selected_text = selected_fragment.$['textContent']
  // const selected = window.getSelection()
  if (prompt === 'STORE') {
    selectedTextForPrompt.value = selected_text
    let chatInput = document.getElementById('chat-input')
    chatInput.focus()
    return
  }
  if (selected_text === '') {
    playEnvelopeSignal()
    setResponse('No text selected. Please select some text and try again.')
    return
  } else if (prompt === 'READ') {
    voiceResponse.value.response = selected_text
    synthesizeSpeech(voiceResponse.value.response)
    voiceResponse.value.alreadyPlayed = true
    return
  }
  input.value = input.value.concat(prompt + selected_text)
  try {
    handleSubmit(event)
  } catch (e) {
    console.log(e)
  }
  playEnvelopeSignal()
  waitForAssistant().then(assistantResponse => {
    setResponse(assistantResponse)
  })
}

// TODO: Why do I need this when asking a question from the text editor to the assistant
// As the messages are not appendend to the chat history

/** Suggestion text box for the writing partner in the text editor
 * uses the editorContent for the shared state
 */
watch(messages, (_): void => {
  let message = messages.value[messages.value.length - 1]
  if (message.role === 'assistant') {
    if (assistantIntermediateResponse.value.includes('<p>Suggestion: ')) {
      assistantIntermediateResponse.value = message.content
      // chatHistory[chatHistory.length - 1].focus()
    } else {
      assistantIntermediateResponse.value = message.content
      // chatHistory[chatHistory.length - 1].focus()
    }
  }
})

async function sttFromMic() {
  const tokenObj = await getTokenOrRefresh()
  const speechConfig = speechsdk.SpeechConfig.fromAuthorizationToken(tokenObj.authToken, tokenObj.region)
  speechConfig.speechRecognitionLanguage = 'en-US'
  // Todo: Check additional effort to inlcude auto-detection of language
  const audioConfig = speechsdk.AudioConfig.fromDefaultMicrophoneInput()
  speechRecognizer.value = new speechsdk.SpeechRecognizer(speechConfig, audioConfig)
  speechRecognizer.value.startContinuousRecognitionAsync()

  voiceActive.value = true
  await playAudioSignal()

  speechRecognizer.value.recognizing = (_, e) => {
    console.log(`RECOGNIZING: Text=${e.result.text}`)
  }

  // Signals that the speech service has started to detect speech.
  speechRecognizer.value.speechStartDetected = (_, e) => {
    const str = '(speechStartDetected) SessionId: ' + e.sessionId
    console.log(str)
  }

  speechRecognizer.value.recognized = (_, e) => {
    if (e.result.reason == speechsdk.ResultReason.RecognizedSpeech) {
      console.log(`RECOGNIZED: Text=${e.result.text}`)
      input.value = input.value.concat(e.result.text)
      const eventTemp = new Event('submit')
      handleSubmit(eventTemp)
      playEnvelopeSignal()
      waitForAssistant().then(assistantResponse => {
        setResponse(assistantResponse)
      })
      speechRecognizer.value.stopContinuousRecognitionAsync()
    } else if (e.result.reason == speechsdk.ResultReason.NoMatch && e.result.text === '') {
      console.log('NOMATCH: Speech could not be recognized.')
      voiceResponse.value.response = 'I did not understand or hear you. Stopping recording of your microphone.'
      synthesizeSpeech(voiceResponse.value.response)
      voiceResponse.value.alreadyPlayed = true
      speechRecognizer.value.stopContinuousRecognitionAsync()
    }
  }

  speechRecognizer.value.canceled = (_, e) => {
    console.log(`CANCELED: Reason=${e.reason}`)
    if (e.reason == speechsdk.CancellationReason.Error) {
      console.log(`"CANCELED: ErrorCode=${e.errorCode}`)
      console.log(`"CANCELED: ErrorDetails=${e.errorDetails}`)
      console.log('CANCELED: Did you set the speech resource key and region values?')
    }
    speechRecognizer.value.stopContinuousRecognitionAsync()
  }

  speechRecognizer.value.sessionStopped = (s, e) => {
    console.log('\n    Session stopped event.')
    speechRecognizer.value.stopContinuousRecognitionAsync()
  }
}

async function waitForAssistant(): Promise<string> {
  // TODO: This can be improved if we change the server endpoint such that it sends the stream end event
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(
        messages.value[messages.value.length - 1].role === 'assistant'
          ? messages.value[messages.value.length - 1].content
          : 'No response from the assistant yet.'
      )
    }, 4000)
  })
}

async function synthesizeSpeech(textToSpeak: string) {
  const tokenObj = await getTokenOrRefresh()
  const speechConfig = speechsdk.SpeechConfig.fromAuthorizationToken(tokenObj.authToken, tokenObj.region)
  speechConfig.speechSynthesisLanguage = 'en-US'
  /** Leni & Jan für CH. Alle weiteren findet man hier: https://speech.microsoft.com/portal/voicegallery */
  speechConfig.speechSynthesisVoiceName = 'en-US-JennyNeural'
  ttsAudio.value.player = new speechsdk.SpeakerAudioDestination()
  const audioConfig = speechsdk.AudioConfig.fromSpeakerOutput(ttsAudio.value.player)
  let synthesizer = new speechsdk.SpeechSynthesizer(speechConfig, audioConfig)
  // Events are raised as the output audio data becomes available, which is faster than playback to an output device.
  // We must must appropriately synchronize streaming and real-time.
  synthesizer.speakTextAsync(
    textToSpeak,
    result => {
      let text
      if (result.reason === speechsdk.ResultReason.SynthesizingAudioCompleted) {
        text = `synthesis finished for "${textToSpeak}".\n`
        focusPauseButton()
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

  ttsAudio.value.player.onAudioEnd = () => {
    overlay.value = false
  }

  ttsAudio.value.player.onAudioStart = () => {
    overlay.value = true
    focusPauseButton()
    // TODO: Focus function breaks tts
    // let playPauseButton = document.getElementById('playPauseButton')
    // playPauseButton.focus()
  }
}

async function pause() {
  if (!ttsAudio.value.muted) {
    ttsAudio.value.player.pause()
    ttsAudio.value.muted = true
  } else {
    ttsAudio.value.player.resume()
    ttsAudio.value.muted = false
  }
}

async function stop() {
  ttsAudio.value.player.pause()
  // stopping the audio by setting currentTime of the internal media element to the media duration e.g. fast forwarding the track to the end.
  ttsAudio.value.player.internalAudio.currentTime = ttsAudio.value.player.internalAudio.duration
  ttsAudio.value.muted = false
  overlay.value = false
}

async function replayAudio() {
  overlay.value = true
  ttsAudio.value.player.pause()
  ttsAudio.value.player.resume()
}

let ckeditor: AsyncComponentLoader
let editor: any
if (process.client) {
  ckeditor = defineAsyncComponent(() => import('@mayasabha/ckeditor4-vue3').then(module => module.component))
}
const editorUrl = 'https://a11y-editor-proxy.fly.dev/ckeditor.js'

function onNamespaceLoaded() {
  CKEDITOR.on('instanceReady', function (ck) {
    // TODO: Decide whether these context items should be kept or be removed
    // ck.editor.removeMenuItem('cut')
    // ck.editor.removeMenuItem('copy')
    // ck.editor.removeMenuItem('paste')
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
        name: 'readAloud',
        label: 'Read Aloud',
        prompt: 'READ',
      },
      {
        name: 'reformulate',
        label: 'Formulate differently',
        prompt:
          'Reformulate the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'concise',
        label: 'Make more concise',
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
        name: 'giveWritingAdvice',
        label: 'Give scientific writing advice',
        prompt:
          'Give writing advice for the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'adaptToScientificStyle',
        label: 'Reformulate to scientific style',
        prompt:
          'Adapt to scientific style the following content and make it such that the response can immediately be added to a text editor Selection start marker:',
      },
      {
        name: 'askQuestion',
        label: 'Ask your custom question',
        prompt: 'STORE',
      },
    ]
    registerActions(editor, actions)
    removeFormElementRoles()
  })
}

function registerActions(editor, actions) {
  let contextMenuListener = {}
  actions.forEach(function (action) {
    editor.addMenuGroup('aiSuggestions')
    editor.addCommand(action.name, {
      exec: function (editor) {
        const eventTemp = new Event('submit')
        submitSelected(eventTemp, action.prompt)
      },
    })
    editor.addMenuItem(action.name, {
      label: action.label,
      command: action.name,
      group: 'aiSuggestions',
    })
    contextMenuListener[action.name] = CKEDITOR.TRISTATE_OFF
  })
  editor.contextMenu.addListener(function (element) {
    return contextMenuListener
  })
}

function removeFormElementRoles() {
  nextTick()
  // Wait until the editor is loaded and remove form elements which overwhelm the screen reader user
  document.querySelectorAll('span > a').forEach(b => b.removeAttribute('role'))
  observeCKEditorPathAndRemoveDynamicFormElements()
}
function observeCKEditorPathAndRemoveDynamicFormElements() {
  // Select the node that will be observed for mutations
  const targetNode = document.getElementById('cke_1_path')
  if (!targetNode) {
    //The node we need does not exist yet.
    //Wait 500ms and try again
    window.setTimeout(observeCKEditorPathAndRemoveDynamicFormElements, 500)
    return
  }

  // Options for the observer (which mutations to observe)
  const config = { attributes: true, childList: true, subtree: true }

  // Callback function to execute when mutations are observed
  const callback = (mutationList, observer) => {
    for (const mutation of mutationList) {
      if (mutation.type === 'childList') {
        document.querySelectorAll('span > a').forEach(b => b.removeAttribute('role'))
      }
    }
  }

  // Create an observer instance linked to the callback function
  const observer = new MutationObserver(callback)

  // Start observing the target node for configured mutations
  observer.observe(targetNode, config)
}

function setResponse(response: string) {
  voiceResponse.value.response = response
  voiceResponse.value.alreadyPlayed = false
  if (editorContent.value.includes('<p>Suggestion:')) {
    editorContent.value = editorContent.value.replace(
      /<p>Suggestion:.*/,
      `<p>Suggestion: ${assistantIntermediateResponse.value}`
    )
    // chatHistory[chatHistory.length - 1].focus()
  } else {
    editorContent.value = editorContent.value.concat(`<p>Suggestion: ${assistantIntermediateResponse.value}</p>`)
  }
  assistantIntermediateResponse.value = ''
}

async function playResponse() {
  if (voiceResponse.value.alreadyPlayed) {
    overlay.value = true
    replayAudio()
    focusPauseButton()
    return
  }
  if (voiceResponse.value.response === '') {
    voiceResponse.value.response = 'No response from the assistant yet.'
    synthesizeSpeech(voiceResponse.value.response)
    voiceResponse.value.alreadyPlayed = true
    return
  }
  synthesizeSpeech(voiceResponse.value.response)
  overlay.value = true
  voiceResponse.value.alreadyPlayed = true
  focusPauseButton()
  voiceActive.value = true
}

async function focusPauseButton() {
  await nextTick()
  // nextTick() to update DOM and show Overlay before focusing on the pause button
  let playPauseButton = document.getElementById('playPauseButton')
  playPauseButton.focus()
}

async function playAudioSignal() {
  //create a synth and connect it to the main output (your speakers)
  //play a middle 'C' for the duration of an 8th note
  // delay signal tone as synthesizer needs some time to start
  window.setTimeout(() => {
    const synth = new Tone.Synth().toDestination()
    synth.triggerAttackRelease('C4', '8n')
  }, 2000)
}
function playEnvelopeSignal() {
  const env = new Tone.AmplitudeEnvelope({
    attack: 0.11,
    decay: 0.21,
    sustain: 0.5,
    release: 1.2,
  }).toDestination()

  // create an oscillator and connect it to the envelope
  const osc = new Tone.Oscillator({
    partials: [3, 2, 1],
    type: 'custom',
    frequency: 'C#4',
    volume: -8,
  })
    .connect(env)
    .start()

  setTimeout(() => {
    env.triggerAttackRelease(0.3)
  }, 2000)
}

function repeatLastQuestion() {
  // TODO: Improve the condition logic here, when there is time left
  if (messages.value[messages.value.length - 1].role === 'user') {
    input.value = messages.value[messages.value.length - 1].content
  } else if (messages.value[messages.value.length - 2].role === 'user') {
    input.value = messages.value[messages.value.length - 2].content
  } else if (messages.value[messages.value.length - 3].role === 'user') {
    input.value = messages.value[messages.value.length - 3].content
  } else {
    input.value = messages.value[messages.value.length - 4].content
  }
  const eventTemp = new Event('submit')
  handleSubmit(eventTemp)
  playEnvelopeSignal()
  waitForAssistant().then(assistantResponse => {
    setResponse(assistantResponse)
  })
}
</script>

<template>
  <SiteHeader v-if="!overlay" />
  <v-container>
    <v-row>
      <v-col cols="3">
        <div class="card">
          <v-btn color="success" class="ma-4 no-uppercase" @click="sttFromMic" v-if="!overlay">
            Start talking to ChatGPT</v-btn
          >
          <v-btn color="primary" class="ma-4 no-uppercase" @click="playResponse" v-if="!overlay">
            Play ChatGPT response</v-btn
          >
          <v-overlay id="overlay" v-model="overlay" contained class="align-center justify-center" :persistent="true">
            <v-btn
              id="playPauseButton"
              class="mx-4"
              :color="ttsAudio.muted === false ? 'primary' : 'success'"
              @click="pause()"
            >
              {{ ttsAudio.muted ? texts.audioPlayer.play : texts.audioPlayer.pause }}
            </v-btn>
            <v-btn class="mx-4" color="error" @click="stop()"> stop </v-btn>
          </v-overlay>
          <h1 class="card-title" v-if="!overlay">Chat</h1>
          <div class="card-text" v-if="!overlay">
            <div class="chat">
              <div
                v-for="(m, i) in messages"
                :index="i"
                key="m.id"
                class="chat-message"
                :ref="el => updateRefs(el, i)"
                tabindex="-1"
              >
                <h3>
                  {{ m.role === 'user' ? 'User ' : 'Assistant ' }}
                  {{ m.content }}
                </h3>
              </div>
              <v-btn color="primary" class="ma-4 no-uppercase" @click="repeatLastQuestion" v-if="!overlay">
                Repeat last question</v-btn
              >
              <form @submit="submit">
                <div>
                  <input
                    id="chat-input"
                    class="chat-input"
                    autocomplete="off"
                    v-model="input"
                    placeholder="Send a message"
                    aria-label="Enter your prompt to ChatGPT"
                  />
                </div>
              </form>
            </div>
          </div>
        </div>
      </v-col>
      <v-col cols="8">
        <div class="card" v-if="!overlay">
          <h1 class="card-title">Editor</h1>
          <div class="card-text">
            <client-only>
              <div>
                <ckeditor
                  id="text-editor"
                  :editor-url="editorUrl"
                  v-model="editorContent"
                  @namespaceloaded="onNamespaceLoaded"
                ></ckeditor>
              </div>
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
  font-size: smaller;
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
  font-size: smaller;
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
.no-uppercase {
  text-transform: unset !important;
}
</style>
