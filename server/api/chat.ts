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

async function checkStructureRequest(message: string) {
  // Check if the message is asking for a structure or a template
  /** Provide me a structure for a paper
Write me a template for a conference
How does a scientific work for a qualitative study look like? */
  let systemPrompt =
    'You are an agent that preprocesses messages and identifies whether the request is asking for any structure or any templates. If the USER REQUEST asks for a structure or any kind of template or outline of a scientific work document you reply with true otherwise reply with false and the reason why it is not a request for structure in three sentences at most.\n'
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        content: systemPrompt,
        role: 'system',
      },
      {
        content: message.content,
        role: 'user',
      },
    ],
  })
  let assistantResponse = response['choices'][0]['message']['content']
  console.log('Structure request?', assistantResponse)
  if (assistantResponse?.toLowerCase().includes('true')) {
    return true
  } else {
    return false
  }
}

export default defineLazyEventHandler(async () => {
  if (!apiKey) throw new Error('Missing OpenAI API key')
  return defineEventHandler(async event => {
    // Extract the `prompt` from the body of the request
    const { messages } = await readBody(event)
    console.log('The following messages were received:\n')
    console.log(messages)

    let finalMessages = checkContextLengthAndUpdateSlidingWindow(messages)
    let lastMessage = finalMessages[finalMessages.length - 1]
    let isStructureRequest = await checkStructureRequest(lastMessage)

    if (isStructureRequest === true) {
      finalMessages[finalMessages.length - 1].content = lastMessage.content.concat(
        "\n Please provide valid HTML tags for the structure of the document. If you don't know how try anyway."
      )
    }

    console.log('The following messages are being sent:\n')
    console.log(finalMessages)
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
