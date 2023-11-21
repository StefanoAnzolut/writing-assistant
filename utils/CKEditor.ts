export const actions = [
  {
    name: 'summarize',
    label: 'Summarize',
    prompt:
      'Summarize the following content and make it such that the response can immediately be added to a text editor: ',
  },
  {
    name: 'checkSpelling',
    label: 'Spell check',
    prompt:
      'Spell check the following content and only return the corrected version, do not include other information.  ',
  },
  {
    name: 'simplify',
    label: 'Simplify',
    prompt:
      'Simplify the following content and make it such that the response can immediately be added to a text editor: ',
  },
  {
    name: 'readAloud',
    label: 'Read Aloud',
    prompt: 'READ',
  },
  {
    name: 'findSynonyms',
    label: 'Find synonyms',
    prompt:
      'Find synonyms for the following content and make it such that the response can immediately be added to a text editor: ',
  },
  {
    name: 'reformulate',
    label: 'Formulate differently',
    prompt:
      'Reformulate the following content and make it such that the response can immediately be added to a text editor: ',
  },
  {
    name: 'concise',
    label: 'Make more concise',
    prompt:
      'Concise the following content and make it such that the response can immediately be added to a text editor: ',
  },
  {
    name: 'addStructure',
    label: 'Add structure',
    prompt:
      'Add structure to the following content and make it such that the response can immediately be added to a text editor: ',
  },
  {
    name: 'giveWritingAdvice',
    label: 'Give scientific writing advice',
    prompt:
      'Give writing advice for the following content and make it such that the response can immediately be added to a text editor: ',
  },
  {
    name: 'adaptToScientificStyle',
    label: 'Reformulate to scientific style',
    prompt:
      'Adapt to scientific style the following content and make it such that the response can immediately be added to a text editor Selection start marker:',
  },
  {
    name: 'askQuestion',
    label: 'Ask your custom question',
    prompt: 'STORE',
  },
]
//

export function removeFormElementRoles() {
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

export function registerActions(
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

// const menuWithSubmenu = [
//   {
//     name: 'modify',
//     label: 'Modify',
//     items: [
//       {
//         name: 'summarize',
//         label: 'Summarize',
//         prompt:
//           'Summarize the following content and make it such that the response can immediately be added to a text editor: ',
//       },
//       {
//         name: 'checkSpelling',
//         label: 'Check spelling',
//         prompt:
//           'Check spelling for the following content and make it such that the response can immediately be added to a text editor: ',
//       },
//       {
//         name: 'reformulate',
//         label: 'Reformulate',
//         prompt:
//           'Reformulate the following content and make it such that the response can immediately be added to a text editor: ',
//       },
//       {
//         name: 'concise',
//         label: 'Make concise',
//         prompt:
//           'Concise the following content and make it such that the response can immediately be added to a text editor: ',
//       },
//       {
//         name: 'addStructure',
//         label: 'Add structure',
//         prompt:
//           'Add structure to the following content and make it such that the response can immediately be added to a text editor: ',
//       },
//       {
//         name: 'adaptToScientificStyle',
//         label: 'Adapt to scientific style',
//         prompt:
//           'Adapt to scientific style the following content and make it such that the response can immediately be added to a text editor Selection start marker:',
//       },
//     ],
//   },
//   {
//     name: 'ask',
//     label: 'Ask',
//     items: [
//       {
//         name: 'define',
//         label: 'Define',
//         prompt:
//           'Define the following content and make it such that the response can immediately be added to a text editor: ',
//       },
//       {
//         name: 'findSynonyms',
//         label: 'Find synonyms',
//         prompt:
//           'Find synonyms for the following content and make it such that the response can immediately be added to a text editor: ',
//       },
//       {
//         name: 'giveWritingAdvice',
//         label: 'Give writing advice',
//         prompt:
//           'Give writing advice for the following content and make it such that the response can immediately be added to a text editor: ',
//       },
//       {
//         name: 'describeFormatting',
//         label: 'Describe formatting',
//         prompt:
//           'Focus only on the formatting of the following content and accurately return the description of the formatting structure only, do not add unseen formatting, do not return your answer as a list. Selection start marker:',
//       },
//       {
//         name: 'askQuestion',
//         label: 'Your custom question',
//         prompt: 'STORE',
//       },
//     ],
//   },
// ]

// function registerActions(editor) {
//     let contextMenuListener = {}
//     contextMenu.menuWithSubmenu.forEach(function (group) {
//       editor.addMenuGroup(group.name)
//       let groupObj = {
//         [group.name]: {
//           label: group.label,
//           group: group.name,
//           getItems: function () {
//             let ItemsObj = {}
//             group.items.forEach(function (item) {
//               ItemsObj[item.name] = CKEDITOR.TRISTATE_OFF
//             })
//             return ItemsObj
//           },
//         },
//       }
//       // add each item to the groupObject
//       group.items.forEach(function (item) {
//         // create the command we want to reference and add it to the editor instance
//         editor.addCommand(item.name, {
//           exec: function (editor) {
//             submitSelected(new Event('submit'), item.prompt)
//           },
//         })
//         groupObj[item.name] = {
//           label: item.label,
//           group: group.name,
//           command: item.name,
//         }
//       })
//       editor.addMenuItems(groupObj)
//       contextMenuListener[group.name] = CKEDITOR.TRISTATE_OFF
//     })
//     editor.contextMenu.addListener(function (element) {
//       return contextMenuListener
//     })
//   }
