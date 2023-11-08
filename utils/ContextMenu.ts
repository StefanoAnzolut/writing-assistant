export const menuWithSubmenu = [
  {
    name: 'modify',
    label: 'Modify',
    items: [
      {
        name: 'summarize',
        label: 'Summarize',
        prompt:
          'Summarize the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'checkSpelling',
        label: 'Check spelling',
        prompt:
          'Check spelling for the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'reformulate',
        label: 'Reformulate',
        prompt:
          'Reformulate the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'concise',
        label: 'Make concise',
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
        name: 'adaptToScientificStyle',
        label: 'Adapt to scientific style',
        prompt:
          'Adapt to scientific style the following content and make it such that the response can immediately be added to a text editor Selection start marker:',
      },
    ],
  },
  {
    name: 'ask',
    label: 'Ask',
    items: [
      {
        name: 'define',
        label: 'Define',
        prompt:
          'Define the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'findSynonyms',
        label: 'Find synonyms',
        prompt:
          'Find synonyms for the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'giveWritingAdvice',
        label: 'Give writing advice',
        prompt:
          'Give writing advice for the following content and make it such that the response can immediately be added to a text editor: ',
      },
      {
        name: 'describeFormatting',
        label: 'Describe formatting',
        prompt:
          'Focus only on the formatting of the following content and accurately return the description of the formatting structure only, do not add unseen formatting, do not return your answer as a list. Selection start marker:',
      },
      {
        name: 'askQuestion',
        label: 'Your custom question',
        prompt: 'STORE',
      },
    ],
  },
]

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
