import OpenAI from 'openai'
import { OpenAIStream } from 'ai'

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

  console.log(`https://${resource}.openai.azure.com/openai/deployments/${model}`)

  return defineEventHandler(async event => {
    // Extract the `prompt` from the body of the request
    const { messages } = await readBody(event)

    console.log('The following messages were received:\n')
    console.log(messages)

    // Ask OpenAI for a streaming chat completion given the prompt
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      stream: true,
      messages: messages.map(message => ({
        content: message.content,
        role: message.role,
      })),
    })

    // TODO: Evaluate necessity of adding finish_reason that marks the end
    // of a streaming completion request and sent it to the client
    // const teedResponse = response.tee()
    // for await (const chunk of teedResponse[0]) {
    //   console.log(chunk)
    //   if (typeof chunk.choices !== 'undefined' && chunk.choices.length > 0) {
    //     if (chunk.choices[0].finish_reason === 'stop') {
    //       console.log('stop!!')
    //       return { finish_reason: 'stop' }
    //     }
    //   }
    // }

    /** Convert the response into a friendly text-stream */
    return OpenAIStream(response)
  })
})
