<script setup lang="ts">
import { useChat } from 'ai/vue'

const { messages, input, handleSubmit } = useChat({
  headers: { 'Content-Type': 'application/json' },
})

</script>

<!-- 
<script lang="ts">
export default {
  // `setup` is a special hook dedicated for the Composition API.
  setup() {
    let editor_content = ref('')

    function updateEditorContent(newData: string) {
      editor_content = ref(newData)
    }
    function submit() {
      console.log(editor_content.value)
      console.log(input.value)
      handleSubmit(input.value + "\n" + editor_content.value)
    }
    return {
        editor_content,
        submit,
        updateEditorContent
    }
  }
}
</script> -->

<script lang="ts">

export default {
    data() {
        return {
            editor_content: '',
        }  
    },
    methods: {
        onEditorUpdate(newData: string) {
            console.log(this.editor_content)
            this.editor_content = newData
        },
        submit() {
            console.log(this.editor_content)
            console.log(input)
            handleSubmit(input + "\n" + this.editor_content)
        },
    }
}
</script>

<template>
    <v-container>
        <v-row>
            <v-col cols="3">
                <div class="card">
                    <h2 class="card-title">Chat</h2>
                    <div class="card-text">
                        <div class="chat">
                            <div v-for="m in messages" key="m.id" class="chat-message">
                            {{ m.role === 'user' ? 'User: ' : 'AI: ' }}
                            {{ m.content }}
                            </div>

                            <form @submit="handleSubmit">
                            <input
                                class="chat-input"
                                v-model="input"
                                placeholder="Say something..."
                            />

                            </form>
                        </div>
                    </div>
                </div>
            </v-col>
            <v-col cols="9">
                <div class="card">
                    <h2 class="card-title">Editor</h2>
                    <div class="card-text">
                        <ckeditor @update="onEditorUpdate"/>
                    </div>
                </div>
            </v-col>
        </v-row>
    </v-container>
  
</template>

<style scoped>
.chat{
    width: 100%; 
    max-width: 28rem;
    background-color: antiquewhite;
    border: #000000 2px solid;
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