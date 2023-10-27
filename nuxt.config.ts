// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  build: {
    transpile: ['vuetify'],
  },
  css: [
    'vuetify/lib/styles/main.sass',
    '@mdi/font/css/materialdesignicons.min.css',
  ],
  devtools: { enabled: true },
  devServer: {
    port: 3000,
    host: '0.0.0.0'
  },
  plugins: [
    '~/plugins/vuetify.js',
  ],
})
