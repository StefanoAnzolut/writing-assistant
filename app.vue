<script setup lang="ts">
import { useChat } from 'ai/vue'
const { messages, input, handleSubmit } = useChat({
  headers: { 'Content-Type': 'application/json' },
})
const editorContent = ref('')

function submit(e: any): void {
    input.value = input.value.concat(editorContent.value);
    handleSubmit(e);
};

watch(messages, (newData): void => {
    console.log(newData)
    messages.value.forEach(function (message, idx, array) {
        if (message.role === 'assistant' && idx === array.length - 1){
            if (editorContent.value.includes("<p>Suggestion: ")){
                //remove all previous assistant responses that include the string above and end with <p> tag
                editorContent.value = editorContent.value.replace(/<p>Suggestion: .*<\/p>/g, `<p>Suggestion:  ${message.content} </p>`);
            } else {
                editorContent.value = editorContent.value.concat(`<p></p><p>Suggestion: ${message.content} </p>`);
            }
        }
    });
})
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
                            {{ m.role === 'user' ? 'User: ' : 'Writing Assistant: ' }}
                            {{ m.content }}
                            </div>

                            <form @submit="submit">
                            <input
                                id="chat-input"
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
                        <ckeditor v-model="editorContent" />
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