<script setup lang="ts">
import { useChat, type Message } from 'ai/vue'
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk'
import * as Tone from 'tone'

import type { AsyncComponentLoader } from 'vue'
import type { ChatHistory } from '~/models/ChatHistory'
import type { AudioPlayer } from '~/models/AudioPlayer'
import type { ChatMessage } from '~/models/ChatMessage'
import type { Session } from '~/models/Session'

const thesaurus = await import('thesaurus')
const { messages, input, handleSubmit, setMessages } = useChat({
  headers: { 'Content-Type': 'application/json' },
})

onMounted(() => {
  sessions.value = JSON.parse(localStorage.getItem('sessions') || '[]')
  loadActiveSession()
  setInterval(() => {
    storeSession(getActiveSession())
  }, 60000) // every minute
  assignNewSpeechRecognizer()
  setInterval(() => {
    assignNewSpeechRecognizer()
  }, 590000) // every 9.8 minutes
  window.addEventListener('keydown', keyDownHandler)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', keyDownHandler)
})

/** LoadActiveSession */
const sessionLoading = ref(false)

/** Sidebar */
const drawer = ref(false)

/** Sessions */
const sessions = ref([{} as Session])
const activeSession = ref({ id: '', chatHistory: {} as ChatHistory, editorContent: '' } as Session)

/** Session chat history between the user and the writing partner */
const chatHistory: ChatHistory = reactive({ messages: [] as ChatMessage[] })
const messageInteractionCounter = ref(0)
const inputDisabled = ref(false)
const chatHistoryExpanded = ref(false)

/** Shared editor content between the user and the writing partner */
const editorContent = ref('')
/** A temporary store for the selected text from the text editor for custom questions and easier replacement */
const selectedText = ref('')
const selectedTextIntermediate = ref('')
const selectedTextProperties = ref({ startOffset: 0, endOffset: 0, context: '' } as any)
const selectedTextPropertiesSynonyms = ref({ startOffset: 0, endOffset: 0, context: '' } as any)
const lastContextMenuAction = ref('')
// const lastPastedContent = ref('')

/** The reference to see whether we have reached the end of a streaming response from ChatGPT */
const responseFinished = ref(false)
const intermediateAnswerSynthesisCounter = ref(0)
/** A global reference to de-allocated the periodic interval check to add new content when response is being streamed */
const intervalId = ref({} as NodeJS.Timeout)

/** SpeechRecognizer */
const speechRecognizer = ref({} as speechsdk.SpeechRecognizer)
const voiceSynthesisStartOver = ref(false)
const lastSynthesizedText = ref('')
const resynthesizeAudio = ref(false)
const resynthesizeAudioPlayerId = ref('')

/** Voice response from ChatGPT */
const voiceResponse = ref('')

/** Currently playing audio player to snatch currentTime */
const prevAudioPlayer = ref({} as AudioPlayer)
/** Read aloud audio player and it's overlay flag */
const readAloudAudioPlayer = ref({} as AudioPlayer)
const showReadAloudAudioPlayer = ref({ show: false })

/** AudioPlayer special indices  */
const directResponseIndex = -1
const readAloudPlayerIndex = -2
const invalidCurrentTime = -1

const HTML_EXTRACTION_PLACEHOLDER =
  'Generated a structured response. Expand it using the expand button and let it be read to you with play or paste it to the text editor directly.'

const PROMPT_TAKES_A_WHILE = "Understood, I'm processing your prompt, hold on. This might take a while."
const editor = ref({} as any)
const readOnly = ref(false)

/** Load editor configuration from a static file server
 *  as of right now (Nuxt 3) does not provide such a thing. */
const editorUrl = 'https://a11y-editor-proxy.fly.dev/ckeditor.js'
let ckeditor: AsyncComponentLoader
if (process.client) {
  ckeditor = defineAsyncComponent(() => import('@mayasabha/ckeditor4-vue3').then(module => module.component))
}
function onNamespaceLoaded() {
  CKEDITOR.on('instanceReady', function (ck: { editor: any }) {
    prepareCKEditor(ck.editor, submitSelectedCallback)
    editor.value = ck.editor
  })

  // Element is not yet available, so we need to wait a bit (150 ms should be enough but not for Firefox)
  window.navigator.userAgent.includes('Firefox') ? removeExtraComponents(700) : removeExtraComponents(350)
}

function removeExtraComponents(sleepTimer: number = 350) {
  setTimeout(() => {
    updateCKEditor(keyDownHandler)
  }, sleepTimer)
}

function clearEditorContent() {
  editorContent.value = ''
}

function toggleReadOnly(isReadOnly: boolean) {
  if (isReadOnly) {
    readOnly.value = false
    editor.value.setReadOnly(readOnly.value)
  } else {
    readOnly.value = true
    editor.value.setReadOnly(readOnly.value)
  }
  // Change the read-only state of the editor.
  // https://ckeditor.com/docs/ckeditor4/latest/api/CKEDITOR_editor.html#method-setReadOnly
}

function getActiveSession(): Session {
  if (sessions.value.length === 0) {
    activeSession.value = {
      id: Date.now().toString(),
      chatHistory: { messages: [] as ChatMessage[] },
      editorContent: '',
    }
    return activeSession.value
  }
  if (activeSession.value.id === '') {
    activeSession.value = sessions.value[sessions.value.length - 1]
    return activeSession.value
  }
  activeSession.value = {
    id: activeSession.value.id,
    chatHistory: { messages: chatHistory.messages },
    editorContent: editorContent.value,
  }
  return activeSession.value
}

function setActiveSession(id: string): void {
  storeSession(getActiveSession())
  activeSession.value = getSession(id)
  messageInteractionCounter.value = activeSession.value.chatHistory.messages.filter(
    message => message.message.role === 'user'
  ).length
  chatHistory.messages = activeSession.value.chatHistory.messages
  setMessages(chatHistory.messages.map(message => message.message))
  editorContent.value = activeSession.value.editorContent
  sessionLoading.value = true
  showDrawer(false)
}

function getSession(id: string): Session {
  let session = sessions.value.find(session => session.id === id)
  if (session) {
    chatHistory.messages = session.chatHistory.messages
    editorContent.value = session.editorContent
    return session
  }
  throw new Error('Session not found')
}

function storeSession(session: Session) {
  if (sessions.value.length === 0) {
    sessions.value.push(session)
  }
  // find the session with the same id and replace it
  sessions.value.forEach((s, i) => {
    if (s.id === session.id) {
      sessions.value[i] = session
    }
  })
  localStorage.setItem('sessions', JSON.stringify(sessions.value))
}

function loadActiveSession() {
  activeSession.value = getActiveSession()
  messageInteractionCounter.value = activeSession.value.chatHistory.messages.filter(
    message => message.message.role === 'user'
  ).length
  editorContent.value = activeSession.value.editorContent
  sessionLoading.value = true
  // reverse order
  if (activeSession.value.chatHistory.messages.length > 0) {
    if (activeSession.value.chatHistory.messages[0].message.role === 'user') {
      chatHistory.messages = activeSession.value.chatHistory.messages
    } else {
      chatHistory.messages = activeSession.value.chatHistory.messages.toReversed()
    }
  }

  if (chatHistory.messages.length > 0) {
    setMessages(
      chatHistory.messages.map(message => {
        delete message.message.new
        return message.message
      })
    )
  }
  muteAllAudioplayers()
}

function keyDownHandler(event: KeyboardEvent) {
  if (event.code === 'Escape') {
    showDrawer(false)
  }
  if (event.key === 'F8') {
    toggleToolbar()
  }
}

/** Text completion submission wrapper */
function submit(e: any): void {
  if (input.value === '') {
    input.value = input.value.concat(editorContent.value)
  }
  if (selectedText.value !== '' && lastContextMenuAction.value === 'askQuestion') {
    input.value = input.value.concat('<text>' + selectedText.value + '</text>')
    selectedText.value = ''
  }
  handleSubmit(e)
  removeSelection()
  inputDisabled.value = true
  setTimeout(() => {
    inputDisabled.value = false
  }, 1000)
}

function setLastContextMenuAction(prompt: string): string {
  actions.forEach(action => {
    if (action.prompt === prompt) {
      return action.name
    }
  })
  return ''
}

/** Submission wrapper for the callback action of the context menu */
function submitSelectedCallback(event: Event, prompt: string, selectedTextFromEditor: string) {
  const range = editor.value.getSelection().getRanges()[0]
  if (range === undefined) {
    // no selection
    return
  }
  const innerHtml = getHTMLFromRange(range).replace('<br>', '')
  // console.log(innerHtml)
  selectedTextProperties.value = {
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    context: innerHtml,
  }
  lastContextMenuAction.value = setLastContextMenuAction(prompt)
  // console.log(selectedTextFromEditor)
  // Setting the selected text from the text editor to the shared state
  selectedTextFromEditor = preprocessHtml(selectedTextFromEditor)
  selectedText.value = selectedTextFromEditor
  if (prompt === 'STORE') {
    // selectedText.value = selectedTextFromEditor
    const chatInput = document.getElementById('chat-input')
    if (chatInput) {
      chatInput.focus()
    }
    synthesizeSpeech('Stored the selected text, continue with asking your question!', directResponseIndex)
    return
  }
  if (selectedTextFromEditor === '') {
    return
  } else if (prompt === 'READ') {
    synthesizeSpeech(selectedTextFromEditor.replace(/<[^>]*>/g, '\n'), readAloudPlayerIndex)
    removeSelection()
    return
  } else if (prompt.includes('[MODIFICATION_REQUEST]: Spell check')) {
    input.value = input.value.concat(prompt + preprocessHtml(selectedTextProperties.value.context))
  } else if (prompt === 'SYNONYMS') {
    if (selectedText.value.split(' ').length > 2) {
      synthesizeSpeech(`Please select only one word to find synonyms for.`, directResponseIndex)
      removeSelection()
      return
    }
    synthesizeSpeech(`No synonym found for ${selectedText.value}`, directResponseIndex)
    removeSelection()
    return
  } else if (prompt === 'No synonyms found') {
    synthesizeSpeech(`No synonym found for ${selectedText.value}`, directResponseIndex)
    removeSelection()
    return
  } else if (prompt.includes('Replace with:')) {
    let synonym = prompt.replace('Replace with:', '')
    let newContent = selectedTextPropertiesSynonyms.value.context.replace(selectedText.value.trim(), synonym)
    editorContent.value = editorContent.value.replace(selectedTextPropertiesSynonyms.value.context, newContent)
    synthesizeSpeech(`Replaced ${selectedText.value} with ${synonym}`, directResponseIndex)
    removeSelection()
    return
  } else {
    // console.log('Normal callback flow')
    // console.log('selectedTextFromEditor:', selectedTextFromEditor)
    // console.log('prompt:', prompt)
    input.value = input.value.concat(prompt + selectedTextFromEditor)
  }
  // console.log('submitting')
  handleSubmit(event)
  // console.log('should be submitted')
  setTimeout(() => {
    console.log(messages.value)
  }, 1000)
}

function removeSelection() {
  selectedText.value = ''
}

function setResponse(response: string) {
  response = response.replace(/\[.*?\]:\s*/, '')
  chatHistory.messages[getLastEntryIndex()].message.content = response
}

function addPrefixToAssistantResponse(chatMessage: ChatMessage): void {
  const matchPrefix = chatMessage.message.content.match(/Answer (\d+)\n([\s\S]*)/)
  if (matchPrefix) {
    if (matchPrefix[2].includes('Answer')) {
      chatMessage.message.content = matchPrefix[2]
    } else {
      chatMessage.message.content = `Answer ${messageInteractionCounter.value}\n${matchPrefix[2]}`
    }
    return
  }
  // Assistant responses without prefixes yet
  chatHistory.messages[
    getLastEntryIndex()
  ].message.content = `Answer ${messageInteractionCounter.value}\n${chatMessage.message.content}`
}

function addToChatHistory(message: Message) {
  if (message.role === 'user') {
    message.content = removeCallbackActionPrefix(message.content)
    messageInteractionCounter.value++
  }
  let chatMessage = {
    message: {
      id: Date.now().toString(),
      role: message.role,
      content:
        message.role === 'user'
          ? `Prompt ${messageInteractionCounter.value}\n${message.content}`
          : `Answer ${messageInteractionCounter.value}\n${message.content}`,
      new: true,
    },
    audioPlayer: newAudioPlayer(),
  } as ChatMessage

  // reverse order unshift
  chatHistory.messages.push(chatMessage)
}

function isLastMessageUser() {
  return messages.value[messages.value.length - 1].role === 'user'
}

function getLastEntry() {
  return chatHistory.messages[getLastEntryIndex()]
}

function getLastEntryIndex() {
  // reverse order
  return chatHistory.messages.length - 1
}

/** Suggestion text box for the writing partner in the text editor
 * uses the editorContent for the shared state
 */
watch(messages, (_): void => {
  if (messages.value.length === 0) {
    // set the messages store of the vercel ai chat
    setMessages(chatHistory.messages.map(message => message.message))
    return
  }
  if (sessionLoading.value && chatHistory.messages.length !== 0) {
    // Synchronize session chat with active chat
    sessionLoading.value = false
    return
  }
  if (chatHistory.messages.length === 0) {
    // Empty chat on start up set session loading to false
    sessionLoading.value = false
  }

  if (messages.value.length < chatHistory.messages.length) {
    setMessages(chatHistory.messages.map(message => message.message))
  }

  let message = messages.value[messages.value.length - 1]
  if (message.role === 'assistant') {
    responseFinished.value = isFinished(message.content)
    message = preprocessAssistantMessage(message)
  }
  if (message.role === 'user') {
    message = preprocessUserMessage(message)
  }
  if (chatHistory.messages.length < messages.value.length) {
    addToChatHistory(message)
  }
  let chatMessage = getLastEntry()
  if (chatMessage.message.role === 'user') {
    console.log('User Prompt')
    chatMessage.message.content = removeHtmlTags(chatMessage.message.content)
    synthesizeSpeech(chatMessage.message.content, getLastEntryIndex())
    setTimeout(() => {
      if (isLastMessageUser()) {
        let newMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: '',
        }
        if (!messages.value[messages.value.length - 1].content.includes('<ai-response>')) {
          newMessage.content = PROMPT_TAKES_A_WHILE
        }
        addToChatHistory(newMessage)
        synthesizeSpeech(newMessage.content, getLastEntryIndex())
      }
    }, 7000)
    return
  }
  console.log('Assistant Answer is new?', chatMessage.message.new)
  checkHTMLInResponse(message.content)
  addPrefixToAssistantResponse(chatMessage)
  if (synthesizeIntermediateAnswer(chatMessage)) {
    chatMessage.message.content = removeHtmlTags(chatMessage.message.content)
    addToVoiceResponse(chatMessage.message.content)
    synthesizeSpeech(chatMessage.message.content, getLastAssistantResponseIndex())
    focusPauseButton(getLastAssistantResponseIndex())
  }
})

function synthesizeIntermediateAnswer(chatMessage: ChatMessage): boolean {
  if (IsInlineModification(lastContextMenuAction.value)) {
    // console.log('isInlineModification', lastContextMenuAction.value)
    // console.log(chatMessage.message.content)
    if (
      !chatMessage.message.content.includes('Here are the modifications') &&
      !chatMessage.message.content.includes('Here are the corrections')
    ) {
      return false
    }
  }
  const inludesStructuredResponse = chatMessage.message.content.includes('ai-response')
  if (inludesStructuredResponse) {
    return false
  }
  // console.log('intermediateAnswerSynthesisCounter', intermediateAnswerSynthesisCounter.value)
  if (intermediateAnswerSynthesisCounter.value % 13 === 0) {
    chatMessage.message.new = true
  }

  if (chatMessage.message.content.length > 200 && chatMessage.message.new === true) {
    // console.log('content', chatMessage.message.content)
    chatMessage.message.new = false
    intermediateAnswerSynthesisCounter.value = 1
    return true
  }
  intermediateAnswerSynthesisCounter.value++
  return false
}

watch(responseFinished, (_): void => {
  if (responseFinished.value) {
    intermediateAnswerSynthesisCounter.value = 0
    activeSession.value = {
      id: activeSession.value.id,
      chatHistory: chatHistory,
      editorContent: editorContent.value,
    }
    storeSession(activeSession.value)
    // final run to finish the voice synthesis
    clearInterval(intervalId.value)
    responseFinished.value = false
    const assistantAnswer = chatHistory.messages[getLastEntryIndex()].message.content
    checkHTMLInResponse(assistantAnswer)
    if (voiceResponse.value.includes(assistantAnswer)) {
      return
    }
    if (assistantAnswer.includes('<ai-response>')) {
      return
    }
    addToVoiceResponse(assistantAnswer)
    // continue where we left off, do not start over
    voiceSynthesisStartOver.value = false
    synthesizeSpeech(voiceResponse.value, getLastAssistantResponseIndex())

    // if the user prompt is still being played do not focus on the pause button of the assistant response
    // reverse order
    if (chatHistory.messages[getLastEntryIndex() - 1].audioPlayer.muted === false) {
      return
    }
    focusPauseButton(getLastAssistantResponseIndex())
  }
})

watch(readOnly, (_): void => {
  if (editor.value) {
    if (readOnly.value) {
      let element = document.getElementById('cke_editor1_arialbl')
      element.innerText = 'Read only text editor'
    } else {
      let element = document.getElementById('cke_editor1_arialbl')
      element.innerText = 'Rich Text Editor'
    }
  }
})

watch(resynthesizeAudio, (_): void => {
  if (!resynthesizeAudio.value) {
    chatHistory.messages.forEach((message: ChatMessage) => {
      if (message.audioPlayer.id === resynthesizeAudioPlayerId.value) {
        // resetting audio
        pausePlayer(message.audioPlayer)
        muteAllAudioplayers()
        resumePlayer(message.audioPlayer)
        // necessary due to event not firing
        pausePlayerAfterTimeout(message.audioPlayer)
      }
    })
  }
})

function replaceExpression(assistantResponse: string, expression: RegExp) {
  // const expression = /<ai-response>([\s\S]*?)<\/ai-response>/
  const match = assistantResponse.match(expression)
  if (match && match[1]) {
    chatHistory.messages[getLastEntryIndex()].message.html = match[1].replace(/>\s+|\s+</g, m => m.trim())
    chatHistory.messages[getLastEntryIndex()].message.showHtml = false
    generateReadableHTML(chatHistory.messages[getLastEntryIndex()])
  }
  const parts = assistantResponse.split(expression)
  if (parts.length === 1) {
    // Special case, where assistant response tag is included in response but the regex does not match
    setResponse(assistantResponse)
  } else {
    parts[1] = parts[1].replace(match[1], HTML_EXTRACTION_PLACEHOLDER)
  }
  const textWithoutHtml = parts.join('')
  setResponse(textWithoutHtml)
}

function checkHTMLInResponse(assistantResponse: string): void {
  if (assistantResponse.includes(HTML_EXTRACTION_PLACEHOLDER)) {
    setResponse(assistantResponse)
  }
  if (assistantResponse.includes('<ai-response>')) {
    replaceExpression(assistantResponse, /<ai-response>([\s\S]*?)<\/ai-response>/)
  } else if (assistantResponse.includes('```html') || isHtmlAlreadyExtracted(assistantResponse)) {
    replaceExpression(assistantResponse, /```html([\s\S]*?)```/)
  } else if (assistantResponse.includes('<body>')) {
    // Special case where html tags and ai-response tags are both missing
    replaceExpression(assistantResponse, /<body>([\s\S]*?)<\/body>/)
  } else {
    if (IsInlineModification(lastContextMenuAction.value)) {
      assistantResponse = handleContextMenuAction(
        chatHistory.messages[getLastEntryIndex()],
        assistantResponse,
        lastContextMenuAction.value
      )
    }
    setResponse(assistantResponse)
  }
}

async function assignNewSpeechRecognizer() {
  speechRecognizer.value = await setupSpeechRecognizer()
}

async function sttFromMic() {
  const start = Date.now()
  speechRecognizer.value.startContinuousRecognitionAsync()
  speechRecognizer.value.recognizing = (_, e) => {
    console.log(`RECOGNIZING: Text=${e.result.text}`)
  }

  // Signals that the speech service has started to detect speech.
  speechRecognizer.value.speechStartDetected = (_, e) => {
    console.log('(speechStartDetected) SessionId: ' + e.sessionId)
  }

  speechRecognizer.value.recognized = (_, e) => {
    if (e.result.reason == speechsdk.ResultReason.RecognizedSpeech) {
      console.log(`RECOGNIZED: Text=${e.result.text}`)
      input.value = input.value.concat(e.result.text)
      submit(new Event('submit'))
      speechRecognizer.value.stopContinuousRecognitionAsync()
    } else if (e.result.reason == speechsdk.ResultReason.NoMatch && e.result.text === '') {
      console.log('NOMATCH: Speech could not be recognized.')
      synthesizeSpeech('I did not understand or hear you. Stopping recording of your microphone.', directResponseIndex)
      speechRecognizer.value.stopContinuousRecognitionAsync()
    }
  }

  speechRecognizer.value.sessionStopped = (s, e) => {
    console.log('\n    Session stopped event.')
    speechRecognizer.value.stopContinuousRecognitionAsync()
  }
  speechRecognizer.value.sessionStarted = (s, e) => {
    new Tone.Synth().toDestination().triggerAttackRelease('C4', '8n')
    const end = Date.now()
    console.log(`Speech recognizer start up time: ${end - start} ms`)
    console.log('\n    Session started event.')
  }
}

function addToVoiceResponse(assistantResponse: string) {
  voiceResponse.value = removeHtmlTags(assistantResponse)
}

function insertParagraphWise(paragraphs: string[]) {
  for (const paragraph of paragraphs) {
    paragraph.trim()
    const paragraphWithoutTags = paragraph.replace(/<[^>]*>/g, '')
    if (paragraphWithoutTags === '') {
      continue
    }
    editorContent.value = editorContent.value.concat(`<p>${paragraph}</p>`)
  }
  // focusOnEndOfEditor()
}

function handleModificationRequest(content: string) {
  editorContent.value = preprocessHtml(editorContent.value)
  selectedText.value = preprocessHtml(selectedText.value)

  let textReplacement = ''
  if (!containsHtmlTags(content)) {
    // if the content does not include any html tags, we can assume that the content is plain text
    // Example: There was a car driving down the road. [replace car with truck] => There was a truck driving down the road.
    textReplacement = preprocessHtml(selectedTextProperties.value.context.replace(selectedText.value, content.trim()))
  } else {
    // if there is html, the context should cover the whole html tag, so we can assume that selectedTextProperties.value.context is the html tag
    // Example <p>It's raining all day.</p> [replace the whole paragraph] => <p>What a beatiful day, size the day!</p>
    textReplacement = preprocessHtml(
      selectedTextProperties.value.context.replace(selectedTextProperties.value.context, content.trim())
    )
  }
  editorContent.value = editorContent.value
    .replace(/>\s+|\s+</g, m => m.trim())
    .replace(selectedTextProperties.value.context, textReplacement)
  // focusOnPastedContent(textReplacementInContext)
}

function paste(index: number) {
  const matchPrefix = chatHistory.messages[index].message.content.match(/Answer (\d+)\n([\s\S]*)/)
  if (!matchPrefix) {
    return
  }
  let replacementText = preprocessHtml(matchPrefix[2])
  if (replacementText.includes('No corrections were needed.')) {
    synthesizeSpeech('Cannot paste, as no corrections were needed.', directResponseIndex)
    return
  }
  const isHtml = isHtmlAlreadyExtracted(replacementText) || chatHistory.messages[index].message.html
  if (isHtml) {
    replacementText = preprocessHtml(chatHistory.messages[index].message.html)
    console.log(replacementText)
  }
  if (IsInlineModification(lastContextMenuAction.value) && selectedText.value !== '') {
    handleModificationRequest(replacementText)
    // console.log('PASTE___')
    // console.log('editorContent:', editorContent.value)
    // console.log('replacementText:', replacementText.trim())
    // console.log('includes:', editorContent.value.trim().includes(replacementText.trim()))
    if (editorContent.value.trim().includes(replacementText.trim())) {
      synthesizeSpeech('Modified the selected content directly.', directResponseIndex)
    } else {
      synthesizeSpeech('Pasting content to end of text editor', directResponseIndex)
      editorContent.value += replacementText
      // focusOnEndOfEditor()
      // scrollToBottomTextEditor()
    }
    return
  }

  if (isHtml) {
    synthesizeSpeech('Pasted structured to the text editor.', directResponseIndex)
    editorContent.value += replacementText
    // focusOnEndOfEditor()
    return
  }
  if (editorContent.value === '') {
    synthesizeSpeech('Pasted to the text editor.', directResponseIndex)
  } else {
    console.log('pasted to the text editor and appended at the end')
    synthesizeSpeech('Pasted to the text editor and appended at the end.', directResponseIndex)
  }
  if (replacementText.toLowerCase().includes('html')) {
    // Special case where html is not identified correctly
    editorContent.value += replacementText
    // focusOnEndOfEditor()
    // scrollToBottomTextEditor()
    return
  }
  insertParagraphWise(replacementText.split('\n'))
  // scrollToBottomTextEditor()
}

function getLastAssistantResponseIndex(): number {
  if (chatHistory.messages.length === 0) {
    throw new Error('Cannot get index when there is no message!')
  }
  let lastAssistantResponseIndex = getLastEntryIndex()
  while (
    chatHistory.messages[lastAssistantResponseIndex].message.role !== 'assistant' &&
    lastAssistantResponseIndex < chatHistory.messages.length
  ) {
    lastAssistantResponseIndex++
  }
  return lastAssistantResponseIndex
}

async function synthesizeSpeech(text: string, index: number) {
  if (text === '') {
    return
  }
  let audioPlayer = updateAudioPlayer(chatHistory.messages[index])
  if (index === directResponseIndex) {
    muteAllAudioplayers()
  } else if (index === readAloudPlayerIndex) {
    readAloudAudioPlayer.value = configureReadAloudAudioPlayer(audioPlayer)
  } else {
    prevAudioPlayer.value = getAudioPlayer(chatHistory.messages[index])
    audioPlayer.player = configureAudioPlayer(index).player
    chatHistory.messages[index].audioPlayer = audioPlayer
  }
  await speak(text, index, audioPlayer.player)
}

async function speak(textToSpeak: string, index: number, player: speechsdk.SpeakerAudioDestination): Promise<void> {
  const audioConfig = speechsdk.AudioConfig.fromSpeakerOutput(player)
  const speechConfig = await setupTTSConfig()
  let synthesizer = new speechsdk.SpeechSynthesizer(speechConfig, audioConfig)
  // Events are raised as the output audio data becomes available, which is faster than playback to an output device.
  // We must must appropriately synchronize streaming and real-time.
  synthesizer.speakTextAsync(
    textToSpeak,
    result => {
      let text
      if (result.reason === speechsdk.ResultReason.SynthesizingAudioCompleted) {
        if (index === directResponseIndex) {
          // no additional action required for direct responses
        } else if (index === readAloudPlayerIndex) {
          showReadAloudAudioPlayer.value.show = true
          focusReadAloudPauseButton()
        }
        text = `synthesis finished for "${textToSpeak}".\n`
        // focusPauseButton()
      } else if (result.reason === speechsdk.ResultReason.Canceled) {
        text = `synthesis failed. Error detail: ${result.errorDetails}.\n`
      }
      // After the synthesizer closes the audio would start playing
      synthesizer.close()
      console.log(text)
      lastSynthesizedText.value = textToSpeak
      if (resynthesizeAudio.value) {
        resynthesizeAudio.value = false
      }
      ifUserAnswerIsBeingReadAloud(index)
    },
    function (err) {
      console.log(`Error: ${err}.\n`)
      synthesizer.close()
    }
  )
}

function ifUserAnswerIsBeingReadAloud(index: number) {
  if (index === directResponseIndex || index === readAloudPlayerIndex) {
    return false
  }
  if (chatHistory.messages[index].message.role === 'assistant') {
    // reverse order
    if (chatHistory.messages[index - 1].audioPlayer.muted === false) {
      // Pause the assistant until the user has finished listening to the prompt
      chatHistory.messages[index].audioPlayer.player.pause()
      chatHistory.messages[index].audioPlayer.muted = true
      return true
    }
  }
  return false
}

function configureAudioPlayer(index: number): AudioPlayer {
  let audioPlayer = updateAudioPlayer(chatHistory.messages[index])
  audioPlayer.player.onAudioEnd = audioPlayer => {
    window.console.log('Audio track ended')
    audioPlayer.pause()
    // reverse order
    chatHistory.messages[index].audioPlayer.muted = true
    if (index - 1 > 0) {
      // sanity check
      chatHistory.messages[index - 1].audioPlayer.muted = true
    }
    // if (chatHistory.messages[index].message.role === 'user') {
    chatHistory.messages[index].audioPlayer.alreadyPlayed = true
    // }

    if (
      chatHistory.messages[getLastEntryIndex()] &&
      chatHistory.messages[getLastEntryIndex()].message.role === 'assistant' &&
      !chatHistory.messages[getLastEntryIndex()].audioPlayer.alreadyPlayed
    ) {
      // reverse order
      let nextAudioPlayer = getAudioPlayer(chatHistory.messages[getLastEntryIndex()])
      nextAudioPlayer.player.resume()
      nextAudioPlayer.muted = false
      chatHistory.messages[getLastEntryIndex()].audioPlayer.alreadyPlayed = true
      // reverse order
      focusPauseButton(getLastEntryIndex())
    }
  }

  audioPlayer.player.onAudioStart = () => {
    window.console.log('Audio track started')
    window.console.log('Index', index)
    if (chatHistory.messages[index].message.role === 'user') {
      window.console.log('This should be a user index:', index)
      window.console.log(chatHistory.messages[index])
      focusPauseButton(index)
    }
    const isStillPlaying = ifUserAnswerIsBeingReadAloud(index)
    if (isStillPlaying) {
      focusPauseButton(index + 1)
      return
    }
    let currentTime = prevAudioPlayer.value.player.currentTime
    if (
      currentTime !== invalidCurrentTime &&
      !voiceSynthesisStartOver.value &&
      lastSynthesizedText.value !== PROMPT_TAKES_A_WHILE
    ) {
      window.console.log('ARE WE GETTING IN HERE??', audioPlayer)
      // round to 2 decimal places
      audioPlayer.player.internalAudio.currentTime = Math.round(currentTime * 100) / 100
      prevAudioPlayer.value.player.pause()
    }
    if (voiceSynthesisStartOver.value) {
      voiceSynthesisStartOver.value = false
    }
    chatHistory.messages[index].audioPlayer.muted = false
    prevAudioPlayer.value.player.pause()
  }
  return audioPlayer
}

function configureReadAloudAudioPlayer(newlyAudioPlayer: AudioPlayer): AudioPlayer {
  newlyAudioPlayer.player.onAudioEnd = audioPlayer => {
    audioPlayer.pause()
    readAloudAudioPlayer.value.muted = true
    readAloudAudioPlayer.value.alreadyPlayed = true
    showReadAloudAudioPlayer.value.show = false
  }
  newlyAudioPlayer.player.onAudioStart = () => {
    readAloudAudioPlayer.value.muted = false
  }
  return newlyAudioPlayer
}

function muteAllAudioplayers(): void {
  chatHistory.messages.forEach((message: ChatMessage) => {
    if (message.audioPlayer && !message.audioPlayer.muted && validAudioPlayer(message.audioPlayer)) {
      message.audioPlayer.player.pause()
      message.audioPlayer.muted = true
    }
  })
  if (readAloudAudioPlayer.value && !readAloudAudioPlayer.value.muted && validAudioPlayer(readAloudAudioPlayer.value)) {
    readAloudAudioPlayer.value.player.pause()
    readAloudAudioPlayer.value.muted = true
  }
}

function handlePause(entry: ChatMessage, index: number) {
  if (!entry.audioPlayer.muted) {
    pausePlayer(entry.audioPlayer)
    return
  }
  if (!entry.message.html) {
    muteAllAudioplayers()
    resumePlayer(entry.audioPlayer)
    return
  }
  // Structured response handling
  if (entry.message.showHtml) {
    if (voiceResponse.value === entry.message.contentHtml) {
      muteAllAudioplayers()
      resumePlayer(entry.audioPlayer)
    } else {
      voiceSynthesisStartOver.value = true
      resynthesizeAudio.value = true
      synthesizeSpeech(entry.message.contentHtml, index)
      voiceResponse.value = entry.message.contentHtml
    }
  } else {
    if (voiceResponse.value === entry.message.content) {
      muteAllAudioplayers()
      resumePlayer(entry.audioPlayer)
    } else {
      voiceSynthesisStartOver.value = true
      resynthesizeAudio.value = true
      synthesizeSpeech(entry.message.content, index)
      addToVoiceResponse(entry.message.content)
    }
  }
}

function pause(entry: ChatMessage, index: number) {
  // special case for read aloud
  if (index === readAloudPlayerIndex) {
    if (!readAloudAudioPlayer.value.muted) {
      pausePlayer(readAloudAudioPlayer.value)
      return
    } else {
      muteAllAudioplayers()
      resumePlayer(readAloudAudioPlayer.value)
      return
    }
  }

  // We are working with a new audio player object
  if (validAudioPlayer(entry.audioPlayer)) {
    handlePause(entry, index)
    return
  }
  // TODO: Investigate why the onAudioEnd does not fire when starting from a stored session
  if (entry.message.showHtml) {
    generateReadableHTML(entry)
    voiceSynthesisStartOver.value = true
    resynthesizeAudio.value = true
    synthesizeSpeech(entry.message.contentHtml, index)
    resynthesizeAudioPlayerId.value = chatHistory.messages[index].audioPlayer.id
    voiceResponse.value = entry.message.contentHtml
  } else {
    voiceSynthesisStartOver.value = true
    resynthesizeAudio.value = true
    synthesizeSpeech(entry.message.content, index)
    resynthesizeAudioPlayerId.value = chatHistory.messages[index].audioPlayer.id
    addToVoiceResponse(entry.message.content)
  }
}

function showDrawer(bool: boolean) {
  drawer.value = bool
}

function clearDocumentVars() {
  chatHistory.messages = []
  messages.value = []
  messageInteractionCounter.value = 0
  input.value = ''
  editorContent.value = ''
  voiceResponse.value = ''
}

function clearDocument() {
  clearDocumentVars()
  activeSession.value = {
    id: activeSession.value.id,
    chatHistory: { messages: [] as ChatMessage[] },
    editorContent: '',
  }
  storeSession(activeSession.value)
  showDrawer(false)
  document.getElementById('mic-input-btn')?.focus()
}

function createNewDocument() {
  muteAllAudioplayers()
  const newSession = {
    id: Date.now().toString(),
    chatHistory: { messages: [] as ChatMessage[] },
    editorContent: '',
  }
  activeSession.value = newSession
  sessions.value.push(newSession)
  localStorage.setItem('sessions', JSON.stringify(sessions.value))
  clearDocumentVars()
  showDrawer(false)
}

function clearAllDocuments() {
  muteAllAudioplayers()
  localStorage.setItem('sessions', JSON.stringify([]))
  createNewDocument()
}

async function downloadDocument() {
  await downloadDocumentAsWordBlob()
}

// fetch selected text from the text editor every second
if (process.client) {
  function getSelectionText() {
    if (!editor.value || typeof editor.value.getSelection !== 'function') {
      // editor not loaded yet
      return
    }
    const range = editor.value.getSelection().getRanges()[0]
    if (range === undefined) {
      // no selection
      return
    }
    selectedTextPropertiesSynonyms.value = {
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      context: range.startContainer.$.data,
    }
    const selected_fragment = range.cloneContents()
    if (selectedTextIntermediate.value === selected_fragment.getHtml()) {
      // no need to update if its the same value
      return
    }
    if (selected_fragment.getHtml() === '') {
      // do not set empty string
      return
    }
    if (selected_fragment.getHtml().split(' ').length > 2) {
      // only keep single words
      return
    }
    selectedTextIntermediate.value = selected_fragment.getHtml()
    let synonyms = thesaurus.default.find(selectedTextIntermediate.value.trim())
    if (synonyms.length === 0) {
      updateRegisteredActionsWithSynonyms(editor.value, submitSelectedCallback, ['None found'])
      return
    }
    if (synonyms.length > 5) {
      synonyms = synonyms.slice(0, 5)
    }
    updateRegisteredActionsWithSynonyms(editor.value, submitSelectedCallback, synonyms)
  }
  setInterval(getSelectionText, 1000)
}

function toggleChatHistoryExpanded() {
  chatHistoryExpanded.value = !chatHistoryExpanded.value
}
</script>

<template>
  <v-app class="main-class">
    <v-navigation-drawer v-if="drawer" class="sidebar" v-model="drawer" temporary>
      <sidebar-items
        :sessions="sessions"
        :activeSession="activeSession"
        @set-active-session="setActiveSession"
        @clear-all-documents="clearAllDocuments"
        @create-new-document="createNewDocument"
        @clear-document="clearDocument"
      />
    </v-navigation-drawer>
    <v-container>
      <v-row :justify="drawer !== true ? 'start' : 'end'">
        <sidebar-buttons :drawer="drawer" @close-drawer="showDrawer" />
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
                  <chat-input v-model="input" @sttFromMic="sttFromMic" :inputDisabled="inputDisabled" />
                </form>
                <chat-messages
                  :messages="chatHistory.messages"
                  :chatHistoryExpanded="chatHistoryExpanded"
                  @paste="paste"
                  @pause="pause"
                  @toggle-chat-history="toggleChatHistoryExpanded"
                />
              </div>
            </div>
            <chat-controls
              :chatHistoryExpanded="chatHistoryExpanded"
              @toggle-chat-history="toggleChatHistoryExpanded"
            />
          </div>
        </v-col>
        <v-col :cols="drawer !== true ? 8 : 7">
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
            <editor-controls
              :show-read-aloud="showReadAloudAudioPlayer.show"
              :audio-player="readAloudAudioPlayer"
              :read-only="readOnly"
              :read-aloud-player-index="readAloudPlayerIndex"
              @pause-read-aloud="pause"
              @toggle-read-only="toggleReadOnly"
              @clear-editor-content="clearEditorContent"
              @download-word="downloadDocument"
            />
          </div>
        </v-col>
      </v-row>
    </v-container>
  </v-app>
</template>

<style scoped>
.main-class {
  background: #ffffff;
  overflow-y: hidden;
}
.card-title {
  display: block;
  font-size: 1.5em;
  margin-block-end: 0.25em;
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
  height: 80vh;
  max-height: 80vh;
  overflow-y: scroll;
}
.input {
  border-bottom: #ccced1 2px solid;
  padding: 6px 8px 2px;
}
.no-uppercase {
  text-transform: unset !important;
}
</style>
