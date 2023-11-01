import axios from 'axios'
export default defineEventHandler(async event => {
  // console.log(event.headers.entries())
  // res.setHeader('Content-Type', 'application/json')
  const speechKey = process.env.AZURE_SPEECH_API_KEY
  const speechRegion = process.env.AZURE_SPEECH_REGION
  const headers = {
    headers: {
      'Ocp-Apim-Subscription-Key': speechKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  }

  try {
    const tokenResponse = await axios.post(
      `https://${speechRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      null,
      headers
    )
    return { token: tokenResponse.data, region: speechRegion }
  } catch (err) {
    console.log(err)
  }
})
