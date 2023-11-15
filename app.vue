<script setup lang="ts">
import { useChat, type Message } from 'ai/vue'
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

// Maybe useCompletion might be interesting in the future

/** The reference to see whether we have reached the end of a streaming response from ChatGPT */
const finishReason = ref(false)
/** Shared editor content between the user and the writing partner */
const editorContent = ref('')
/** The html code that is retrieved from the ChatGPT response */
const htmlCode = ref('')
/** Voice response from ChatGPT */
const voiceResponse = ref('')

/** A temporary store for the selected text from the text editor for custom questions */
const selectedTextForPrompt = ref('')
/** Session chat history between the user and the writing partner */
const chatHistory: ChatHistory = reactive({ messages: [] as ChatMessage[] })
/** Speech-To-Text Recognizer */
const speechRecognizer = ref({} as speechsdk.SpeechRecognizer)
/** Currently playing audio player to snatch currentTime */
const prevAudioPlayer = ref({} as AudioPlayer)
/** A global reference to de-allocated the periodic interval check to add new content when response is being streamed */
const intervalId = ref({} as NodeJS.Timeout)

/** Load and set editor from proxy file server,
 *  as there were several issues with providing static files via Nuxt.
 * TODO: Improve how the text editor is loaded */
const editorUrl = 'https://a11y-editor-proxy.fly.dev/ckeditor.js'
let ckeditor: AsyncComponentLoader
if (process.client) {
  ckeditor = defineAsyncComponent(() => import('@mayasabha/ckeditor4-vue3').then(module => module.component))
}
function onNamespaceLoaded() {
  CKEDITOR.on('instanceReady', function (ck: { editor: any }) {
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
    playResponse(getLastAssistantResponseIndex())
  })
}

/** Submission wrapper for the callback action of the context menu */
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
    playResponse(getLastAssistantResponseIndex())
  })
}

/** As we have modified the chat reponse to include the finish_reason to mark the end of the stream. We need to have some pre-processing. */
function preprocessLastMessage(latestMessage: Message): Message {
  finishReason.value = isFinished(latestMessage.content)
  latestMessage.content = latestMessage.content
    .replaceAll('0:', '')
    .replaceAll('\\n', '')
    .replaceAll('\n', '')
    .replaceAll('"', '')
    .replace('2:[{\\finish_reason\\:\\stop\\}]', '')
    .replaceAll('\\n\\t', '')
  return latestMessage
}

function isFinished(message: string) {
  return message.includes('2:[{\\finish_reason\\:\\stop\\}]')
}

// TODO: Why do I need this when asking a question from the text editor to the assistant
// As the messages are not appendend to the chat history

/** Suggestion text box for the writing partner in the text editor
 * uses the editorContent for the shared state
 */
watch(messages, (_): void => {
  let latestMessage = messages.value[messages.value.length - 1]
  if (latestMessage.role === 'assistant') {
    latestMessage = preprocessLastMessage(latestMessage)
  }
  if (chatHistory.messages.length < messages.value.length) {
    chatHistory.messages.push({
      message: {
        id: Date.now().toString(),
        role: messages.value[messages.value.length - 1].role,
        content: latestMessage.content,
        new: true,
      },
      audioPlayer: { player: new speechsdk.SpeakerAudioDestination(), muted: false, alreadyPlayed: false },
    } as ChatMessage)
  }
  let entry = chatHistory.messages[chatHistory.messages.length - 1]
  if (messages.value[messages.value.length - 1].role === 'assistant') {
    checkHTMLInResponse(messages.value[messages.value.length - 1].content)
    if (entry.message.content.length > 25 && entry.message.new === true) {
      entry.message.new = false
      voiceResponse.value = entry.message.content
      synthesizeSpeech(entry.message.content, getLastAssistantResponseIndex())
    }
  }
})

function checkHTMLInResponse(assistantResponse: string) {
  if (
    assistantResponse.includes('```html') ||
    assistantResponse.includes('[HTML CODE PLACEHOLDER - PASTE BUTTON TO ADD HTML TO TEXT EDITOR]')
  ) {
    const expression = /```html([\s\S]*?)```/
    const match = assistantResponse.match(expression)
    if (match && match[1]) {
      htmlCode.value = match[1]
    }
    const parts = assistantResponse.split(expression)
    console.log(parts)
    const textWithoutHtml = parts.join('[HTML CODE PLACEHOLDER - PASTE BUTTON TO ADD HTML TO TEXT EDITOR].')
    setResponse(textWithoutHtml)
  } else {
    setResponse(assistantResponse)
  }
}

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
  intervalId.value = setInterval(checkLastAssistantResponse, 15000)
  return new Promise((resolve, _) => {
    setTimeout(() => {
      resolve(getLastAssistantResponse())
    }, 5500)
  })
}

function checkLastAssistantResponse() {
  if (finishReason.value) {
    clearInterval(intervalId.value)
    finishReason.value = false
    return
  }
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
  if (!voiceResponse.value.includes(message.content)) {
    addToVoiceResponse(message.content)
    synthesizeSpeech(voiceResponse.value, getLastAssistantResponseIndex())
    focusPauseButton()
  }
}

function addToVoiceResponse(assistantResponse: string) {
  voiceResponse.value = assistantResponse
}

function addToChatEditor(index: number) {
  let assistantResponse = chatHistory.messages[index].message.content
  console.log('PASTING')
  console.log(assistantResponse.includes('[HTML CODE PLACEHOLDER - PASTE BUTTON TO ADD HTML TO TEXT EDITOR]'))
  if (assistantResponse.includes('[HTML CODE PLACEHOLDER - PASTE BUTTON TO ADD HTML TO TEXT EDITOR]')) {
    console.log(htmlCode.value)
    editorContent.value = editorContent.value.concat(htmlCode.value)
    return
  }
  editorContent.value = editorContent.value.concat(`<br/> ${assistantResponse}`)
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
    alreadyPlayed: false,
  }
  if (audioPlayerIndex !== -1) {
    let audioPlayer = getAudioPlayer(audioPlayerIndex)
    prevAudioPlayer.value = audioPlayer
    // audioPlayer.player.pause()
    audioPlayer = {
      player: new speechsdk.SpeakerAudioDestination(),
      muted: false,
      alreadyPlayed: false,
    }
    audioPlayer.player.onAudioEnd = audioPlayer => {
      audioPlayer.pause()
      chatHistory.messages[audioPlayerIndex].audioPlayer.muted = true
      chatHistory.messages[audioPlayerIndex].audioPlayer.alreadyPlayed = true
    }
    audioPlayer.player.onAudioStart = () => {
      let currentTime = prevAudioPlayer.value.player.currentTime
      if (currentTime !== -1) {
        // round to 2 decimal places
        audioPlayer.player.internalAudio.currentTime = Math.round(currentTime * 100) / 100
        prevAudioPlayer.value.player.pause()
      }
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
  if (response.includes('```html')) {
    const expression = /```html([\s\S]*?)```/
    const match = response.match(expression)
    if (match && match[1]) {
      console.log(response)
      console.log(match[1])
      htmlCode.value = match[1]

      const parts = response.split(expression)
      console.log(parts)

      chatHistory.messages[chatHistory.messages.length - 1].message.content.replace(
        match[1],
        '[HTML CODE PLACEHOLDER - PASTE BUTTON TO ADD HTML TO TEXT EDITOR].'
      )
    }
    // chatHistory.messages[chatHistory.messages.length - 1].message.content = textWithoutHtml
  } else {
    chatHistory.messages[chatHistory.messages.length - 1].message.content = response
  }
}

async function playResponse(index: number) {
  let audioPlayer = getAudioPlayer(index)
  if (audioPlayer.alreadyPlayed) {
    replayAudio(audioPlayer)
    focusPauseButton()
    return
  }
  let message = chatHistory.messages[index].message
  if (!message.new && !voiceResponse.value.includes(message.content)) {
    // continue the voice synthesis
    addToVoiceResponse(message.content)
    synthesizeSpeech(voiceResponse.value, index)
    focusPauseButton()
  }

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
                <v-container class="align-center d-flex" v-if="entry.message.role === 'assistant'">
                  <v-btn
                    :id="'addToChatEditor' + i"
                    icon="mdi-content-paste"
                    class="chat-button"
                    color="primary"
                    @click="addToChatEditor(i)"
                    aria-label="Add to chat editor"
                    size="small"
                  >
                  </v-btn>
                </v-container>
                <h3>
                  {{ entry.message.content }}
                </h3>
                <v-container class="d-flex align-center" v-if="entry.message.role === 'assistant'">
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
                </v-container>
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
