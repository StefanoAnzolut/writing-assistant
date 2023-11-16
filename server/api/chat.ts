import OpenAI from 'openai'
import { OpenAIStream, StreamingTextResponse, experimental_StreamData } from 'ai'
import { encoding_for_model } from '@dqbd/tiktoken'

//Returns the number of tokens in a text string
function numTokensFromString(message: string) {
  const encoder = encoding_for_model('gpt-3.5-turbo')
  const tokens = encoder.encode(message)
  encoder.free()
  return tokens.length
}

const apiKey = process.env.AZURE_API_KEY
const resource = 'mt-gpt4at'
const model = 'gpt35'
console.log('Current model is: ', model)
// Azure OpenAI requires a custom baseURL, api-version query param, and api-key header.
const openai = new OpenAI({
  apiKey,
  baseURL: `https://${resource}.openai.azure.com/openai/deployments/${model}`,
  defaultQuery: { 'api-version': '2023-07-01-preview' },
  defaultHeaders: { 'api-key': apiKey },
})

function checkContextLengthAndUpdateSlidingWindow(messages) {
  const reversedMessages = [...messages].reverse()
  let tokenCount = 0
  let finalMessages = []
  for (const message of reversedMessages) {
    const messageTokenCount = numTokensFromString(message.content)
    console.log(messageTokenCount)
    // If adding this message would exceed the token limit, stop processing
    if (tokenCount + messageTokenCount > 4000) {
      break
    }

    // Add the message to the final messages and increase the token count
    finalMessages.push(message)
    tokenCount += messageTokenCount
  }

  // Reverse the final messages so they're in the original order
  return finalMessages.reverse()
}

export default defineLazyEventHandler(async () => {
  if (!apiKey) throw new Error('Missing OpenAI API key')
  return defineEventHandler(async event => {
    // Extract the `prompt` from the body of the request
    const { messages } = await readBody(event)
    console.log('The following messages were received:\n')
    console.log(messages)

    let finalMessages = checkContextLengthAndUpdateSlidingWindow(messages)

    // Ask OpenAI for a streaming chat completion given the prompt
    // construct our request to the Azure OpenAI API with fetch
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      stream: true,
      messages: finalMessages.map(message => ({
        content: message.content,
        role: message.role,
      })),
    })

    const data = new experimental_StreamData()
    const stream = OpenAIStream(response, {
      onFinal() {
        data.append({ done: true })
        data.close()
      },
      experimental_StreamData: true,
    })
    return new StreamingTextResponse(stream, {}, data)
  })
})
