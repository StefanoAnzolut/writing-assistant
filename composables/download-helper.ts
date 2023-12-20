export async function downloadDocumentAsWordBlob(): Promise<void> {
  const iframe = document.getElementsByTagName('iframe')[0]
  const doc = iframe.contentDocument
  // get the body of the doc
  const body = doc.getElementsByTagName('body')[0]
  // get the html of the body
  const src = body.innerHTML
  await fetch('/api/pandoc', {
    method: 'POST',
    body: JSON.stringify({ html: src }),
  })
    .then(response => response.json())
    .then(data => {
      let base64Response = data.blob
      let fetchResponse = fetch(base64Response)
      fetchResponse
        .then(res => res.blob())
        .then(blob => {
          // Now you have a Blob object, you can use it as you wish
          console.log(blob)
          // Create a new blob object
          const newBlob = new Blob([blob], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          })

          // Create a link element
          const link = document.createElement('a')

          // Create an object URL for the blob
          const url = window.URL.createObjectURL(newBlob)

          // Set the link's href to the object URL
          link.href = url

          // Set the download attribute of the link to the desired file name
          link.download = 'Writing Assistant Document.docx'

          // Append the link to the body
          document.body.appendChild(link)

          // Programmatically click the link to start the download
          link.click()

          // Once the download has started, remove the link from the body
          document.body.removeChild(link)
        })
    })
}
