# Writing Assistant
This app has been developed as a text and speech-based writing assistance prototype “Writing Assistant” built on OpenAIs GPT models to create first structured drafts, converse about the document, and simplify the editing and formatting process.


*It is desiged to facilitate the scientific writing experience for users with a visual impairment.*

It provides the ability to interact with a conversational chatbot (using GPT-3.5 Turbo and GPT-4) and an accessible text editor ([A11yFirst CKEditor](https://github.com/a11yfirst/distribution)) through a simple and accessible interface. 

![image](https://github.com/StefanoAnzolut/writing-assistant/assets/45556885/47870af3-d1e0-4477-941c-bda0baf59263)


## Environment Variables
As it uses Microsoft Azure OpenAI Services and AI Speech Services three variables need to be set to run the app smoothly.
- AZURE_API_KEY to use the Microsoft Azure OpenAI Services
- AZURE_SPEECH_API_KEY to use AI Speech Services
- AZURE_SPEECH_REGION to use AI Speech Services

## Setup
Make sure to install the dependencies:
```bash
npm install
```
Start the development server on `http://localhost:3000`:
```bash
# npm
npm run dev
```
