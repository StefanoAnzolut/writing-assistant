export async function focusPauseButton(index: number) {
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

export async function focusReadAloudPauseButton() {
  await nextTick()
  let playPauseButtonReadAloudId = document.getElementById('playPauseButtonReadAloud')
  if (playPauseButtonReadAloudId !== null) {
    playPauseButtonReadAloudId.focus()
  } else {
    focusReadAloudPauseButton()
  }
}
