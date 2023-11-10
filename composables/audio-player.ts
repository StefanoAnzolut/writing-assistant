import type { AudioPlayer } from '~/models/AudioPlayer'

export async function pause(audioPlayer: AudioPlayer) {
  if (!audioPlayer.muted) {
    audioPlayer.player.pause()
    audioPlayer.muted = true
  } else {
    audioPlayer.player.resume()
    audioPlayer.muted = false
  }
}
export async function stop(audioPlayer: AudioPlayer) {
  audioPlayer.player.pause()
  // stopping the audio by setting currentTime of the internal media element to the media duration e.g. fast forwarding the track to the end.
  audioPlayer.player.internalAudio.currentTime = audioPlayer.player.internalAudio.duration
  audioPlayer.muted = true
}

export async function replayAudio(audioPlayer: AudioPlayer) {
  audioPlayer.player.pause()
  audioPlayer.player.resume()
}
