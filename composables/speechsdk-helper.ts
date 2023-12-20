import axios from 'axios'
import Cookie from 'universal-cookie'
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk'

/** The selected speaker for Text-To-Speech */
const selectedSpeaker = ref('Jenny')

/** Text to Speech */
export async function setupTTSConfig(): Promise<speechsdk.SpeechConfig> {
  const speechConfig = await getSpeechConfig()
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

/** Speech to Text */
export async function setupSpeechRecognizer(): Promise<speechsdk.SpeechRecognizer> {
  const speechConfig = await getSpeechConfig()
  speechConfig.speechRecognitionLanguage = 'en-US'
  // Speech_SegmentationSilenceTimeoutMs = 32
  // https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/propertyid?view=azure-node-latest
  speechConfig.setProperty(32, '3000')
  // Todo: Check additional effort to inlcude auto-detection of language
  return new speechsdk.SpeechRecognizer(speechConfig, speechsdk.AudioConfig.fromDefaultMicrophoneInput())
}

async function getSpeechConfig(): Promise<speechsdk.SpeechConfig> {
  const tokenObj = await getTokenOrRefresh()
  return speechsdk.SpeechConfig.fromAuthorizationToken(tokenObj.authToken, tokenObj.region)
}

export async function getTokenOrRefresh() {
  const cookie = new Cookie()
  const speechToken = cookie.get('speech-token')

  if (speechToken === undefined) {
    try {
      const res = await axios.get('/api/voice-4b9e3f2a-4d97-427a-8251-c521fbef01dd')
      const token = res.data.token
      const region = res.data.region
      cookie.set('speech-token', region + ':' + token, { maxAge: 540, path: '/' })
      return { authToken: token, region: region }
    } catch (err: any) {
      console.log(err.response.data)
      return { authToken: null, error: err.response.data }
    }
  } else {
    const idx = speechToken.indexOf(':')
    return { authToken: speechToken.slice(idx + 1), region: speechToken.slice(0, idx) }
  }
}
