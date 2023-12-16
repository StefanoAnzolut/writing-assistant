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
const { messages, input, handleSubmit, setMessages } = useChat({
  headers: { 'Content-Type': 'application/json' },
})

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
const directResponseIndex = -1
const readAloudPlayerIndex = -2
const invalidCurrentTime = -1

const HTML_EXTRACTION_PLACEHOLDER =
  'Generated a structured response. Expand it using the expand button and let it be read to you with play or paste it to the text editor directly.'

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
    ck.editor.removeMenuItem('cut')
    ck.editor.removeMenuItem('copy')
    ck.editor.removeMenuItem('paste')
    registerActions(ck.editor, submitSelectedCallback)
    removeFormElementRoles()
    editor.value = ck.editor
  })

  // Element is not yet available, so we need to wait a bit (150 ms should be enough but not for Firefox)
  window.navigator.userAgent.includes('Firefox') ? removeExtraComponents(700) : removeExtraComponents(350)
}

function removeExtraComponents(sleepTimer: number = 350) {
  setTimeout(() => {
    let toolbar = document.getElementsByClassName('cke_top')
    toolbar[0].setAttribute('style', 'display: none')

    let bottomBar = document.getElementsByClassName('cke_bottom')
    bottomBar[0].setAttribute('style', 'display: none')

    let textAreaElements = document.getElementsByClassName('cke_contents cke_reset')
    textAreaElements[0].setAttribute('style', 'height: 80vh !important;')

    let textAreaForm = document.getElementsByTagName('TEXTAREA')
    textAreaForm[0].remove()
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
    // set editor to read only mode
    // toggleReadOnly(readOnly.value)
  }
}

/** Text completion submission wrapper */
function submit(e: any): void {
  if (input.value === '') {
    input.value = input.value.concat(editorContent.value)
  }
  if (selectedText.value !== '') {
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

/** Submission wrapper for the callback action of the context menu */
function submitSelectedCallback(event: Event, prompt: string, selectedTextFromEditor: string) {
  const range = editor.value.getSelection().getRanges()[0]
  if (range === undefined) {
    // no selection
    return
  }
  selectedTextProperties.value = {
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    context: getInnerHTMLForTextSnippetFromRange(range),
  }
  actions.forEach(action => {
    if (action.prompt === prompt) {
      lastContextMenuAction.value = action.name
    }
  })
  console.log(selectedTextFromEditor)
  // Setting the selected text from the text editor to the shared state
  selectedTextFromEditor = decodeHtml(selectedTextFromEditor)
  selectedText.value = selectedTextFromEditor
  // const selected = window.getSelection()

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
    input.value = input.value.concat(prompt + decodeHtml(selectedTextProperties.value.context))
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
    console.log('Normal callback flow')
    console.log('selectedTextFromEditor:', selectedTextFromEditor)
    console.log('prompt:', prompt)
    input.value = input.value.concat(prompt + selectedTextFromEditor)
  }
  try {
    handleSubmit(event)
  } catch (e) {
    console.log(e)
  }
}

function removeSelection() {
  selectedText.value = ''
}

function getInnerHTMLForTextSnippetFromRange(range: any): string {
  const startContainerParent = range.startContainer.$.parentElement
  const endContainerParent = range.endContainer.$.parentElement
  console.log(range)
  console.log(startContainerParent.isEqualNode(endContainerParent))
  if (startContainerParent.isEqualNode(endContainerParent)) {
    return decodeHtml(startContainerParent.outerHTML.replace('<br>', ''))
  }
  const outerHtmlStart = getTextFromParentElement(startContainerParent)
  const outerHtmlEnd = getTextFromParentElement(endContainerParent)
  let documentInner = range.document.$.body.innerHTML
  console.log(outerHtmlStart)
  console.log(outerHtmlEnd)
  console.log(documentInner.indexOf(outerHtmlStart))
  console.log(documentInner.lastIndexOf(outerHtmlEnd) + outerHtmlEnd.length)
  let outerHtmlForRange = documentInner.substring(
    documentInner.indexOf(outerHtmlStart),
    documentInner.lastIndexOf(outerHtmlEnd) + outerHtmlEnd.length
  )
  // remove html char codes and symbols that appear when copy pasting from different locations
  return decodeHtml(outerHtmlForRange)
}

function getTextFromParentElement(parentElement) {
  const textSectionParent = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL']
  if (textSectionParent.some(p => parentElement.tagName.includes(p))) {
    // replace <br> which can appear out of nowhere for the text editor
    return decodeHtml(parentElement.outerHTML.replace('<br>', ''))
  }
  return getTextFromParentElement(parentElement.parentElement)
}

function preprocessUserMessage(message: Message): Message {
  message.content = message.content.replace('<text>', '').replace('</text>', '')
  if (message.content.includes('Spell check the following content')) {
    message.content = 'Spell checking your highlighted text.'
  }
  message.content = message.content.replace('Spell check the following content', '').replace('</text>', '')
  return message
}

/** As we have modified the chat reponse to include the finish_reason to mark the end of the stream. We need to have some pre-processing. */
function preprocessMessage(message: Message): Message {
  responseFinished.value = isFinished(message.content)
  message.content = message.content.replace('2:"[{\\"done\\":true}]"', '')
  message.content = message.content.trim()
  // if (message.content.includes('[MODIFIED_USER_INPUT]:') && message.content.includes('[CORRECTIONS]:')) {
  // message.content = handleSpellChecking(message.content)
  // handleSpellChecking(message)
  // }
  return message
}

function handleSpellChecking(assistantResponse: string): string {
  let chatMessage = getLastEntry()
  let regex = /\[MODIFIED_USER_INPUT\]:(.*?)\[CORRECTIONS\]:/s
  let match = assistantResponse.match(regex)
  console.log(match)
  if (match && match[1]) {
    assistantResponse = assistantResponse.replace(match[1], '')
    // if (lastContextMenuAction.value === 'checkSpelling') {
    chatMessage.message.html = match[1].trim()
    // lastContextMenuAction.value = ''
    // handleModificationRequest(match[1].trim())
    // }
  }
  // content = content.replace('[MODIFIED_USER_INPUT]:', '')
  assistantResponse = assistantResponse.replace(
    '[CORRECTIONS]:',
    'Here are the corrections, use the paste button to apply them.'
  )
  if (assistantResponse.includes('[USER_INPUT]')) {
    assistantResponse = assistantResponse.replace(/\[USER_INPUT\](.*)$/s, '')
  }
  return assistantResponse.trim()
}

function isFinished(message: string) {
  return message.includes('2:"[{\\"done\\":true}]"')
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

function removeCallbackActionPrefix(content: string): string {
  if (
    content.includes('the following content and re-use valid html tags that were given as input.:\n [USER_INPUT]:\n')
  ) {
    content = content.replace(
      'the following content and re-use valid html tags that were given as input.:\n [USER_INPUT]:\n',
      ''
    )
  } else if (
    content.includes(
      `only re-use given html tags and provide a numbered list of all corrections made.
    If no correction are needed, reply with "No corrections were needed". For every correction say "Corrected {missspelled word} to {correctly spelled word}".
    Answer formatting should be as follows for this request only:
    [MODIFIED_USER_INPUT]: {Your answer here}
    [CORRECTIONS]: {List of corrections here}
    [USER_INPUT]: `
    )
  ) {
    content = content.replace(
      `only re-use given html tags and provide a numbered list of all corrections made.
    If no correction are needed, reply with "No corrections were needed". For every correction say "Corrected {missspelled word} to {correctly spelled word}".
    Answer formatting should be as follows for this request only:
    [MODIFIED_USER_INPUT]: {Your answer here}
    [CORRECTIONS]: {List of corrections here}
    [USER_INPUT]: `,
      ''
    )
  }

  if (content.includes('[MODIFICATION_REQUEST]: ')) {
    content = content.replace('[MODIFICATION_REQUEST]: ', '')
  }
  return content
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
    audioPlayer: {
      player: new speechsdk.SpeakerAudioDestination(),
      id: Date.now().toString(),
      muted: true,
      alreadyPlayed: false,
    },
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
    message = preprocessMessage(message)
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
        // Check if we can keep the order for messages
        if (!messages.value[messages.value.length - 1].content.includes('<ai-response>')) {
          newMessage.content = "Understood, I'm processing your prompt, hold on. This might take a while."
        }
        addToChatHistory(newMessage)
        synthesizeSpeech(newMessage.content, getLastEntryIndex())
        voiceSynthesisOnce.value = true
        let tempEntry = getLastEntry()
        tempEntry.message.new = false
        // intervalId.value = setInterval(() => {
        //   synthesizeSpeech(newMessage.content, getLastEntryIndex())
        // }, 5000)
      }
      // focusPauseButton(getLastAssistantResponseIndex())
    }, 5000)
    return
  }
  console.log('Assistant Answer')
  checkHTMLInResponse(message.content)
  addPrefixToAssistantResponse(chatMessage)
  if (chatMessage.message.content.length > 250 && chatMessage.message.new === true) {
    chatMessage.message.new = false
    if (chatMessage.message.content.includes('<ai-response>') || chatMessage.message.content.includes('<body>')) {
      return
    }
    addToVoiceResponse(chatMessage.message.content)
    synthesizeSpeech(chatMessage.message.content, getLastAssistantResponseIndex())
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
    const assistantResponse = chatHistory.messages[getLastEntryIndex()].message.content
    checkHTMLInResponse(assistantResponse)
    if (voiceResponse.value.includes(assistantResponse)) {
      return
    }
    if (assistantResponse.includes('<ai-response>')) {
      return
    }
    addToVoiceResponse(assistantResponse)
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
    if (lastContextMenuAction.value === 'checkSpelling') {
      assistantResponse = handleSpellChecking(assistantResponse)
    }
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
  //pre-processing:
  // remove char codes
  // remove html codes
  // filter out href link with attribute data-cke-saved-href
  return decodeHtmlCode(decodeHtmlCharCodes(str)).replace(/ data-cke-saved-href="[^"]*"/g, '')
}

function handleModificationRequest(content: string) {
  editorContent.value = decodeHtml(editorContent.value)
  selectedText.value = decodeHtml(selectedText.value)
  let textReplacementInContext = ''
  if (lastContextMenuAction.value === 'checkSpelling') {
    textReplacementInContext = selectedTextProperties.value.context.replace(
      selectedTextProperties.value.context,
      content.trim()
    )
  } else {
    console.log('selectedTextProperties.value.context:', selectedTextProperties.value.context)
    console.log('Selected text:', selectedText.value)
    console.log('inlcudes:', selectedTextProperties.value.context.includes(selectedText.value))
    textReplacementInContext = selectedTextProperties.value.context.replace(selectedText.value, content.trim())
  }
  console.log('textReplacementInContext:', textReplacementInContext)
  console.log('selectedTextProperties.value.context:', selectedTextProperties.value.context)
  console.log(
    'editorContent.value:',
    editorContent.value.replace(/>\s+|\s+</g, m => m.trim())
  )
  console.log(
    'includes:',
    editorContent.value.replace(/>\s+|\s+</g, m => m.trim()).includes(selectedTextProperties.value.context)
  )
  editorContent.value = editorContent.value
    .replace(/>\s+|\s+</g, m => m.trim())
    .replace(selectedTextProperties.value.context, decodeHtml(textReplacementInContext))
}

function paste(index: number) {
  const matchPrefix = chatHistory.messages[index].message.content.match(/Answer (\d+)\n([\s\S]*)/)
  if (!matchPrefix) {
    return
  }
  let replacementText = decodeHtml(matchPrefix[2])
  if (replacementText === 'No corrections were needed.') {
    synthesizeSpeech('Cannot paste, as no corrections were needed.', directResponseIndex)
    return
  }
  console.log(chatHistory.messages[index].message.html && /<[^>]*>/.test(chatHistory.messages[index].message.html))
  const isHtml =
    isHtmlAlreadyExtracted(replacementText) ||
    (chatHistory.messages[index].message.html && /<[^>]*>/.test(chatHistory.messages[index].message.html))
  if (isHtml) {
    console.log("it's html")
    console.log(chatHistory.messages[index].message.html)
    replacementText = decodeHtml(chatHistory.messages[index].message.html)
    console.log(replacementText)
  }
  if (IsInlineModification(lastContextMenuAction.value) && selectedText.value !== '') {
    handleModificationRequest(replacementText)
    console.log('PASTE___')
    console.log('editorContent:', editorContent.value)
    console.log('replacementText:', replacementText.trim())
    console.log('includes:', editorContent.value.trim().includes(replacementText.trim()))
    if (editorContent.value.trim().includes(replacementText.trim())) {
      synthesizeSpeech('Modified the selected content directly.', directResponseIndex)
    } else {
      synthesizeSpeech('Pasting content to end of text editor', directResponseIndex)
      editorContent.value += replacementText
      // scrollToBottomTextEditor()
    }
    return
  }

  if (isHtml) {
    synthesizeSpeech('Pasted structured to the text editor.', directResponseIndex)
    editorContent.value += replacementText
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

function newAudioPlayer(index: number): AudioPlayer {
  return {
    player: new speechsdk.SpeakerAudioDestination(),
    id: Date.now().toString(),
    muted: true,
    alreadyPlayed:
      chatHistory.messages[index] && chatHistory.messages[index].audioPlayer.alreadyPlayed === true ? true : false,
    resynthesizeAudio: false,
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
  if (text === '') {
    return
  }
  let audioPlayer = newAudioPlayer(index)
  if (index === directResponseIndex) {
    muteAllAudioplayers()
  } else if (index === readAloudPlayerIndex) {
    readAloudAudioPlayer.value = configureReadAloudAudioPlayer(audioPlayer)
  } else {
    prevAudioPlayer.value = getAudioPlayer(index)
    audioPlayer.player = configureAudioPlayer(index).player
    chatHistory.messages[index].audioPlayer = audioPlayer
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
  let audioPlayer = newAudioPlayer(index)
  audioPlayer.player.onAudioEnd = audioPlayer => {
    window.console.log('Audio track ended')
    audioPlayer.pause()
    // reverse order
    chatHistory.messages[index].audioPlayer.muted = true
    if (index - 1 > 0) {
      // sanity check
      chatHistory.messages[index - 1].audioPlayer.muted = true
    }
    if (chatHistory.messages[index].message.role === 'user') {
      chatHistory.messages[index].audioPlayer.alreadyPlayed = true
    }

    if (
      chatHistory.messages[getLastEntryIndex()] &&
      chatHistory.messages[getLastEntryIndex()].message.role === 'assistant' &&
      !chatHistory.messages[getLastEntryIndex()].audioPlayer.alreadyPlayed
    ) {
      // reverse order
      let nextAudioPlayer = getAudioPlayer(getLastEntryIndex())
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
    prevAudioPlayer.value.player.pause()
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
      !chatHistory.messages[index].message.html
    ) {
      window.console.log('ARE WE GETTING IN HERE??', audioPlayer)
      // round to 2 decimal places
      audioPlayer.player.internalAudio.currentTime = Math.round(currentTime * 100) / 100
    }
    if (voiceSynthesisStartOver.value) {
      voiceSynthesisStartOver.value = false
    }
    chatHistory.messages[index].audioPlayer.muted = false
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
  response = response.replace(/\[.*?\]:\s*/, '')
  chatHistory.messages[getLastEntryIndex()].message.content = response
}

async function focusPauseButton(index: number) {
  if (index < 0) {
    return
  }
  await nextTick()
  // nextTick() to update DOM and show Overlay before focusing on the pause button
  console.log('Focusing on the pause button on this index: ', index)
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

function validAudioPlayer(audioPlayer: AudioPlayer): boolean {
  return audioPlayer && audioPlayer.player && typeof audioPlayer.player.pause === 'function'
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

function resumePlayer(audioPlayer: AudioPlayer): void {
  muteAllAudioplayers()
  audioPlayer.player.resume()
  audioPlayer.muted = false
  audioPlayer.alreadyPlayed = true
}

function handlePause(entry: ChatMessage, index: number) {
  if (!entry.audioPlayer.muted) {
    pausePlayer(entry.audioPlayer)
    return
  }
  if (!entry.message.html) {
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
  // special case for read aloud
  if (index === readAloudPlayerIndex) {
    if (!readAloudAudioPlayer.value.muted) {
      pausePlayer(readAloudAudioPlayer.value)
      return
    } else {
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

function generateReadableHTML(entry: ChatMessage): void {
  let html = entry.message.html
  if (html === undefined) {
    return
  }
  entry.message.contentHtml = generateReadableTextFromHTML(html)
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

function downloadWord() {
  const iframe = document.getElementsByTagName('iframe')[0]
  const doc = iframe.contentDocument
  // get the body of the doc
  const body = doc.getElementsByTagName('body')[0]
  // get the html of the body
  const src = body.innerHTML
  getWordDoc(src)
}

async function getWordDoc(src: string) {
  await fetch('/api/pandoc', {
    method: 'POST',
    body: JSON.stringify({ html: src }),
  })
    .then(response => response.json())
    .then(data => {
      let base64Response = data.blob
      let fetchResponse = fetch(base64Response)
      fetchResponse
        .then(res => res.blob())
        .then(blob => {
          // Now you have a Blob object, you can use it as you wish
          console.log(blob)
          // Create a new blob object
          const newBlob = new Blob([blob], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          })

          // Create a link element
          const link = document.createElement('a')

          // Create an object URL for the blob
          const url = window.URL.createObjectURL(newBlob)

          // Set the link's href to the object URL
          link.href = url

          // Set the download attribute of the link to the desired file name
          link.download = 'Writing Assistant Document.docx'

          // Append the link to the body
          document.body.appendChild(link)

          // Programmatically click the link to start the download
          link.click()

          // Once the download has started, remove the link from the body
          document.body.removeChild(link)
        })
    })
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
      registerActionsWithSynonyms(editor.value, submitSelectedCallback, ['None found'])
      return
    }
    if (synonyms.length > 5) {
      synonyms = synonyms.slice(0, 5)
    }
    registerActionsWithSynonyms(editor.value, submitSelectedCallback, synonyms)
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
              @download-word="downloadWord"
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
