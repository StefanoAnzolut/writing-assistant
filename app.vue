<script setup lang="ts">
import { useChat } from 'ai/vue'
import SiteHeader from './components/SiteHeader.vue'
import { getTokenOrRefresh } from './utils/token_util'
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk'
import type { AsyncComponentLoader } from 'vue'
import * as Tone from 'tone'
import type { ChatHistory } from './models/ChatHistory'
import { removeFormElementRoles } from './utils/CKEditor'
import type { AudioPlayer } from './models/AudioPlayer'
import type { ChatMessage } from './models/ChatMessage'
import { pause, stop, replayAudio } from './composables/audio-player'

useHead({
  title: 'Writing Partner',
  meta: [{ name: 'An AI-powered writing partner' }],
})

const { messages, input, handleSubmit } = useChat({
  headers: { 'Content-Type': 'application/json' },
})

/** Shared editor content between the user and the writing partner */
const editorContent = ref('')

/** Voice response from ChatGPT */
const voiceResponse = ref('')

/** A temporary store for the selected text from the text editor for custom questions */
const selectedTextForPrompt = ref('')
/** Session chat history between the user and the writing partner */
const chatHistory: ChatHistory = reactive({ messages: [] as ChatMessage[] })
/** Speech-To-Text Recognizer */
const speechRecognizer = ref({} as speechsdk.SpeechRecognizer)

const newMessage = ref(true)

const currentTime = ref(-1)

/** Load and set editor from proxy file server,
 *  as there were several issues with providing static files via Nuxt.
 * TODO: Improve how the text editor is loaded */
const editorUrl = 'https://a11y-editor-proxy.fly.dev/ckeditor.js'
let ckeditor: AsyncComponentLoader
if (process.client) {
  ckeditor = defineAsyncComponent(() => import('@mayasabha/ckeditor4-vue3').then(module => module.component))
}
function onNamespaceLoaded() {
  CKEDITOR.on('instanceReady', function (ck) {
    registerActions(ck.editor, submitSelectedCallback)
    removeFormElementRoles()
  })
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
  waitForAssistant().then(assistantResponse => {
    setResponse(assistantResponse)
    addToVoiceResponse(assistantResponse)
    addToChatEditor(assistantResponse)
    playResponse(getLastAssistantResponseIndex())
  })
}

var startTime, endTime

function start() {
  startTime = new Date()
}

function end() {
  endTime = new Date()
  var timeDiff = endTime - startTime //in ms
  // strip the ms
  timeDiff /= 1000

  // get seconds
  var seconds = Math.round(timeDiff)
  console.log(seconds + ' seconds')
}

function submitSelectedCallback(event: Event, prompt: string, selectedText: string) {
  // const selected = window.getSelection()
  if (prompt === 'STORE') {
    selectedTextForPrompt.value = selectedText
    const chatInput = document.getElementById('chat-input')
    if (chatInput) {
      chatInput.focus()
    }
    return
  }
  if (selectedText === '') {
    messages.value.push({
      id: Date.now().toString(),
      role: 'assistant',
      content: 'No text selected. Please select some text and try again.',
    })
    setResponse(messages.value[messages.value.length - 1].content)
    playResponse(getLastAssistantResponseIndex())
    return
  } else if (prompt === 'READ') {
    synthesizeSpeech(selectedText, -1)
    return
  }
  input.value = input.value.concat(prompt + selectedText)
  try {
    handleSubmit(event)
  } catch (e) {
    console.log(e)
  }
  waitForAssistant().then(assistantResponse => {
    setResponse(assistantResponse)
    addToVoiceResponse(assistantResponse)
    addToChatEditor(assistantResponse)
    playResponse(getLastAssistantResponseIndex())
  })
}

// TODO: Why do I need this when asking a question from the text editor to the assistant
// As the messages are not appendend to the chat history

/** Suggestion text box for the writing partner in the text editor
 * uses the editorContent for the shared state
 */
watch(messages, (_): void => {
  if (chatHistory.messages.length < messages.value.length) {
    chatHistory.messages.push({
      message: {
        id: Date.now().toString(),
        role: messages.value[messages.value.length - 1].role,
        content: messages.value[messages.value.length - 1].content,
      },
      audioPlayer: { player: new speechsdk.SpeakerAudioDestination(), muted: false, alreadyPlayed: false },
    } as ChatMessage)
    start()
  }
  let message = messages.value[messages.value.length - 1]
  if (message.role === 'assistant') {
    chatHistory.messages[chatHistory.messages.length - 1].message.content = message.content
  }
  if (message.content.length > 50 && newMessage.value === true) {
    newMessage.value = false
    voiceResponse.value = message.content
    synthesizeSpeech(message.content, -1)
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
  // delay signal tone as synthesizer needs some time to start
  window.setTimeout(() => {
    const synth = new Tone.Synth().toDestination()
    synth.triggerAttackRelease('C4', '8n')
  }, 2000)

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
      waitForAssistant().then(assistantResponse => {
        setResponse(assistantResponse)
        addToChatEditor(assistantResponse)
        playResponse(getLastAssistantResponseIndex())
      })
      speechRecognizer.value.stopContinuousRecognitionAsync()
    } else if (e.result.reason == speechsdk.ResultReason.NoMatch && e.result.text === '') {
      console.log('NOMATCH: Speech could not be recognized.')
      synthesizeSpeech('I did not understand or hear you. Stopping recording of your microphone.', -1)
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
  let intervalId = setInterval(checkLastAssistantResponse, 7000)
  await waitToClear(intervalId)
  return new Promise((resolve, _) => {
    setTimeout(() => {
      resolve(getLastAssistantResponse())
    }, 4000)
  })
}

async function waitToClear(intervalId: NodeJS.Timeout) {
  newMessage.value = true
  setTimeout(() => {
    clearInterval(intervalId)
  }, 30000)
  newMessage.value = false
}

function checkLastAssistantResponse() {
  if (messages.value.length === 0) {
    return
  }
  let message = messages.value[messages.value.length - 1]
  if (!message?.role) {
    return
  }
  if (message.role !== 'assistant') {
    return
  }
  if (!editorContent.value.includes(message.content)) {
    addToChatEditor(message.content)
  }
  if (!voiceResponse.value.includes(message.content)) {
    voiceResponse.value = message.content
    synthesizeSpeech(voiceResponse.value, getLastAssistantResponseIndex())
    focusPauseButton()
  }
}

function addToVoiceResponse(assistantResponse: string) {
  voiceResponse.value = assistantResponse
}

function addToChatEditor(assistantResponse: string) {
  if (editorContent.value.includes('<p>Suggestion:')) {
    editorContent.value = editorContent.value.replace(/<p>Suggestion:.*/, `<p>Suggestion: ${assistantResponse}`)
  } else {
    editorContent.value = editorContent.value.concat(`<p>Suggestion: ${assistantResponse}</p>`)
  }
}

function getLastAssistantResponse(): string {
  let lastAssistantResponseIndex = getLastAssistantResponseIndex()
  return messages.value[lastAssistantResponseIndex].content
}
function getLastAssistantResponseIndex(): number {
  let lastAssistantResponseIndex = messages.value.length - 1
  while (messages.value[lastAssistantResponseIndex].role !== 'assistant') {
    lastAssistantResponseIndex--
  }
  return lastAssistantResponseIndex
}
function getLastUserResponseIndex(): number {
  let lastUserResponseIndex = messages.value.length - 1
  while (messages.value[lastUserResponseIndex].role !== 'user') {
    lastUserResponseIndex--
  }
  return lastUserResponseIndex
}

function getAudioPlayer(index: number): AudioPlayer {
  return chatHistory.messages[index].audioPlayer
}

async function synthesizeSpeech(textToSpeak: string, audioPlayerIndex: number) {
  console.log('starting to synthesize')
  if (textToSpeak === '') {
    return
  }
  const tokenObj = await getTokenOrRefresh()
  const speechConfig = speechsdk.SpeechConfig.fromAuthorizationToken(tokenObj.authToken, tokenObj.region)
  speechConfig.speechSynthesisLanguage = 'en-US'
  /** Leni & Jan für CH. Alle weiteren findet man hier: https://speech.microsoft.com/portal/voicegallery */
  speechConfig.speechSynthesisVoiceName = 'en-US-JennyNeural'
  let newAudioPlayer = {
    player: new speechsdk.SpeakerAudioDestination(),
    muted: false,
    alreadyPlayed: true,
  }
  if (audioPlayerIndex !== -1) {
    let audioPlayer = getAudioPlayer(audioPlayerIndex)
    audioPlayer.player.pause()
    currentTime.value = audioPlayer.player.currentTime
    // TODO Figure out a good way to continue playing the audio from the last currentTime
    // set currentTime directly on speakerAudioDestination does not work
    audioPlayer = {
      player: new speechsdk.SpeakerAudioDestination(),
      muted: false,
      alreadyPlayed: true,
    }
    audioPlayer.player.onAudioEnd = audioPlayer => {
      audioPlayer.pause()
      chatHistory.messages[audioPlayerIndex].audioPlayer.muted = true
      chatHistory.messages[audioPlayerIndex].audioPlayer.alreadyPlayed = true
    }
    audioPlayer.player.onAudioStart = () => {
      if (currentTime.value !== -1) {
        audioPlayer.player.internalAudio.currentTime = currentTime.value
      }

      console.log(audioPlayer.player.internalAudio)
      // focusPauseButton()
    }
    newAudioPlayer.player = audioPlayer.player
    chatHistory.messages[audioPlayerIndex].audioPlayer = newAudioPlayer
  }

  const audioConfig = speechsdk.AudioConfig.fromSpeakerOutput(newAudioPlayer.player)
  let synthesizer = new speechsdk.SpeechSynthesizer(speechConfig, audioConfig)
  // Events are raised as the output audio data becomes available, which is faster than playback to an output device.
  // We must must appropriately synchronize streaming and real-time.
  synthesizer.speakTextAsync(
    textToSpeak,
    result => {
      let text
      if (result.reason === speechsdk.ResultReason.SynthesizingAudioCompleted) {
        text = `synthesis finished for "${textToSpeak}".\n`
        end()
        // focusPauseButton()
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

function setResponse(response: string) {
  chatHistory.messages[chatHistory.messages.length - 1].message.content = response
}

async function playResponse(index: number) {
  let audioPlayer = getAudioPlayer(index)
  if (audioPlayer.alreadyPlayed) {
    replayAudio(audioPlayer)
    focusPauseButton()
    return
  }
  synthesizeSpeech(voiceResponse.value, index)
  focusPauseButton()
}

async function focusPauseButton() {
  await nextTick()
  // nextTick() to update DOM and show Overlay before focusing on the pause button
  let playPauseButton = document.getElementById('playPauseButton' + getLastAssistantResponseIndex())
  if (playPauseButton) {
    playPauseButton.focus()
  }
}

function repeatLastQuestion() {
  let lastUserReponseIndex = getLastUserResponseIndex()
  input.value = messages.value[lastUserReponseIndex].content
  handleSubmit(new Event('submit'))
  waitForAssistant().then(assistantResponse => {
    setResponse(assistantResponse)
    addToVoiceResponse(assistantResponse)
    addToChatEditor(assistantResponse)
    playResponse(getLastAssistantResponseIndex())
  })
}
</script>

<template>
  <SiteHeader />
  <v-container>
    <v-row>
      <v-col cols="4">
        <div class="card">
          <v-btn color="success" class="ma-4 no-uppercase" @click="sttFromMic"> Start talking to ChatGPT</v-btn>
          <h1 class="card-title">Chat</h1>
          <div class="card-text">
            <div class="chat">
              <div v-for="(entry, i) in chatHistory.messages" :index="i" key="m.id" class="chat-message" tabindex="-1">
                <h3>
                  {{ entry.message.content }}
                </h3>
                <div v-if="entry.message.role === 'assistant'">
                  <v-btn
                    :id="'playPauseButton' + i"
                    :icon="entry.audioPlayer.muted ? 'mdi-play' : 'mdi-pause'"
                    class="chat-button"
                    color="primary"
                    @click="pause(entry.audioPlayer)"
                    :aria-label="entry.audioPlayer.muted ? 'Play' : 'Pause'"
                    size="small"
                  >
                  </v-btn>
                  <v-btn
                    :id="'stopButton' + i"
                    icon="mdi-stop"
                    class="chat-button"
                    color="error"
                    @click="stop(entry.audioPlayer)"
                    size="small"
                    aria-label="Stop"
                  ></v-btn>
                </div>
              </div>
              <v-btn color="primary" class="ma-4 no-uppercase" @click="repeatLastQuestion"> Repeat last question</v-btn>
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
        <div class="card">
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
.chat-button {
  display: block;
  margin-left: auto;
  margin-right: 0;
}
</style>
