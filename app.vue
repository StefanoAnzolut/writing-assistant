<script setup lang="ts">
import { useChat } from 'ai/vue'
import ContextMenu from '@imengyu/vue3-context-menu'
import '@imengyu/vue3-context-menu/lib/vue3-context-menu.css'

useHead({
  title: 'Writing Assistant',
  meta: [
    { name: 'An AI-powered writing assistant'}
  ],
})

const { messages, input, handleSubmit } = useChat({
  headers: { 'Content-Type': 'application/json' },
})
const editorContent = ref('')
const skipLink = ref()

const chatHistory = reactive([]);

function updateRefs(el, index) {
  chatHistory[index] = el;
}



function submit(e: any): void {
    if (input.value === "") {
        input.value = input.value.concat(editorContent.value);
    }
    handleSubmit(e);
};

function submitSelected(e: any, prompt: string){
    const selected = window.getSelection();
    if (selected.toString() === ""){
        return
    }
    input.value = input.value.concat(prompt + selected);
    handleSubmit(e);
}

watch(messages, (newData): void => {
    console.log(newData)
    messages.value.forEach(function (message, idx, array) {
        if (message.role === 'assistant' && idx === array.length - 1){
            if (editorContent.value.includes("<p>Suggestion: ")){
                //remove all previous assistant responses that include the string above and end with <p> tag
                editorContent.value = editorContent.value.replace(/<p>Suggestion: .*<\/p>/g, `<p>Suggestion:  ${message.content} </p>`);
                chatHistory[chatHistory.length - 1].focus();
            } else {
                editorContent.value = editorContent.value.concat(`<p></p><p>Suggestion: ${message.content} </p>`);
                chatHistory[chatHistory.length - 1].focus();
            }
        }
    });
})

function onContextMenu(e : MouseEvent) {
    //prevent the browser's default menu
    e.preventDefault();
    //show our menu
    ContextMenu.showContextMenu({
      x: e.x,
      y: e.y,
      items: [
        {
          label: "Summarize",
          onClick: () => {
            submitSelected(e, "Summarize the following content and make it such that the response can immediately be added to a text editor: ");
          }
        },
        {
            label: "Check spelling",
            onClick: () => {
              submitSelected(e, "Check spelling for the following content and make it such that the response can immediately be added to a text editor: ");
          }
        },
        {
            label: "Reformulate",
            onClick: () => {
              submitSelected(e, "Reformulate the following content and make it such that the response can immediately be added to a text editor: ");
          }
        },
        {
            label: "Adapt to scientific style",
            onClick: () => {
              submitSelected(e, "Adapt to scientific style the following content and make it such that the response can immediately be added to a text editor: ");
          }
        },
        {
            label: "Concise",
            onClick: () => {
              submitSelected(e, "Concise the following content and make it such that the response can immediately be added to a text editor: ");
          }
        },
        {
            label: "Add structure",
            onClick: () => {
              submitSelected(e, "Add structure to the following content and make it such that the response can immediately be added to a text editor: ");
          }
        },
        {
            label: "Define",
            onClick: () => {
              submitSelected(e, "Define the following content and make it such that the response can immediately be added to a text editor: ");
            }
        },
        {
            label: "Find synonyms",
            onClick: () => {
              submitSelected(e, "Find synonyms for the following content and make it such that the response can immediately be added to a text editor: ");
            }
        },
        {
            label: "Give writing advice",
            onClick: () => {
              submitSelected(e, "Give writing advice for the following content and make it such that the response can immediately be added to a text editor: ");
            }
        },
      ]
    });
  }
</script>

<template>
    <ul class="skip-links">
        <li>
            <a href="#chat-input" ref="skipLink" class="skip-link">Skip to chat</a>
        </li>
    </ul>
    <v-container>
        <v-row>
            <v-col cols="12">
                <h1>
                    <a href="#">
                        <img src=favicon.svg alt="Writing Assistant">
                    </a>
                </h1>
            </v-col>
        </v-row>
        <v-row>
            <v-col cols="3">
                <div class="card">
                    <h2 class="card-title">Chat</h2>
                    <div class="card-text">
                        <div class="chat">
                            <div v-for="(m, i) in messages" :index="i" key="m.id" class="chat-message" :ref="(el) => updateRefs(el, i)" tabindex="-1">
                                {{ m.role === 'user' ? 'User: ' : 'Writing Assistant: ' }}
                                {{ m.content }}
                            </div>
                            <form @submit="submit">
                            <input
                                id="chat-input"
                                class="chat-input"
                                v-model="input"
                                placeholder="Send a message"
                            />
                            </form>
                        </div>
                    </div>
                </div>
            </v-col>
            <v-col cols="8">
                <div class="card">
                    <h2 class="card-title">Editor</h2>
                    <div class="card-text" @contextmenu="onContextMenu($event)">
                        <ckeditor id="text-editor" v-model="editorContent"/>
                    </div>
                </div>
            </v-col>
        </v-row>
    </v-container>
</template>

<style scoped>
.skip-link {
  white-space: nowrap;
  margin: 1em auto;
  top: 0;
  position: fixed;
  left: 50%;
  margin-left: -72px;
  opacity: 0;
}
.skip-link:focus {
  opacity: 1;
  background-color: white;
  padding: 0.5em;
  border: 1px solid black;
}
.chat{
    width: 100%; 
    max-width: 28rem;
    background-color: antiquewhite;
    border: #000000 2px solid;
    display: flex;
    flex-direction: column;
    max-height: 50vh;
    overflow-y: scroll;
}
.chat-message{
    white-space: pre-wrap;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    border-bottom: #000000 1px solid;
}
.chat-input{
    bottom: 0; 
    padding: 0.5rem;
    padding-top: 2rem;
    border-radius: 0.25rem; 
    border-width: 1px; 
    border-color: #D1D5DB; 
    border-top: #000000 1px solid;
    width: 100%; 
    max-width: 28rem; 
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); 
}
</style>