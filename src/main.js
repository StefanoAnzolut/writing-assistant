/**
 * main.js
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Components
import App from './App.vue'
import CKEditor from '@ckeditor/ckeditor5-vue';
import TextEditor from './components/TextEditor.vue'

// Composables
import { createApp } from 'vue'

// Plugins
import { registerPlugins } from '@/plugins'

const app = createApp(App)

registerPlugins(app)

app.component('TextEditor', TextEditor)

app.use( CKEditor )

app.mount('#app')
