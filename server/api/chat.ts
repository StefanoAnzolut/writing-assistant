import OpenAI from 'openai'
import { Message, OpenAIStream, StreamingTextResponse, experimental_StreamData } from 'ai'
import { encoding_for_model } from '@dqbd/tiktoken'
import { ChatCompletionCreateParams } from 'openai/resources'

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

async function askOpenAI(messages: Message[], stream: boolean) {
  let chatCompletionObject = {
    model: 'gpt-3.5-turbo',
    messages: messages.map(message => ({
      content: message.content,
      role: message.role,
    })),
  }
  if (stream) {
    chatCompletionObject.stream = true
  }
  const response = await openai.chat.completions.create(chatCompletionObject)
  return response
}

//Returns the number of tokens in a text string
function numTokensFromString(message: string) {
  const encoder = encoding_for_model('gpt-3.5-turbo')
  const tokens = encoder.encode(message)
  encoder.free()
  return tokens.length
}

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

async function checkStructureRequest(message: Message) {
  // Check if the message is asking for a structure or a template
  /** Provide me a structure for a paper
Write me a template for a conference
How does a scientific work for a qualitative study look like? */
  let systemPrompt =
    'You are an agent that preprocesses messages and identifies whether the request is asking for any structure, template, an example, formatting of the paper or draft. If the USER REQUEST asks for any kind of structure, template, an example, draft, formatting of the paper or outline of a scientific work document you reply with true otherwise reply with false and the reason why it is not a request for structure in three sentences at most.\n'
  let messages = [
    {
      content: systemPrompt,
      role: 'system',
    },
    {
      content: message.content,
      role: 'user',
    },
  ]
  let streaming = false
  const response = await askOpenAI(messages, streaming)
  let assistantResponse = response['choices'][0]['message']['content']
  console.log('Structure request?', assistantResponse)
  if (assistantResponse?.toLowerCase().includes('true')) {
    return true
  } else {
    return false
  }
}

async function improvePrompt(message: Message) {
  let systemPrompt =
    'You are now tasked to improve the current prompt to make it more accurate and detailed. Only update the current prompt and return it.'
  let messages = [
    {
      content: systemPrompt,
      role: 'system',
    },
    {
      content: message.content,
      role: 'user',
    },
  ]
  let streaming = false
  const response = await askOpenAI(messages, streaming)
  let assistantResponse = response['choices'][0]['message']['content']
  console.log('GPT suggested prompt: ', assistantResponse)
  return assistantResponse
}

export default defineLazyEventHandler(async () => {
  if (!apiKey) throw new Error('Missing OpenAI API key')
  return defineEventHandler(async event => {
    // Extract the `prompt` from the body of the request
    const { messages } = await readBody(event)
    console.log('The following messages were received:\n')
    console.log(messages)

    const data = new experimental_StreamData()

    let finalMessages = checkContextLengthAndUpdateSlidingWindow(messages)
    let lastMessage = finalMessages[finalMessages.length - 1]
    let isStructureRequest = await checkStructureRequest(lastMessage)

    if (isStructureRequest === true) {
      // data.append({ structureRequest: true })
      const improvedPrompt = await improvePrompt(lastMessage)
      lastMessage.content = improvedPrompt.concat(
        " Please provide valid HTML tags for the structure of the document. Only reply with the content of the html body, do not include a <header> or a <footer>. If you don't know how to create valid HTML tags, try anyway. Additionally make sure to wrap only the <body> </bod> html part in an <ai-reponse> tag. This is the most important to me, as I deeply rely on the correct structure."
      )
      finalMessages[finalMessages.length - 1].content = lastMessage.content
      console.log('The final message with prompt improvement is: ', lastMessage.content)
    }

    console.log('The following messages are being sent:\n')
    console.log(finalMessages)

    let streaming = true
    const response = await askOpenAI(finalMessages, streaming)

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
