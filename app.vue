<script setup lang="ts">
import { useChat, type Message } from 'ai/vue'
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

// onMounted(() => {
//   console.log('mounted!')
//   // document.body.style.backgroundColor = '#36454F'
// })
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

/** Speech-To-Text Recognizer */
const speechRecognizer = ref({} as speechsdk.SpeechRecognizer)

/** The reference to see whether we have reached the end of a streaming response from ChatGPT */
const responseFinished = ref(false)
/** A global reference to de-allocated the periodic interval check to add new content when response is being streamed */
const intervalId = ref({} as NodeJS.Timeout)

/** The selected speaker for Text-To-Speech */
const selectedSpeaker = ref('Jenny')
const voiceSynthesisOnce = ref(false)
const voiceSynthesisStartOver = ref(false)

/** Voice response from ChatGPT */
const voiceResponse = ref('')

/** Currently playing audio player to snatch currentTime */
const prevAudioPlayer = ref({} as AudioPlayer)
/** Read aloud audio player and it's overlay flag */
const readAloudAudioPlayer = ref({} as AudioPlayer)
const showReadAloudAudioPlayer = ref({ show: false })

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
    synthesizeSpeech(selectedText, -2)
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
function preprocessMessage(message: Message): Message {
  responseFinished.value = isFinished(message.content)
  message.content = message.content.replace('2:"[{\\"done\\":true}]"', '')
  return message
}

function isFinished(message: string) {
  return message.includes('2:"[{\\"done\\":true}]"')
}

function addPrefixToContent(index, latestMessage) {
  return latestMessage.role === 'user'
    ? `Prompt ${index} ${latestMessage.content}`
    : `Answer ${index} ${latestMessage.content}`
}

function addToChatHistory(message: Message) {
  chatHistory.messages.push({
    message: {
      id: Date.now().toString(),
      role: message.role,
      content: addPrefixToContent(chatHistory.messages.length + 1, message),
      new: true,
    },
    audioPlayer: { player: new speechsdk.SpeakerAudioDestination(), muted: true, alreadyPlayed: false },
  } as ChatMessage)
}

function isLastMessageUser() {
  return messages.value[messages.value.length - 1].role === 'user'
}

function getLastEntry() {
  return chatHistory.messages[getLastEntryIndex()]
}

function getLastEntryIndex() {
  return chatHistory.messages.length - 1
}

function getChatHistoryLength() {
  return chatHistory.messages.length
}

// TODO: Why do I need this when asking a question from the text editor to the assistant
// As the messages are not appendend to the chat history

/** Suggestion text box for the writing partner in the text editor
 * uses the editorContent for the shared state
 */
watch(messages, (_): void => {
  let message = messages.value[messages.value.length - 1]
  if (message.role === 'assistant') {
    message = preprocessMessage(message)
  }
  if (chatHistory.messages.length < messages.value.length) {
    addToChatHistory(message)
  }
  let entry = getLastEntry()
  if (entry.message.role === 'user') {
    synthesizeSpeech(entry.message.content, getLastEntryIndex())
    setTimeout(() => {
      if (isLastMessageUser()) {
        console.log('Last message', messages.value[messages.value.length - 1])
        let newMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: 'Generating a structure for you, hold on. This might take a few seconds.',
        }
        addToChatHistory(newMessage)
        synthesizeSpeech(newMessage.content, getLastEntryIndex())
        voiceSynthesisOnce.value = true
        let tempEntry = getLastEntry()
        tempEntry.message.new = false
      }
      focusPauseButton()
      setTimeout(() => {
        if (
          getLastEntry().message.content === 'Generating a structure for you, hold on. This might take a few seconds.'
        ) {
          synthesizeSpeech('Still generating a response', getLastEntryIndex())
        }
      }, 3000)
    }, 2000)
    return
  }
  checkHTMLInResponse(addPrefixToContent(getChatHistoryLength(), message))
  if (entry.message.content.length > 25 && entry.message.new === true) {
    entry.message.new = false
    if (entry.message.content.includes('<ai-response>') || entry.message.content.includes('<body>')) {
      return
    }
    addToVoiceResponse(entry.message.content)
    synthesizeSpeech(entry.message.content, getLastAssistantResponseIndex())
    voiceSynthesisOnce.value = true
  }
})
watch(responseFinished, (_): void => {
  if (responseFinished.value) {
    // final run to finish the voice synthesis
    clearInterval(intervalId.value)
    responseFinished.value = false
    voiceSynthesisOnce.value = false
    let message = chatHistory.messages[chatHistory.messages.length - 1].message
    checkHTMLInResponse(message.content)
    if (!voiceResponse.value.includes(message.content)) {
      if (message.content.includes('<ai-response>') || message.content.includes('<body>')) {
        return
      }
      addToVoiceResponse(chatHistory.messages[chatHistory.messages.length - 1].message.content)
      voiceSynthesisStartOver.value = true
      synthesizeSpeech(voiceResponse.value, getLastAssistantResponseIndex())
      focusPauseButton()
      return
    }
  }
})

function replaceExpression(assistantResponse: string, expression: RegExp) {
  // const expression = /<ai-response>([\s\S]*?)<\/ai-response>/
  const match = assistantResponse.match(expression)
  if (match && match[1]) {
    htmlCode.value = match[1]
  }
  const parts = assistantResponse.split(expression)
  if (parts.length === 1) {
    // Special case, where assistant response tag is included in response but the regex does not match
    setResponse(assistantResponse)
  } else {
    parts[1] = parts[1].replace(
      match[1],
      '[ Here is how a structure would look like. The structure has been extracted from the answer - use the paste button to add the structure to the text editor. It will be added at the end of the text editor.  ] .'
    )
  }
  const textWithoutHtml = parts.join('')
  setResponse(textWithoutHtml)
}

function checkHTMLInResponse(assistantResponse: string) {
  if (assistantResponse.includes('<ai-response>')) {
    replaceExpression(assistantResponse, /<ai-response>([\s\S]*?)<\/ai-response>/)
  } else if (
    assistantResponse.includes('```html') ||
    assistantResponse.includes(
      '[ Here is how a structure would look like. The structure has been extracted from the answer - use the paste button to add the structure to the text editor. It will be added at the end of the text editor.  ] .'
    )
  ) {
    replaceExpression(assistantResponse, /```html([\s\S]*?)```/)
  } else if (assistantResponse.includes('<body>')) {
    // Special case where html tags and ai-response tags are both missing
    replaceExpression(assistantResponse, /<body>([\s\S]*?)<\/body>/)
  } else {
    setResponse(assistantResponse)
  }
}

async function sttFromMic() {
  const tokenObj = await getTokenOrRefresh()
  const speechConfig = speechsdk.SpeechConfig.fromAuthorizationToken(tokenObj.authToken, tokenObj.region)
  speechConfig.speechRecognitionLanguage = 'en-US'
  // Speech_SegmentationSilenceTimeoutMs = 32
  // https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/propertyid?view=azure-node-latest
  speechConfig.setProperty(32, '3000')
  // Todo: Check additional effort to inlcude auto-detection of language
  const audioConfig = speechsdk.AudioConfig.fromDefaultMicrophoneInput()
  speechRecognizer.value = new speechsdk.SpeechRecognizer(speechConfig, audioConfig)
  speechRecognizer.value.startContinuousRecognitionAsync()

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
      env.triggerAttackRelease(0.2)
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
    const synth = new Tone.Synth().toDestination()
    synth.triggerAttackRelease('C4', '8n')
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
  synthesizeSpeech('Pasted to the text editor and inserted at the end', -1)
  let assistantResponse = chatHistory.messages[index].message.content
  if (
    assistantResponse.includes(
      '[ Here is how a structure would look like. The structure has been extracted from the answer - use the paste button to add the structure to the text editor. It will be added at the end of the text editor.  ] .'
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

async function focusReadAloudPauseButton() {
  await nextTick()
  let playPauseButtonReadAloudId = document.getElementById('playPauseButtonReadAloud')
  console.log(playPauseButtonReadAloudId)
  if (playPauseButtonReadAloudId !== null) {
    playPauseButtonReadAloudId.focus()
  }
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
  if (audioPlayerIndex !== -1 && audioPlayerIndex !== -2) {
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
      if (currentTime !== -1 && !voiceSynthesisStartOver.value) {
        // round to 2 decimal places
        audioPlayer.player.internalAudio.currentTime = Math.round(currentTime * 100) / 100
      }
      if (voiceSynthesisStartOver.value) {
        voiceSynthesisStartOver.value = false
      }
      chatHistory.messages[audioPlayerIndex].audioPlayer.muted = false
      focusPauseButton()
    }
    newAudioPlayer.player = audioPlayer.player
    chatHistory.messages[audioPlayerIndex].audioPlayer = newAudioPlayer
  } else if (audioPlayerIndex === -2) {
    let audioPlayer = {
      player: new speechsdk.SpeakerAudioDestination(),
      muted: true,
      alreadyPlayed: false,
    }
    audioPlayer.player.onAudioEnd = audioPlayer => {
      audioPlayer.pause()
      readAloudAudioPlayer.value.muted = true
      readAloudAudioPlayer.value.alreadyPlayed = true
      showReadAloudAudioPlayer.value.show = false
    }
    audioPlayer.player.onAudioStart = () => {
      readAloudAudioPlayer.value.muted = false
    }
    newAudioPlayer.player = audioPlayer.player
    readAloudAudioPlayer.value = newAudioPlayer
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
        if (
          audioPlayerIndex !== -1 &&
          audioPlayerIndex !== -2 &&
          chatHistory.messages[audioPlayerIndex].message.role === 'user'
        ) {
          chatHistory.messages[audioPlayerIndex].audioPlayer.player.pause()
          chatHistory.messages[audioPlayerIndex].audioPlayer.muted = true
        }
        if (audioPlayerIndex === -2) {
          showReadAloudAudioPlayer.value.show = true
          focusReadAloudPauseButton()
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
      if (message.content.includes('<ai-response>') || message.content.includes('<body>')) {
        return
      }
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
          <v-btn
            id="playPauseButtonReadAloud"
            :icon="readAloudAudioPlayer.muted ? 'mdi-play' : 'mdi-pause'"
            class="ma-1"
            :color="readAloudAudioPlayer.muted ? 'success' : 'error'"
            v-if="showReadAloudAudioPlayer.show"
            :aria-label="readAloudAudioPlayer.muted ? 'Play' : 'Pause'"
            @click="pause(readAloudAudioPlayer)"
          ></v-btn>
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
