import * as fs from 'fs'
import { spawn } from 'child_process'

export function pandoc(src, args): Promise<string> {
  return new Promise((resolve, reject) => {
    let options
    let pdSpawn
    let result = ''

    let onStdOutData
    let onStdOutEnd
    let onStdErrData
    let onStatCheck

    onStdOutData = function (data) {
      result += data
    }

    onStdOutEnd = function () {
      resolve(result || true)
    }

    onStdErrData = function (err) {
      reject(new Error(err))
    }

    onStatCheck = function (err, stats) {
      if (stats && stats.isFile()) {
        args.unshift(src)
      }

      pdSpawn = spawn('pandoc', args, options)

      if (typeof stats === 'undefined') {
        pdSpawn.stdin.end(src, 'utf-8')
      }

      pdSpawn.stdout.on('data', onStdOutData)
      pdSpawn.stdout.on('end', onStdOutEnd)
      pdSpawn.stderr.on('data', onStdErrData)
    }

    args = Array.prototype.slice.call(arguments)
    src = args.shift()

    if (args.length == 2 && args[1].constructor !== Array) {
      options = args.pop()
    }

    args = args.shift()

    if (args.constructor === String) {
      args = args.split(' ')
    }

    fs.stat(src, onStatCheck)
  })
}

export default defineEventHandler(async event => {
  let body = ''
  for await (const chunk of event.node.req) {
    body += chunk
  }

  const { html } = JSON.parse(body)

  const src = html
  const args = '-f html -t docx -o word.docx'

  try {
    // Pandoc saves content to file, and we read it back
    // But as pandoc is async we need to wait for it to finish so we use await and async
    // this makes it synchronous but now we can read from the file directly

    const response = await pandoc(src, args)
    console.log('response: ', response)
    let fileBuffer = fs.readFileSync('./word.docx')

    // Convert the Buffer to a base64 string
    let base64EncodedDocument = fileBuffer.toString('base64')
    return {
      blob:
        'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64, ' + base64EncodedDocument,
    }
  } catch (error) {
    // Handle any errors that occurred while running the pandoc function
    console.error('Error while converting document:', error)
    throw error
  }
})
