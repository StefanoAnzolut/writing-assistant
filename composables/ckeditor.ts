export function toggleToolbar(): void {
  let toolbar = window.document.getElementsByClassName('cke_top')
  if (toolbar[0].getAttribute('style') === 'display: none') {
    toolbar[0].setAttribute('style', 'display: block')
  } else {
    toolbar[0].setAttribute('style', 'display: none')
  }
}

export function prepareCKEditor(
  editor: any,
  submitSelectedCallback: (event: Event, prompt: string, selectedTextFromEditor: string) => void
): void {
  editor.removeMenuItem('cut')
  editor.removeMenuItem('copy')
  editor.removeMenuItem('paste')
  registerActions(editor, submitSelectedCallback)
  removeFormElementRoles()
}

export function updateCKEditor(keyDownHandler: (event: KeyboardEvent) => void) {
  let toolbar = document.getElementsByClassName('cke_top')
  toolbar[0].setAttribute('style', 'display: none')

  let bottomBar = document.getElementsByClassName('cke_bottom')
  bottomBar[0].setAttribute('style', 'display: none')

  let textAreaElements = document.getElementsByClassName('cke_contents cke_reset')
  textAreaElements[0].setAttribute('style', 'height: 80vh !important;')

  let textAreaForm = document.getElementsByTagName('TEXTAREA')
  textAreaForm[0].remove()

  const editorIframe = document.getElementsByTagName('iframe')[0]
  if (editorIframe && editorIframe.contentWindow) {
    editorIframe.contentWindow.document.addEventListener('keydown', keyDownHandler)
  }
}

export function IsInlineModification(action: string): boolean {
  const modifcationActions = ['summarize', 'checkSpelling', 'simplify', 'reformulate', 'concise']
  return modifcationActions.includes(action)
}

export const actions = [
  {
    name: 'readAloud',
    label: 'Read Aloud',
    prompt: 'READ',
  },
  {
    name: 'checkSpelling',
    label: 'Spell check',
    prompt: `[MODIFICATION_REQUEST]: Spell check the following content, only re-use given html tags and provide a numbered list of all corrections that were made.
    If no correction are needed, reply with "No corrections were needed". For every correction say "Corrected {missspelled word} to {correctly spelled word}".
    Answer formatting should be as follows for this request only:
    [MODIFIED_USER_INPUT]: {Your answer here}
    [MODIFICATIONS]: {List of corrections here, each correction on a new line}
    [USER_INPUT]: `,
  },
  {
    name: 'summarize',
    label: 'Summarize',
    prompt: `[MODIFICATION_REQUEST]: Summarize the following content, only re-use given html tags and provide a numbered list of all things that were made shorter.
    If the text cannot be made simpler, reply with "Cannot summarize further".
    Answer formatting should be as follows for this request only:
    [MODIFIED_USER_INPUT]: {Your answer here}
    [MODIFICATIONS]: {List of modifications here, each modification on a new line}
    [USER_INPUT]: `,
  },
  {
    name: 'simplify',
    label: 'Simplify',
    prompt: `[MODIFICATION_REQUEST]: Simplify the following content, only re-use given html tags and provide a numbered list of all things that were made simpler.
    If the text cannot be made simpler, reply with "Cannot simplify text further".
    Answer formatting should be as follows for this request only:
    [MODIFIED_USER_INPUT]: {Your answer here}
    [MODIFICATIONS]: {List of modifications here, each modification on a new line}
    [USER_INPUT]: `,
  },
  {
    name: 'reformulate',
    label: 'Reformulate',
    prompt: `[MODIFICATION_REQUEST]: Reformulate the following content, only re-use given html tags and provide a numbered list of all things that were reformulated.
    Answer formatting should be as follows for this request only:
    [MODIFIED_USER_INPUT]: {Your answer here}
    [MODIFICATIONS]: {List of modifications here, each modification on a new line}
    [USER_INPUT]: `,
  },
  {
    name: 'findSynonyms',
    label: 'Find synonyms',
    prompt: 'SYNONYMS',
  },
  {
    name: 'askQuestion',
    label: 'Ask a question',
    prompt: 'STORE',
  },
]

function removeFormElementRoles() {
  nextTick()
  // Wait until the editor is loaded and remove form elements which overwhelm the screen reader user
  document.querySelectorAll('span > a').forEach(b => b.removeAttribute('role'))
  observeCKEditorPathAndRemoveDynamicFormElements()
}

function observeCKEditorPathAndRemoveDynamicFormElements() {
  // Select the node that will be observed for mutations
  const targetNode = document.getElementById('cke_1_path')
  if (!targetNode) {
    //The node we need does not exist yet.
    //Wait 500ms and try again
    window.setTimeout(observeCKEditorPathAndRemoveDynamicFormElements, 500)
    return
  }

  // Options for the observer (which mutations to observe)
  const config = { attributes: true, childList: true, subtree: true }

  // Callback function to execute when mutations are observed
  const callback = (mutationList, observer) => {
    for (const mutation of mutationList) {
      if (mutation.type === 'childList') {
        document.querySelectorAll('span > a').forEach(b => b.removeAttribute('role'))
      }
    }
  }

  // Create an observer instance linked to the callback function
  const observer = new MutationObserver(callback)

  // Start observing the target node for configured mutations
  observer.observe(targetNode, config)
}

function registerActions(
  editor: any,
  submitSelectedCallback: (event: Event, prompt: string, selected_text: string) => void
) {
  let contextMenuListener = {}
  actions.forEach(function (action) {
    editor.addMenuGroup('aiSuggestions')
    editor.addCommand(action.name, {
      exec: function (editor) {
        const range = editor.getSelection().getRanges()[0]
        const selected_fragment = range.cloneContents()
        const selected_text = selected_fragment.getHtml()
        // TODO: Check whether cursor position is relevant if so, maybe we can pass fragment etc.
        // let editorVar = CKEDITOR.instances.editor1
        // console.log(editorVar)
        // let editorData = editorVar.getData()
        // console.log('editorData', editorData)
        submitSelectedCallback(new Event('submit'), action.prompt, selected_text)
      },
    })
    editor.addMenuItem(action.name, {
      label: action.label,
      command: action.name,
      group: 'aiSuggestions',
    })
    contextMenuListener[action.name] = CKEDITOR.TRISTATE_OFF
  })
  editor.contextMenu.addListener(function (element) {
    return contextMenuListener
  })
}

export function updateRegisteredActionsWithSynonyms(
  editor: any,
  submitSelectedCallback: (event: Event, prompt: string, selected_text: string) => void,
  synonyms: string[] = []
) {
  let contextMenuListener = {}
  actions.forEach(function (action) {
    if (action.name === 'findSynonyms') {
      editor.addMenuGroup('thesaurus')
      let groupObj = {
        [action.name]: {
          label: action.label,
          group: 'thesaurus',
          getItems: function () {
            let ItemsObj = {}
            synonyms.forEach(function (item) {
              ItemsObj[item] = CKEDITOR.TRISTATE_OFF
            })
            return ItemsObj
          },
        },
      }
      // add each item to the groupObject
      synonyms.forEach(function (item) {
        if (item !== 'None found') {
          // create the command we want to reference and add it to the editor instance
          editor.addCommand(item, {
            exec: function (editor) {
              const range = editor.getSelection().getRanges()[0]
              const selected_fragment = range.cloneContents()
              const selected_text = selected_fragment.getHtml()
              submitSelectedCallback(new Event('submit'), 'Replace with:' + item, selected_text)
            },
          })
        } else {
          editor.addCommand(item, {
            exec: function (editor) {
              const range = editor.getSelection().getRanges()[0]
              const selected_fragment = range.cloneContents()
              const selected_text = selected_fragment.getHtml()
              submitSelectedCallback(new Event('submit'), 'No synonyms found', selected_text)
            },
          })
        }

        groupObj[item] = {
          label: item,
          group: 'thesaurus',
          command: item,
        }
      })
      editor.addMenuItems(groupObj)
      contextMenuListener['thesaurus'] = CKEDITOR.TRISTATE_OFF
    }
  })
  editor.contextMenu.addListener(function (element) {
    return contextMenuListener
  })
}

export function removeCallbackActionPrefix(content: string): string {
  // console.log('removeCallbackActionPrefix')
  // console.log(content)
  // console.log(content.includes(`provide a numbered list of all things that were made shorter.`))
  // console.log(content.includes(`provide a numbered list of all things that were made simpler.`))
  // console.log(content.includes(`provide a numbered list of all things that were reformulated.`))
  // console.log(content.includes(`provide a numbered list of all corrections made.`))

  if (content.includes(`provide a numbered list of all things that were made shorter.`)) {
    content = content.replace(
      `the following content, only re-use given html tags and provide a numbered list of all things that were made shorter.
    If the text cannot be summarized better, reply with "Cannot summarize further".
    Answer formatting should be as follows for this request only:
    [MODIFIED_USER_INPUT]: {Your answer here}
    [MODIFICATIONS]: {List of modifications here, each modification on a new line}
    [USER_INPUT]: `,
      ''
    )
  } else if (content.includes(`provide a numbered list of all things that were made simpler.`)) {
    content = content.replace(
      `only re-use given html tags and provide a numbered list of all things that were made simpler.
    If the text cannot be made simpler, reply with "Cannot simplify text further".
    Answer formatting should be as follows for this request only:
    [MODIFIED_USER_INPUT]: {Your answer here}
    [MODIFICATIONS]: {List of modifications here, each modification on a new line}
    [USER_INPUT]: `,
      ''
    )
  } else if (content.includes(`provide a numbered list of all things that were reformulated.`)) {
    content = content.replace(
      `the following content, only re-use given html tags and provide a numbered list of all things that were reformulated.
    Answer formatting should be as follows for this request only:
    [MODIFIED_USER_INPUT]: {Your answer here}
    [MODIFICATIONS]: {List of modifications here, each modification on a new line}
    [USER_INPUT]: `,
      ''
    )
  } else if (content.includes(`provide a numbered list of all corrections made.`)) {
    content = content.replace(
      `only re-use given html tags and provide a numbered list of all corrections made.
    If no correction are needed, reply with "No corrections were needed". For every correction say "Corrected {missspelled word} to {correctly spelled word}".
    Answer formatting should be as follows for this request only:
    [MODIFIED_USER_INPUT]: {Your answer here}
    [CORRECTIONS]: {List of corrections here, each correction on a new line}
    [USER_INPUT]: `,
      ''
    )
  }

  if (content.includes('[MODIFICATION_REQUEST]: ')) {
    content = content.replace('[MODIFICATION_REQUEST]: ', '')
  }
  console.log('removed prefixes?', content)
  return content
}
