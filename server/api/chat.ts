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

export default defineLazyEventHandler(async () => {
  const apiKey = process.env.AZURE_API_KEY
  const resource = 'mt-gpt4at'
  const model = 'gpt35'
  console.log('Current model is: ', model)
  if (!apiKey) throw new Error('Missing OpenAI API key')

  // Azure OpenAI requires a custom baseURL, api-version query param, and api-key header.
  const openai = new OpenAI({
    apiKey,
    baseURL: `https://${resource}.openai.azure.com/openai/deployments/${model}`,
    defaultQuery: { 'api-version': '2023-07-01-preview' },
    defaultHeaders: { 'api-key': apiKey },
  })

  return defineEventHandler(async event => {
    let resolveFinishPromise: (finishReason: string) => void
    const finishPromise = new Promise(resolve => {
      resolveFinishPromise = resolve
    })
    // Extract the `prompt` from the body of the request
    const { messages } = await readBody(event)

    const reversedMessages = [...messages].reverse()
    console.log(reversedMessages)
    // Count the number of tokens in the messages
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
    finalMessages = finalMessages.reverse()

    console.log('The following messages were received:\n')
    console.log(messages)

    // Ask OpenAI for a streaming chat completion given the prompt
    // construct our request to the Azure OpenAI API with fetch
    const response = await fetch(`${openai.baseURL}/chat/completions?api-version=2023-07-01-preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        stream: true,
        messages: finalMessages.map(message => ({
          content: message.content,
          role: message.role,
        })),
      }),
    })

    const data = new experimental_StreamData()
    if (response.body) {
      const [stream1, stream2] = response.body.tee()

      const newResponse = new Response(stream1, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      })

      const stream = OpenAIStream(newResponse, {
        onFinal() {
          finishPromise.then(finishReason => {
            console.log('finishing with reason', finishReason)
            data.append({ finish_reason: `${finishReason}` })
            data.close()
          })
        },
        experimental_streamData: true,
      })

      // Use stream2 to get the finish_reason
      const reader2 = stream2.getReader()
      let finishReason = 'no finish reason'
      reader2.read().then(async function processText({ done, value }): Promise<void> {
        const regex = /"finish_reason"\s*:\s*"(\w+)"/

        if (value === undefined) {
          return
        }

        const text = new TextDecoder('utf-8').decode(value)
        const match = regex.exec(text)

        if (match && match[1]) {
          finishReason = match[1]
          resolveFinishPromise(finishReason)
          return
        }

        if (done) {
          //this does not seem to be firing, would be nice to resolve.
          console.log('About to resolve promise with: ', finishReason)
          resolveFinishPromise(finishReason)
          return
        }

        const result_1 = await reader2.read()
        return processText(result_1)
      })
      return new StreamingTextResponse(stream, {}, data)
    } else {
      return new Response('no response body', { status: 500 })
    }
  })
})
