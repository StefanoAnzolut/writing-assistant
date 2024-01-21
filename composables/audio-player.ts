import type { AudioPlayer } from '~/models/AudioPlayer'
import type { ChatMessage } from '~/models/ChatMessage'
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk'

export function newAudioPlayer(): AudioPlayer {
  return {
    player: new speechsdk.SpeakerAudioDestination(),
    id: Date.now().toString(),
    muted: true,
    alreadyPlayed: false,
    isPlaying: false,
    resynthesizeAudio: false,
  }
}

export function updateAudioPlayer(chatMessage: ChatMessage): AudioPlayer {
  return {
    player: new speechsdk.SpeakerAudioDestination(),
    id: Date.now().toString(),
    muted: true,
    alreadyPlayed: chatMessage && chatMessage.audioPlayer.alreadyPlayed === true ? true : false,
    isPlaying: false,
    resynthesizeAudio: false,
  }
}

export function getAudioPlayer(chatMessage: ChatMessage): AudioPlayer {
  return chatMessage.audioPlayer
}

export function pausePlayer(audioPlayer: AudioPlayer): void {
  audioPlayer.player.pause()
  audioPlayer.muted = true
}

export function resumePlayer(audioPlayer: AudioPlayer): void {
  audioPlayer.player.resume()
  audioPlayer.muted = false
  audioPlayer.alreadyPlayed = true
  // additional pause, as the onAudioEnd does not fire for resynthesized audioPlayers
  pausePlayerAfterTimeout(audioPlayer)
}

export function pausePlayerAfterTimeout(audioPlayer: AudioPlayer) {
  // Small magic to wait, as internalAudio.duration is not available immediately
  // to addtionaly pause the audioPlayer after the audio has finished playing,
  // as for some unknown reason the onAudioEnd does not fire for resynthesized audioPlayers
  // https://github.com/microsoft/cognitive-services-speech-sdk-js/issues/699
  setTimeout(() => {
    setTimeout(() => {
      if (audioPlayerAtEnd(audioPlayer)) {
        pausePlayer(audioPlayer)
      }
    }, audioPlayer.player.internalAudio.duration * 1000)
  }, 200)
}

export function audioPlayerAtEnd(audioPlayer: AudioPlayer): boolean {
  if (!validAudioPlayer(audioPlayer) || !audioPlayer.player.internalAudio) {
    return false
  }
  const timeDelta = audioPlayer.player.internalAudio.duration - audioPlayer.player.internalAudio.currentTime
  return audioPlayer.player.internalAudio.duration > 0 && timeDelta < 0.5
}

export function validAudioPlayer(audioPlayer: AudioPlayer): boolean {
  return audioPlayer?.player?.pause && typeof audioPlayer.player.pause === 'function'
}

export function playAssistantAnswerInResponseToUserPrompt(chatMessage: ChatMessage, index: number): void {
  if (chatMessage && chatMessage.message.role === 'assistant' && !chatMessage.audioPlayer.alreadyPlayed) {
    // reverse order
    let nextAudioPlayer = getAudioPlayer(chatMessage)
    nextAudioPlayer.player.resume()
    nextAudioPlayer.muted = false
    // reverse order
    focusPauseButton(index)
  }
}
