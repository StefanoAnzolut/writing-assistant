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
import { pause } from './composables/audio-player'

useHead({
  title: 'Writing Partner',
  meta: [{ name: 'An AI-powered writing partner' }],
})

const { messages, input, handleSubmit } = useChat({
  headers: { 'Content-Type': 'application/json' },
})

// Maybe useCompletion might be interesting in the future

/** Session chat history between the user and the writing partner */
const chatHistory: ChatHistory = reactive({ messages: [] as ChatMessage[] })

/** Shared editor content between the user and the writing partner */
const editorContent = ref('')
/** A temporary store for the selected text from the text editor for custom questions */
const selectedTextForPrompt = ref('')
/** The html code that is retrieved from the ChatGPT response */
const htmlCode = ref('')

/** Voice response from ChatGPT */
const voiceResponse = ref('')
/** The reference to see whether we have reached the end of a streaming response from ChatGPT */
const responseFinished = ref(false)
const voiceSynthesisOnce = ref(false)
/** The selected speaker */
const selectedSpeaker = ref('Jenny')
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
  responseFinished.value = isFinished(latestMessage.content)
  latestMessage.content = latestMessage.content.replace('2:"[{\\"done\\":true}]"', '')
  return latestMessage
}

function isFinished(message: string) {
  return message.includes('2:"[{\\"done\\":true}]"')
}

function addPrefix(messages, latestMessage) {
  return messages.value[messages.value.length - 1].role === 'user'
    ? `Prompt ${messages.value.length} ${latestMessage.content}`
    : `Answer ${messages.value.length} ${latestMessage.content}`
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
        content: addPrefix(messages, latestMessage),
        new: true,
      },
      audioPlayer: { player: new speechsdk.SpeakerAudioDestination(), muted: true, alreadyPlayed: false },
    } as ChatMessage)
  }
  let entry = chatHistory.messages[chatHistory.messages.length - 1]
  if (messages.value[messages.value.length - 1].role === 'user') {
    synthesizeSpeech(entry.message.content, getLastUserResponseIndex())
    return
  }
  checkHTMLInResponse(addPrefix(messages, latestMessage))
  if (entry.message.content.length > 25 && entry.message.new === true) {
    entry.message.new = false
    addToVoiceResponse(entry.message.content)
    synthesizeSpeech(entry.message.content, getLastAssistantResponseIndex())
  }
})
watch(responseFinished, (_): void => {
  if (responseFinished.value) {
    // final run to finish the voice synthesis
    clearInterval(intervalId.value)
    responseFinished.value = false
    voiceSynthesisOnce.value = false
    let message = chatHistory.messages[chatHistory.messages.length - 1].message
    if (!voiceResponse.value.includes(message.content)) {
      addToVoiceResponse(chatHistory.messages[chatHistory.messages.length - 1].message.content)
      synthesizeSpeech(voiceResponse.value, getLastAssistantResponseIndex())
      focusPauseButton()
      return
    }
  }
})

function checkHTMLInResponse(assistantResponse: string) {
  if (
    assistantResponse.includes('```html') ||
    assistantResponse.includes(
      '[ HTML code placeholder - use the paste button to add the HTML template to the text editor ] .'
    )
  ) {
    const expression = /```html([\s\S]*?)```/
    const match = assistantResponse.match(expression)
    if (match && match[1]) {
      htmlCode.value = match[1]
    }
    const parts = assistantResponse.split(expression)
    if (parts.length === 1) {
      setResponse(assistantResponse)
    } else {
      parts[1] = parts[1].replace(
        match[1],
        '[ HTML code placeholder - use the paste button to add the HTML template to the text editor ] .'
      )
    }
    const textWithoutHtml = parts.join('')
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
  }, 400)

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
  speechRecognizer.value.sessionStarted = (s, e) => {
    console.log('\n    Session started event.')
  }
}

async function waitForAssistant(): Promise<string> {
  return new Promise((resolve, _) => {
    setTimeout(() => {
      resolve(getLastAssistantResponse())
    }, 5500)
  })
}

function addToVoiceResponse(assistantResponse: string) {
  voiceResponse.value = assistantResponse
}

function paste(index: number) {
  let assistantResponse = chatHistory.messages[index].message.content
  if (
    assistantResponse.includes(
      '[ HTML code placeholder - use the paste button to add the HTML template to the text editor ] .'
    )
  ) {
    editorContent.value = editorContent.value.concat(htmlCode.value)
    return
  }
  if (editorContent.value !== '') {
    editorContent.value = editorContent.value.concat('<br/>')
  }
  // Special case where html is not identified correctly
  if (assistantResponse.toLowerCase().includes('html')) {
    editorContent.value = editorContent.value.concat(assistantResponse)
    return
  }
  const matchPrefix = assistantResponse.match(/Answer (\d+) ([\s\S]*)/)
  const paragraphs = matchPrefix[2].split('\n')
  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      continue
    }
    editorContent.value = editorContent.value.concat(`<p>${paragraph}</p>`)
  }
}

function getLastAssistantResponse(): string {
  if (messages.value.length === 0) {
    return ''
  }
  let lastAssistantResponseIndex = getLastAssistantResponseIndex()
  let content = messages.value[lastAssistantResponseIndex].content
  if (content.includes(`Answer ${messages.value.length} ${content}`)) {
    return content
  } else {
    return `Answer ${messages.value.length} ${content}`
  }
}
function getLastAssistantResponseIndex(): number {
  if (messages.value.length === 0) {
    throw new Error('Cannot get index when there is no message!')
  }
  let lastAssistantResponseIndex = messages.value.length - 1
  while (messages.value[lastAssistantResponseIndex].role !== 'assistant' && lastAssistantResponseIndex > 0) {
    lastAssistantResponseIndex--
  }
  return lastAssistantResponseIndex
}
function getLastUserResponseIndex(): number {
  if (messages.value.length === 0) {
    throw new Error('Cannot get index when there is no message!')
  }
  let lastUserResponseIndex = messages.value.length - 1
  while (messages.value[lastUserResponseIndex].role !== 'user' && lastUserResponseIndex > 0) {
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
  /** Leni & Jan für CH. Alle weiteren findet man hier: https://speech.microsoft.com/portal/voicegallery */
  if (selectedSpeaker.value === 'Jenny' || selectedSpeaker.value === 'Andrew') {
    speechConfig.speechSynthesisLanguage = 'en-US'
    speechConfig.speechSynthesisVoiceName = `en-US-${selectedSpeaker.value}Neural`
  } else {
    speechConfig.speechSynthesisLanguage = 'en-GB'
    speechConfig.speechSynthesisVoiceName = `en-GB-${selectedSpeaker.value}Neural`
  }
  let newAudioPlayer = {
    player: new speechsdk.SpeakerAudioDestination(),
    muted: true,
    alreadyPlayed: false,
  }
  if (audioPlayerIndex !== -1) {
    let audioPlayer = getAudioPlayer(audioPlayerIndex)
    prevAudioPlayer.value = audioPlayer
    // audioPlayer.player.pause()
    audioPlayer = {
      player: new speechsdk.SpeakerAudioDestination(),
      muted: true,
      alreadyPlayed: false,
    }
    audioPlayer.player.onAudioEnd = audioPlayer => {
      audioPlayer.pause()
      chatHistory.messages[audioPlayerIndex].audioPlayer.muted = true
      chatHistory.messages[audioPlayerIndex].audioPlayer.alreadyPlayed = true
    }
    audioPlayer.player.onAudioStart = () => {
      prevAudioPlayer.value.player.pause()
      let currentTime = prevAudioPlayer.value.player.currentTime
      if (currentTime !== -1) {
        // round to 2 decimal places
        audioPlayer.player.internalAudio.currentTime = Math.round(currentTime * 100) / 100
      }
      chatHistory.messages[audioPlayerIndex].audioPlayer.muted = false
      focusPauseButton()
    }
    newAudioPlayer.player = audioPlayer.player
    chatHistory.messages[audioPlayerIndex].audioPlayer = newAudioPlayer
  }

  console.log('synthesizing text')
  const audioConfig = speechsdk.AudioConfig.fromSpeakerOutput(newAudioPlayer.player)
  let synthesizer = new speechsdk.SpeechSynthesizer(speechConfig, audioConfig)
  // Events are raised as the output audio data becomes available, which is faster than playback to an output device.
  // We must must appropriately synchronize streaming and real-time.
  synthesizer.speakTextAsync(
    textToSpeak,
    result => {
      let text
      if (result.reason === speechsdk.ResultReason.SynthesizingAudioCompleted) {
        if (chatHistory.messages[audioPlayerIndex].message.role === 'user') {
          chatHistory.messages[audioPlayerIndex].audioPlayer.player.pause()
          chatHistory.messages[audioPlayerIndex].audioPlayer.muted = true
        }
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
  chatHistory.messages[chatHistory.messages.length - 1].message.content = response
}

async function playResponse(index: number) {
  let message = chatHistory.messages[index].message
  if (!message.new && !voiceResponse.value.includes(message.content)) {
    addToVoiceResponse(message.content)
    // continue the voice synthesis only once, after that wait until end or response
    if (!voiceSynthesisOnce.value) {
      console.log('playedOnce response')
      synthesizeSpeech(voiceResponse.value, index)
      voiceSynthesisOnce.value = true
    }
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
  if (messages.value.length === 0) {
    return
  }
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
  <v-container>
    <v-row>
      <v-col cols="4">
        <div class="card">
          <!-- <v-select
            label="Select a speaker"
            density="compact"
            :items="['Jenny', 'Andrew', 'Sonia', 'Ryan']"
            v-model="selectedSpeaker"
            aria-label="Select a speaker"
          ></v-select> -->
          <h1 class="card-title">Chat</h1>
          <div class="card-text">
            <div class="chat">
              <form @submit="submit" class="d-flex input pb-2">
                <v-btn
                  icon="mdi-microphone"
                  color="primary"
                  class="no-uppercase mt-3 ml-1"
                  @click="sttFromMic"
                  aria-label="Start talking to ChatGPT"
                ></v-btn>
                <div class="flex-grow-1 mx-2">
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
              <div
                v-for="(entry, i) in chatHistory.messages"
                :index="i"
                key="m.id"
                class="chat-message"
                :class="chatHistory.messages[i].message.role === 'user' ? 'user-message' : 'assistant-message'"
                tabindex="-1"
              >
                <div class="chat-inner">
                  <h2 class="hide-prompt-heading" v-if="entry.message.role === 'user'">
                    {{ entry.message.content.substring(0, 30) }}
                  </h2>
                  <p class="h3-style" v-if="entry.message.role === 'user'">{{ entry.message.content }}</p>
                  <h3 v-if="entry.message.role === 'assistant'">
                    {{ entry.message.content }}
                  </h3>
                </div>
                <v-container class="d-flex flex-row justify-end">
                  <v-btn
                    :id="'playPauseButton' + i"
                    :icon="entry.audioPlayer.muted ? 'mdi-play' : 'mdi-pause'"
                    class="ma-1"
                    color="success"
                    @click="pause(entry.audioPlayer)"
                    :aria-label="entry.audioPlayer.muted ? 'Play' : 'Pause'"
                    size="small"
                  >
                  </v-btn>
                  <v-btn
                    :id="'addToChatEditor' + i"
                    icon="mdi-content-paste"
                    class="ma-1"
                    color="primary"
                    @click="paste(i)"
                    aria-label="Add to chat editor"
                    size="small"
                    v-if="entry.message.role === 'assistant'"
                  >
                  </v-btn>
                </v-container>
              </div>
              <!-- <v-btn color="primary" class="ma-4 no-uppercase" @click="repeatLastQuestion"> Repeat last question</v-btn> -->
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
.hide-prompt-heading {
  visibility: hidden;
}
.h3-style {
  font-size: 1.17em;
  margin-block-start: -0.83em;
  margin-inline-start: 0px;
  margin-inline-end: 0px;
  font-weight: bold;
}
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
  border-top: #ccced1 1px solid;
  display: block;
  margin-block-end: 0.5em;
  margin-inline-start: 0px;
  margin-inline-end: 0px;
  font-size: smaller;
}
.chat-inner {
  padding: 0.5rem;
}

.user-message {
  background-color: #ffe79f;
}
.assistant-message {
  background-color: #cf9fff;
}
.chat-input {
  padding: 0.5rem;
  margin-top: 0.75rem;
  border-radius: 0.25rem;
  border-width: 1px;
  border-color: #d1d5db;
  width: 100%;
  height: 48px;
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
