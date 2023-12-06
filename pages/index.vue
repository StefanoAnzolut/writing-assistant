<script setup lang="ts">
import { useChat, type Message } from 'ai/vue'
import { getTokenOrRefresh } from '~/utils/token_util'
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk'
import type { AsyncComponentLoader } from 'vue'
import * as Tone from 'tone'
import type { ChatHistory } from '~/models/ChatHistory'
import { registerActionsWithSynonyms, removeFormElementRoles } from '~/utils/CKEditor'
import type { AudioPlayer } from '~/models/AudioPlayer'
import type { ChatMessage } from '~/models/ChatMessage'
import type { Session } from '~/models/Session'
import { generateReadableTextFromHTML } from '~/utils/htmlReader'
const thesaurus = await import('thesaurus')
onMounted(() => {
  console.log('OnMounted has been called')
  sessions.value = JSON.parse(localStorage.getItem('sessions') || '[]')
  loadActiveSession()
  setInterval(() => {
    storeSession(getActiveSession())
  }, 60000) // every minute
  setupSpeechRecognizer()
  setInterval(() => {
    setupSpeechRecognizer()
  }, 590000) // every 9.8 minutes
  window.addEventListener('keydown', keyDownHandler)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', keyDownHandler)
})
const { messages, input, handleSubmit, setMessages } = useChat({
  headers: { 'Content-Type': 'application/json' },
})

// Maybe useCompletion might be interesting in the future

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
/** Shared editor content between the user and the writing partner */
const editorContent = ref('')
/** A temporary store for the selected text from the text editor for custom questions and easier replacement */
const selectedText = ref('')
const selectedTextIntermediate = ref('')

const lastContextMenuAction = ref('')

/** The reference to see whether we have reached the end of a streaming response from ChatGPT */
const responseFinished = ref(false)
/** A global reference to de-allocated the periodic interval check to add new content when response is being streamed */
const intervalId = ref({} as NodeJS.Timeout)

/** SpeechRecognizer */
const speechRecognizer = ref({} as speechsdk.SpeechRecognizer)
/** The selected speaker for Text-To-Speech */
const selectedSpeaker = ref('Jenny')
const voiceSynthesisOnce = ref(false)
const voiceSynthesisStartOver = ref(false)
const resynthesizeAudio = ref(false)
const resynthesizeAudioPlayerId = ref('')
/** Voice response from ChatGPT */
const voiceResponse = ref('')

/** Currently playing audio player to snatch currentTime */
const prevAudioPlayer = ref({} as AudioPlayer)
/** Read aloud audio player and it's overlay flag */
const readAloudAudioPlayer = ref({} as AudioPlayer)
const showReadAloudAudioPlayer = ref({ show: false })

const HTML_EXTRACTION_PLACEHOLDER =
  'Generated a structure. Expand it using the expand button and paste it to the text editor with the paste button.'

const editor = ref({} as any)
const readOnly = ref(false)

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
    ck.editor.removeMenuItem('cut')
    ck.editor.removeMenuItem('copy')
    ck.editor.removeMenuItem('paste')
    registerActions(ck.editor, submitSelectedCallback)
    removeFormElementRoles()
    editor.value = ck.editor
  })

  // Element is not yet available, so we need to wait a bit (150 ms should be enough)
  setTimeout(() => {
    let toolbar = document.getElementsByClassName('cke_top')
    toolbar[0].setAttribute('style', 'display: none')

    let bottomBar = document.getElementsByClassName('cke_bottom')
    bottomBar[0].setAttribute('style', 'display: none')

    let textAreaElements = document.getElementsByClassName('cke_contents cke_reset')
    textAreaElements[0].setAttribute('style', 'height: 80vh !important;')
  }, 350)
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
      chatHistory.messages = activeSession.value.chatHistory.messages.toReversed()
    } else {
      chatHistory.messages = activeSession.value.chatHistory.messages
    }
  }

  if (chatHistory.messages.length > 0) {
    messages.value = chatHistory.messages.map(message => {
      delete message.message.new
      return message.message
    })
  }
  muteAllAudioplayers()
}

// TODO: Figure out how scrolling works properly for the ck4editor that is loaded in the iframe.
// async function scrollToBottomTextEditor() {
//   await nextTick()
// let iframe = document.getElementsByTagName('iframe')[0]
// iframe.contentWindow.scrollTo(0, iframe.contentDocument.body.scrollHeight)

// var editor = CKEDITOR.instances.editor1
// console.log(editor)
// var doc = editor.document.$
// console.log(doc)
// console.log(doc.body)
// let lastChild = doc.body.lastChild
// console.log(lastChild)
// lastChild.scrollIntoView()
// setInterval(() => {

// }, 1000)
// iframe.bod

// doc.scrollTop = (76 * window.innerHeight) / 100
// }

function keyDownHandler(event: KeyboardEvent) {
  if (event.code === 'Escape') {
    drawer.value = false
  }
}

/** Text completion submission wrapper */
function submit(e: any): void {
  if (input.value === '') {
    input.value = input.value.concat(editorContent.value)
  }
  if (selectedText.value !== '') {
    input.value = input.value.concat(selectedText.value)
  }
  handleSubmit(e)
  inputDisabled.value = true
  setTimeout(() => {
    inputDisabled.value = false
  }, 1000)
}

/** Submission wrapper for the callback action of the context menu */
function submitSelectedCallback(event: Event, prompt: string, selectedTextFromEditor: string) {
  actions.forEach(action => {
    if (action.prompt === prompt) {
      lastContextMenuAction.value = action.name
    }
  })
  // Setting the selected text from the text editor to the shared state
  selectedTextFromEditor = decodeHtmlCode(decodeHtmlCharCodes(selectedTextFromEditor))
  selectedText.value = selectedTextFromEditor
  // const selected = window.getSelection()

  if (prompt === 'STORE') {
    // selectedText.value = selectedTextFromEditor
    const chatInput = document.getElementById('chat-input')
    if (chatInput) {
      chatInput.focus()
    }
    return
  }
  if (selectedTextFromEditor === '') {
    return
  } else if (prompt === 'READ') {
    synthesizeSpeech(selectedTextFromEditor.replace(/<[^>]*>/g, '\n'), -2)
    removeSelection()
    return
  } else if (prompt === 'SYNONYMS') {
    if (selectedText.value.split(' ').length > 2) {
      synthesizeSpeech(`Please select only one word to find synonyms for.`, -1)
      removeSelection()
      return
    }
    synthesizeSpeech(`No synonym found for ${selectedText.value}`, -1)
    removeSelection()
    return
  } else if (prompt.includes('Replace with:')) {
    let synonym = prompt.replace('Replace with:', '')
    console.log('selectedText', selectedText.value)
    console.log('synonym', synonym)
    editorContent.value = editorContent.value.replaceAll(selectedText.value.trim(), synonym)
    removeSelection()
    return
  }
  input.value = input.value.concat(prompt + selectedTextFromEditor)
  try {
    handleSubmit(event)
  } catch (e) {
    console.log(e)
  }
}

function removeSelection() {
  selectedText.value = ''
}

/** As we have modified the chat reponse to include the finish_reason to mark the end of the stream. We need to have some pre-processing. */
function preprocessMessage(message: Message): Message {
  responseFinished.value = isFinished(message.content)
  message.content = message.content.replace('2:"[{\\"done\\":true}]"', '')
  message.content = message.content.replace('[MODIFIED]:', '')
  message.content = message.content.replace('[MODIFIED_CONTENT]:', '')
  message.content = message.content.replace('[MODIFICATION_REQUEST]:', '')
  return message
}

function isFinished(message: string) {
  return message.includes('2:"[{\\"done\\":true}]"')
}

function addPrefixToContent(latestMessage) {
  const matchPrefix = latestMessage.content.match(/Answer (\d+)\n([\s\S]*)/)
  if (matchPrefix) {
    if (matchPrefix[2].includes('Answer')) {
      return matchPrefix[2]
    } else {
      return `Answer ${messageInteractionCounter.value}\n${matchPrefix[2]}`
    }
  }
  return latestMessage.role === 'user'
    ? `Prompt ${messageInteractionCounter.value}\n${latestMessage.content}`
    : `Answer ${messageInteractionCounter.value}\n${latestMessage.content}`
}

function removeCallbackActionPrefix(content: string): string {
  if (
    content.includes('the following content and re-use valid html tags that were given as input.:\n [USER_INPUT]:\n')
  ) {
    content = content.replace(
      'the following content and re-use valid html tags that were given as input.:\n [USER_INPUT]:\n',
      ''
    )
  }
  if (content.includes('[MODIFICATION_REQUEST]: ')) {
    content = content.replace('[MODIFICATION_REQUEST]: ', '')
  }
  return content
}

function addToChatHistory(message: Message) {
  message.content = removeCallbackActionPrefix(message.content)
  if (message.role === 'user') {
    messageInteractionCounter.value++
  }
  // reverse order
  chatHistory.messages.unshift({
    message: {
      id: Date.now().toString(),
      role: message.role,
      content: addPrefixToContent(message),
      new: true,
    },
    audioPlayer: {
      player: new speechsdk.SpeakerAudioDestination(),
      id: Date.now().toString(),
      muted: true,
      alreadyPlayed: false,
    },
  } as ChatMessage)
}

function isLastMessageUser() {
  return messages.value[messages.value.length - 1].role === 'user'
}

function getLastEntry() {
  // reverse order
  return chatHistory.messages[getLastEntryIndex()]
}

function getLastEntryIndex() {
  // reverse order
  return 0
}

// TODO: Why do I need this when asking a question from the text editor to the assistant
// As the messages are not appendend to the chat history

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
    message = preprocessMessage(message)
  }
  if (chatHistory.messages.length < messages.value.length) {
    addToChatHistory(message)
  }
  let entry = getLastEntry()
  if (entry.message.role === 'user') {
    entry.message.content = removeHtmlTags(entry.message.content)
    synthesizeSpeech(entry.message.content, getLastEntryIndex())
    setTimeout(() => {
      if (isLastMessageUser()) {
        let newMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: '',
        }
        // Check if we can keep the order for messages
        if (!messages.value[messages.value.length - 1].content.includes('<ai-response>')) {
          newMessage.content = "Understood, I'm processing your prompt, hold on. This might take a while."
        }
        addToChatHistory(newMessage)
        synthesizeSpeech(newMessage.content, getLastEntryIndex())
        voiceSynthesisOnce.value = true
        let tempEntry = getLastEntry()
        tempEntry.message.new = false
      }
      focusPauseButton(getLastAssistantResponseIndex())
    }, 5000)
    return
  }
  checkHTMLInResponse(addPrefixToContent(message))
  if (entry.message.content.length > 25 && entry.message.new === true) {
    entry.message.new = false
    if (entry.message.content.includes('<ai-response>') || entry.message.content.includes('<body>')) {
      return
    }
    addToVoiceResponse(entry.message.content)
    console.log('synthesize assistant answer')
    synthesizeSpeech(entry.message.content, getLastAssistantResponseIndex())
    voiceSynthesisOnce.value = true
  }
})

watch(responseFinished, (_): void => {
  if (responseFinished.value) {
    activeSession.value = {
      id: activeSession.value.id,
      chatHistory: chatHistory,
      editorContent: editorContent.value,
    }
    storeSession(activeSession.value)
    // final run to finish the voice synthesis
    clearInterval(intervalId.value)
    responseFinished.value = false
    voiceSynthesisOnce.value = false
    // reverse order
    let message = chatHistory.messages[getLastEntryIndex()].message
    checkHTMLInResponse(message.content)
    if (voiceResponse.value.includes(message.content)) {
      return
    }
    // TODO: Check how often a plain html body is returned for the edge case
    if (message.content.includes('<ai-response>')) {
      return
    }
    // reverse order
    addToVoiceResponse(chatHistory.messages[getLastEntryIndex()].message.content)
    voiceSynthesisStartOver.value = true
    synthesizeSpeech(voiceResponse.value, getLastAssistantResponseIndex())

    // if the user prompt is still being played do not focus on the pause button of the assistant response
    if (chatHistory.messages[getLastAssistantResponseIndex() + 1].audioPlayer.muted === false) {
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
        pausePlayer(message.audioPlayer)
        resumePlayer(message.audioPlayer)
        // Small magic to wait, as internalAudio.duration is not available immediately
        setTimeout(() => {
          setTimeout(() => {
            pausePlayer(message.audioPlayer)
          }, message.audioPlayer.player.internalAudio.duration * 1000)
        }, 200)
      }
    })
  }
})

watch(editor, (_): void => {
  console.log('Editor reference has been updated')
})

function replaceExpression(assistantResponse: string, expression: RegExp) {
  // const expression = /<ai-response>([\s\S]*?)<\/ai-response>/
  const match = assistantResponse.match(expression)
  if (match && match[1]) {
    // reverse order
    chatHistory.messages[getLastEntryIndex()].message.html = match[1].replace(/>\s+</g, '><')
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

function checkHTMLInResponse(assistantResponse: string) {
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
    setResponse(assistantResponse)
  }
}

async function setupSpeechRecognizer() {
  const tokenObj = await getTokenOrRefresh()
  const speechConfig = speechsdk.SpeechConfig.fromAuthorizationToken(tokenObj.authToken, tokenObj.region)
  speechConfig.speechRecognitionLanguage = 'en-US'
  // Speech_SegmentationSilenceTimeoutMs = 32
  // https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/propertyid?view=azure-node-latest
  speechConfig.setProperty(32, '3000')
  // Todo: Check additional effort to inlcude auto-detection of language
  speechRecognizer.value = new speechsdk.SpeechRecognizer(
    speechConfig,
    speechsdk.AudioConfig.fromDefaultMicrophoneInput()
  )
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
      handleSubmit(new Event('submit'))
      speechRecognizer.value.stopContinuousRecognitionAsync()
    } else if (e.result.reason == speechsdk.ResultReason.NoMatch && e.result.text === '') {
      console.log('NOMATCH: Speech could not be recognized.')
      synthesizeSpeech('I did not understand or hear you. Stopping recording of your microphone.', -1)
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

function IsInlineModification(action: string) {
  const modifcationActions = [
    'summarize',
    'checkSpelling',
    'simplify',
    'reformulate',
    'concise',
    'adaptToScientificStyle',
    'addStructure',
  ]
  return modifcationActions.includes(action)
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
}

function decodeHtmlCharCodes(str: string): string {
  return str.replace(/(&#(\d+);)/g, (match, capture, charCode) => String.fromCharCode(charCode))
}

function decodeHtmlCode(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
}

function isHtmlAlreadyExtracted(assistantResponse: string): boolean {
  return assistantResponse.includes(HTML_EXTRACTION_PLACEHOLDER)
}

function decodeHtml(str: string): string {
  return decodeHtmlCode(decodeHtmlCharCodes(str))
}

function paste(index: number) {
  const matchPrefix = chatHistory.messages[index].message.content.match(/Answer (\d+)\n([\s\S]*)/)
  if (!matchPrefix) {
    return
  }
  let replacementText = matchPrefix[2]
  const isHtml = isHtmlAlreadyExtracted(replacementText)
  if (isHtml) {
    replacementText = chatHistory.messages[index].message.html
  }

  if (IsInlineModification(lastContextMenuAction.value) && selectedText.value !== '') {
    editorContent.value = decodeHtml(editorContent.value)
    selectedText.value = decodeHtml(selectedText.value)
    editorContent.value = editorContent.value.replace(/>\s+</g, '><').replace(selectedText.value, replacementText)

    if (editorContent.value.includes(replacementText)) {
      synthesizeSpeech('Modified the selected content directly.', -1)
    } else {
      synthesizeSpeech("Couldn't find selection pasting content to end of text editor", -1)
      editorContent.value += replacementText
      // scrollToBottomTextEditor()
    }
    removeSelection()
    return
  }

  if (isHtml) {
    if (editorContent.value === '') {
      synthesizeSpeech('Pasted structured to the text editor.', -1)
    } else {
      synthesizeSpeech('Replaced structure in the text editor.', -1)
    }
    editorContent.value = replacementText
    return
  }
  if (editorContent.value === '') {
    synthesizeSpeech('Pasted to the text editor.', -1)
  } else {
    synthesizeSpeech('Pasted to the text editor and appended at the end.', -1)
  }
  if (replacementText.toLowerCase().includes('html')) {
    // Special case where html is not identified correctly
    editorContent.value += replacementText
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
  // reverse order
  let lastAssistantResponseIndex = getLastEntryIndex()
  while (
    chatHistory.messages[lastAssistantResponseIndex].message.role !== 'assistant' &&
    lastAssistantResponseIndex < chatHistory.messages.length
  ) {
    lastAssistantResponseIndex++
  }
  return lastAssistantResponseIndex
}

function getAudioPlayer(index: number): AudioPlayer {
  return chatHistory.messages[index].audioPlayer
}

async function focusReadAloudPauseButton() {
  await nextTick()
  let playPauseButtonReadAloudId = document.getElementById('playPauseButtonReadAloud')
  if (playPauseButtonReadAloudId !== null) {
    playPauseButtonReadAloudId.focus()
  } else {
    focusReadAloudPauseButton()
  }
}

function newAudioPlayer(): AudioPlayer {
  return {
    player: new speechsdk.SpeakerAudioDestination(),
    id: Date.now().toString(),
    muted: true,
    alreadyPlayed: false,
  }
}

async function setupSpeechConfig(): Promise<speechsdk.SpeechConfig> {
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
  return speechConfig
}

async function synthesizeSpeech(text: string, index: number) {
  console.log('Synthesizing speech for index', index)
  if (text === '') {
    return
  }
  let audioPlayer = newAudioPlayer()
  if (index !== -1 && index !== -2) {
    prevAudioPlayer.value = getAudioPlayer(index)
    audioPlayer.player = configureAudioPlayer(index).player
    chatHistory.messages[index].audioPlayer = audioPlayer
  } else if (index === -2) {
    readAloudAudioPlayer.value = configureReadAloudAudioPlayer(audioPlayer)
  }
  await speak(text, index, audioPlayer.player)
}

async function speak(textToSpeak: string, index: number, player: speechsdk.SpeakerAudioDestination): Promise<void> {
  const audioConfig = speechsdk.AudioConfig.fromSpeakerOutput(player)
  const speechConfig = await setupSpeechConfig()
  let synthesizer = new speechsdk.SpeechSynthesizer(speechConfig, audioConfig)
  // Events are raised as the output audio data becomes available, which is faster than playback to an output device.
  // We must must appropriately synchronize streaming and real-time.
  synthesizer.speakTextAsync(
    textToSpeak,
    result => {
      let text
      if (result.reason === speechsdk.ResultReason.SynthesizingAudioCompleted) {
        if (index === -1) {
          // no additional action required for direct responses
        } else if (index === -2) {
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
  if (chatHistory.messages[index].message.role === 'assistant') {
    // reverse order (user prompt next in list)
    if (chatHistory.messages[index + 1].audioPlayer.muted === false) {
      console.log("User hasn't finished listening to the prompt, stop playing the assistant response")
      // Pause the assistant until the user has finished listening to the prompt
      chatHistory.messages[index].audioPlayer.player.pause()
      chatHistory.messages[index].audioPlayer.muted = true
      return true
    }
  }
  return false
}

function configureAudioPlayer(index: number): AudioPlayer {
  let audioPlayer = newAudioPlayer()
  audioPlayer.player.onAudioEnd = audioPlayer => {
    window.console.log('Audio track ended')
    audioPlayer.pause()
    // reverse order
    chatHistory.messages[index].audioPlayer.muted = true
    chatHistory.messages[index + 1].audioPlayer.muted = true

    // if (chatHistory.messages[index].message.role === 'assistant') {
    //   chatHistory.messages[index].audioPlayer.muted = true
    //   chatHistory.messages[index].audioPlayer.alreadyPlayed = true
    // } else {
    //   chatHistory.messages[index - 1].audioPlayer.muted = true
    //   chatHistory.messages[index - 1].audioPlayer.alreadyPlayed = true
    // }
    // play assistant response after reading the user prompt
    // reverse order so we focus the same index as we insert at the start with unshift
    // window.console.log('Index', index)
    // window.console.log('Condition check 1', chatHistory.messages[index])
    // window.console.log('Condition check 2', chatHistory.messages[index].message.role === 'assistant')
    // window.console.log('Condition check 3', !chatHistory.messages[index].audioPlayer.alreadyPlayed)
    if (
      chatHistory.messages[0] &&
      chatHistory.messages[0].message.role === 'assistant' &&
      !chatHistory.messages[0].audioPlayer.alreadyPlayed
    ) {
      // reverse order
      let nextAudioPlayer = getAudioPlayer(0)
      nextAudioPlayer.player.resume()
      nextAudioPlayer.muted = false
      // reverse order
      focusPauseButton(0)
    }
    chatHistory.messages[index].audioPlayer.alreadyPlayed = true
  }

  audioPlayer.player.onAudioStart = () => {
    window.console.log('Audio track started')
    // window.console.log(audioPlayer)
    prevAudioPlayer.value.player.pause()
    if (chatHistory.messages[index].message.role === 'user') {
      focusPauseButton(index)
    }
    const isStillPlaying = ifUserAnswerIsBeingReadAloud(index)
    if (isStillPlaying) {
      return
    }
    let currentTime = prevAudioPlayer.value.player.currentTime
    if (currentTime !== -1 && !voiceSynthesisStartOver.value) {
      window.console.log('ARE WE GETTING IN HERE??', audioPlayer)
      // round to 2 decimal places
      audioPlayer.player.internalAudio.currentTime = Math.round(currentTime * 100) / 100
    }
    if (voiceSynthesisStartOver.value) {
      voiceSynthesisStartOver.value = false
    }
    chatHistory.messages[index].audioPlayer.muted = false
    if (chatHistory.messages[index].message.role === 'assistant') {
      focusPauseButton(index)
    } else {
      // we already received an assistant response so the index shifts by 1
      focusPauseButton(index + 1)
    }
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

function setResponse(response: string) {
  // reverse order
  chatHistory.messages[getLastEntryIndex()].message.content = response
}

async function focusPauseButton(index: number) {
  if (index < 0) {
    return
  }
  // reverse order
  // if (chatHistory.messages[index].message.role === 'assistant' && !chatHistory.messages[index + 1].audioPlayer.muted) {
  //   return
  // }

  await nextTick()
  // nextTick() to update DOM and show Overlay before focusing on the pause button
  let playPauseButton = document.getElementById('playPauseButton' + index)
  if (playPauseButton) {
    playPauseButton.focus()
  }
}

function removeHtmlTags(content: string) {
  return content.replace(/<[^>]*>/g, '')
}

function pausePlayer(audioPlayer: AudioPlayer): void {
  audioPlayer.player.pause()
  audioPlayer.muted = true
  console.log('Pausing player', audioPlayer)
}

function muteAllAudioplayers(): void {
  chatHistory.messages.forEach((message: ChatMessage) => {
    if (message.audioPlayer && !message.audioPlayer.muted) {
      message.audioPlayer.muted = true
    }
  })
}

function resumePlayer(audioPlayer: AudioPlayer): void {
  audioPlayer.player.resume()
  audioPlayer.muted = false
  audioPlayer.alreadyPlayed = true
  console.log('Resuming player', audioPlayer)
}

function handlePause(entry: ChatMessage, index: number) {
  if (!entry.audioPlayer.muted) {
    console.log('regular pause')
    pausePlayer(entry.audioPlayer)
    return
  }
  if (!entry.message.html) {
    console.log('regular resume')
    resumePlayer(entry.audioPlayer)
    return
  }
  // Structured response handling
  if (entry.message.showHtml) {
    if (voiceResponse.value === entry.message.contentHtml) {
      resumePlayer(entry.audioPlayer)
    } else {
      voiceSynthesisStartOver.value = true
      resynthesizeAudio.value = true
      synthesizeSpeech(entry.message.contentHtml, index)
      voiceResponse.value = entry.message.contentHtml
    }
  } else {
    if (voiceResponse.value === entry.message.content) {
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
  // We are working with a new audio player object
  if (typeof entry.audioPlayer.player.pause === 'function') {
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

function generateReadableHTML(entry: ChatMessage): void {
  let html = entry.message.html
  if (html === undefined) {
    return
  }
  entry.message.contentHtml = generateReadableTextFromHTML(html)
}

function readLastAnswer(): void {
  let lastAssistantResponseIndex = getLastAssistantResponseIndex()
  if (typeof chatHistory.messages[lastAssistantResponseIndex].audioPlayer.player.resume === 'function') {
    if (chatHistory.messages[lastAssistantResponseIndex].audioPlayer.alreadyPlayed) {
      chatHistory.messages[lastAssistantResponseIndex].audioPlayer.player.resume()
      chatHistory.messages[lastAssistantResponseIndex].audioPlayer.muted = false
      focusPauseButton(lastAssistantResponseIndex)
      return
    }
  }
  synthesizeSpeech(chatHistory.messages[lastAssistantResponseIndex].message.content, lastAssistantResponseIndex)
}

function showDrawer(bool: boolean) {
  drawer.value = bool
}

function clearDocument() {
  chatHistory.messages = []
  messages.value = []
  messageInteractionCounter.value = 0
  input.value = ''
  editorContent.value = ''
  voiceResponse.value = ''
  activeSession.value = {
    id: activeSession.value.id,
    chatHistory: { messages: [] as ChatMessage[] },
    editorContent: '',
  }
  storeSession(activeSession.value)
}

function createNewDocument() {
  storeSession(getActiveSession())
  const newSession = {
    id: Date.now().toString(),
    chatHistory: { messages: [] as ChatMessage[] },
    editorContent: '',
  }
  activeSession.value = newSession
  sessions.value.push(newSession)
  clearDocument()
  showDrawer(false)
}

function clearAllDocuments() {
  sessions.value = []
  localStorage.setItem('sessions', JSON.stringify([]))
  createNewDocument()
}

// function downloadHtml() {
//   const iframe = document.getElementsByTagName('iframe')[0]
//   const doc = iframe.contentDocument
//   // get the body of the doc
//   const body = doc.getElementsByTagName('body')[0]
//   // get the html of the body
//   const src = body.innerHTML
//   getWordDoc(src)
// }
// async function getWordDoc(src: string) {
//   const { body } = await $fetch('/api/pandoc', {
//     method: 'post',
//     body: { html: src },
//   })
//   console.log(body)
// }

// fetch selected text from the text editor every second
if (process.client) {
  function getSelectionText() {
    if (!editor.value) {
      // editor not loaded yet
      return
    }
    const range = editor.value.getSelection().getRanges()[0]
    if (range === undefined) {
      // no selection
      return
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
      return
    }
    if (synonyms.length > 5) {
      synonyms = synonyms.slice(0, 5)
    }
    registerActionsWithSynonyms(editor.value, submitSelectedCallback, synonyms)
  }
  setInterval(getSelectionText, 1000)
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
                <chat-messages :messages="chatHistory.messages" @paste="paste" @pause="pause" />
              </div>
            </div>
            <chat-controls @read-last-answer="readLastAnswer" />
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
              @pause-read-aloud="pause"
              @toggle-read-only="toggleReadOnly"
              @clear-editor-content="clearEditorContent"
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
