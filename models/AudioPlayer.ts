import type { SpeakerAudioDestination } from 'microsoft-cognitiveservices-speech-sdk'

export interface AudioPlayer {
  id: string
  player: SpeakerAudioDestination
  muted: boolean
  isPlaying: boolean
  alreadyPlayed: boolean
  resynthesizeAudio: boolean
}
