import OpenAI from 'openai'
import { Message, OpenAIStream, StreamingTextResponse, experimental_StreamData } from 'ai'
import { encoding_for_model } from '@dqbd/tiktoken'

const apiKey = process.env.AZURE_API_KEY
const resource = 'mt-gpt4at'
const model = 'gpt35'
const bestModel = 'gpt4'
console.log('Current model is: ', model)

// Azure OpenAI requires a custom baseURL, api-version query param, and api-key header.
const openai = new OpenAI({
  apiKey,
  baseURL: `https://${resource}.openai.azure.com/openai/deployments/${model}`,
  defaultQuery: { 'api-version': '2023-07-01-preview' },
  defaultHeaders: { 'api-key': apiKey },
})

async function askOpenAI(
  messages: Message[],
  stream: boolean,
  model: string = 'gpt35'
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  openai.baseURL = `https://${resource}.openai.azure.com/openai/deployments/${model}`
  console.log(openai.baseURL)
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
  // Direct context menu structure request
  if (message.content.includes('Add structure to the following content')) {
    return true
  }
  // Direct context menu action with modifcation in mind
  if (message.content.includes('[MODIFICATION_REQUEST]:')) {
    return false
  }
  // Use GPT to check whether the message is a structure request
  let keywords = [
    'structure',
    'template',
    'example',
    'formatting',
    'draft',
    'outline',
    'article',
    'paper',
    'report',
    'thesis',
    'dissertation',
    'manuscript',
    'chapter',
    'essay',
    'letter',
    'email',
    'document',
    'text',
    'writing',
    'composition',
    'piece',
    'work',
    'publication',
    'journal',
    'newspaper',
  ]
  let systemPrompt = `You are an agent that preprocesses messages and identifies whether the request is asking for support of academic writing.
    This includes any help with the following: ${keywords.join(', ')}
    If the USER REQUEST asks for for any of them, you reply with true otherwise
    reply with false and the reason why it is not an aid request in three sentences at most.\n
    Here are a few examples for reference:
    - Provide me a structure for a paper
    - Write me a template for a conference
    - How does a scientific work for a qualitative study look like?
    If the question is similar or shares a similar intention to the references also reply with true.
    `
  // structure, template, an example, formatting of the paper or draft. If the USER REQUEST asks for any kind of structure, template, an example, draft, formatting of the paper or outline of a scientific work document you reply with true otherwise reply with false and the reason why it is not a request for structure in three sentences at most.\n`
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
  // How to write a scientific article Hoogenboom BJ, Manske RC.
  let systemPrompt = `
  You are now tasked to improve the current prompt to make it more accurate and detailed. Only update the current prompt and return it.

  When reviewers are deciding on whether to accept manuscripts for publication, they prioritize the following five key criteria:
  1) The significance, current relevance, applicability, and commonality of the issue being addressed
  2) The caliber of the manuscript's writing style, ensuring that it's well-articulated, clear, direct, easy to comprehend, and logical
  3) The suitability, thoroughness, and rigor of the study design applied in the manuscript
  4) How well the literature review was conducted - it should be thoughtful, focused, and up-to-date
  5) The application of a sufficiently large and representative sample
  In contrast, there are specific reasons that lead reviewers to reject manuscripts. The top five reasons include:
  1) The use of inappropriate, incomplete, or inadequately described statistical methods
  2) The over-interpretation or exaggeration of study results
  3) The utilization of inappropriate, suboptimal, or poorly described populations or research tools
  4) The inclusion of small or biased samples which may skew results
  5) Manuscripts that are poorly written or hard to understand due to convoluted language

  To ensure that manuscripts are accessible to a wide range of readers, including those from different disciplines and non-native English speakers, authors should strive to write in a clear, simple manner.
  Avoiding technical jargon wherever possible and providing clear explanations when its use is unavoidable is highly recommended.
  Authors should also limit the use of abbreviations, particularly non-standard ones.
  The background, rationale, and main conclusions of the study should be clearly articulated.
  Titles and abstracts should be written in a manner easily comprehensible to any scientist.
  Specialized but essential terms should be concisely explained without resorting to a didactic tone.
    `
  // From Nature readability
  // Rewritten by GPT-4
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
        `
        Your answer formatting requirements:
        - Please provide valid HTML tags for the structure of the document.
        - Only reply with the content of the html body, do not include a <header> or a <footer>.
        - Also do not include any <script> or <style> tags, this includes no inline-styling.
        - If you don't know how to create valid HTML tags, try anyway.
        - Additionally make sure to wrap only the <body> </body> html part in an <ai-reponse> tag.
        These formatting requirements are very important for visually-impaired users.
        Thus, I deeply rely on the correct structure.`
      )
      finalMessages[finalMessages.length - 1].content = lastMessage.content
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
