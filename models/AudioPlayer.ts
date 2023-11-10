import type { SpeakerAudioDestination } from 'microsoft-cognitiveservices-speech-sdk'

export interface AudioPlayer {
  player: SpeakerAudioDestination
  muted: boolean
  alreadyPlayed: boolean
}
