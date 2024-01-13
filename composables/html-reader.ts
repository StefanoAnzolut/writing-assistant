import type { ChatMessage } from '~/models/ChatMessage'

const HTML_EXTRACTION_PLACEHOLDER =
  'Generated a structured response. Expand it using the expand button and let it be read to you with play or paste it to the text editor directly.'

export function generateReadableHTML(entry: ChatMessage): void {
  let html = entry.message.html
  if (html === undefined) {
    return
  }
  entry.message.contentHtml = generateReadableTextFromHTML(html)
}

function generateReadableTextFromHTML(html: string): string {
  html = html.replace(/<body>/g, '').replace(/<\/body>/g, '')
  html = html.replace(/<html>/g, '').replace(/<\/html>/g, '')
  html = html.replace(/<article>/g, '').replace(/<\/article>/g, '')
  html = html.replace(/<section>/g, '').replace(/<\/section>/g, '')
  html = html.replace(/<div>/g, '').replace(/<\/div>/g, '')
  html = html.replace(/<span>/g, '').replace(/<\/span>/g, '')
  html = html.replace(/<header>/g, '').replace(/<\/header>/g, '')
  html = html.replace(/<footer>/g, '').replace(/<\/footer>/g, '')
  html = html.replace(/<nav>/g, '').replace(/<\/nav>/g, '')
  html = html.replace(/<aside>/g, '').replace(/<\/aside>/g, '')
  html = html.replace(/<figure>/g, '').replace(/<\/figure>/g, '')
  html = html.replace(/<figcaption>/g, '').replace(/<\/figcaption>/g, '')
  html = html.replace(/<table>/g, '').replace(/<\/table>/g, '')
  html = html.replace(/<thead>/g, '').replace(/<\/thead>/g, '')
  html = html.replace(/<tbody>/g, '').replace(/<\/tbody>/g, '')
  html = html.replace(/<tfoot>/g, '').replace(/<\/tfoot>/g, '')
  html = html.replace(/<tr>/g, '').replace(/<\/tr>/g, '')
  html = html.replace(/<th>/g, '').replace(/<\/th>/g, '')
  html = html.replace(/<td>/g, '').replace(/<\/td>/g, '')
  html = html.replace(/<blockquote>/g, '').replace(/<\/blockquote>/g, '')
  html = html.replace(/<cite>/g, '').replace(/<\/cite>/g, '')
  html = html.replace(/<q>/g, '').replace(/<\/q>/g, '')
  html = html.replace(/<abbr>/g, '').replace(/<\/abbr>/g, '')
  html = html.replace(/<address>/g, '').replace(/<\/address>/g, '')

  html = html.replace(/<em>/g, 'Emphasized ').replace(/<\/em>/g, '\n')
  html = html.replace(/<i>/g, 'Italic ').replace(/<\/i>/g, '\n')
  html = html.replace(/<strong>/g, 'Bold ').replace(/<\/strong>/g, '\n')

  html = html.replace(/<h1>/g, 'Heading 1: ').replace(/<\/h1>/g, '\n')
  html = html.replace(/<h2>/g, 'Heading 2: ').replace(/<\/h2>/g, '\n')
  html = html.replace(/<h3>/g, 'Heading 3: ').replace(/<\/h3>/g, '\n')
  html = html.replace(/<h4>/g, 'Heading 4: ').replace(/<\/h4>/g, '\n')
  html = html.replace(/<h5>/g, 'Heading 5: ').replace(/<\/h5>/g, '\n')
  html = html.replace(/<h6>/g, 'Heading 6: ').replace(/<\/h6>/g, '\n')
  html = html.replace(/<p>/g, 'Paragraph: ').replace(/<\/p>/g, '\n')
  html = html.replace(/<ul>/g, 'Unordered List\n').replace(/<\/ul>/g, '\n')
  html = html.replace(/<ol>/g, 'Ordered List\n').replace(/<\/ol>/g, '\n')
  html = html.replace(/<li>/g, 'List Item ').replace(/<\/li>/g, '\n')
  html = html
    .replace(/<br>/g, '')
    .replace(/<\/br>/g, '')
    .replace(/<br\/>/g, '')
  return html
}

export function getHTMLFromRange(range: any): string {
  const acceptedElements = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL']
  let startContainer = range.startContainer.$
  let endContainer = range.endContainer.$
  console.log(range)
  console.log(startContainer.isEqualNode(endContainer))
  if (startContainer.isEqualNode(endContainer)) {
    // Check whether the startContainer is a text node or an element node
    if (startContainer.nodeType === 3) {
      // text node => so we fallback to parentElement
      return preprocessHtml(startContainer.parentElement.outerHTML)
    }
    console.log('startContainer:', startContainer)
    return getOuterHtml(startContainer, acceptedElements)
  }
  if (startContainer.nodeType === 3) {
    // text node => so we fallback to parentElement
    startContainer = startContainer.parentElement
  }
  if (endContainer.nodeType === 3) {
    // text node => so we fallback to parentElement
    endContainer = endContainer.parentElement
  }
  console.log('Entering with startContainerParent:', startContainer)
  console.log('Entering with endContainerParent:', endContainer)
  const outerHtmlStart = getOuterHtml(startContainer, acceptedElements)
  const outerHtmlEnd = getOuterHtml(endContainer, acceptedElements)
  let documentInner = range.document.$.body.innerHTML
  let outerHtmlForRange = documentInner.substring(
    documentInner.indexOf(outerHtmlStart),
    documentInner.lastIndexOf(outerHtmlEnd) + outerHtmlEnd.length
  )
  // remove html char codes and symbols that appear when copy pasting from different locations
  return preprocessHtml(outerHtmlForRange)
}

function getOuterHtml(element: Element, acceptedElements: string[]): string {
  if (acceptedElements.some(p => element.tagName.includes(p))) {
    // replace <br> which can appear out of nowhere for the text editor
    return preprocessHtml(element.outerHTML.replace('<br>', ''))
  }
  return getOuterHtml(element.parentElement, acceptedElements)
}

export function preprocessHtml(content: string): string {
  // remove char codes
  const decodedHTMLCharCodes = content.replace(/(&#(\d+);)/g, (match, capture, charCode) =>
    String.fromCharCode(charCode)
  )
  // remove html codes
  const decodedHTMLCodes = decodedHTMLCharCodes
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
  // filter out href link with attribute data-cke-saved-href
  const filteredHrefHTML = decodedHTMLCodes.replace(/ data-cke-saved-href="[^"]*"/g, '')
  const filteredHTML = filteredHrefHTML.replace(/<br[^>]*>/g, '')

  return filteredHTML
}

export function removeHtmlTags(content: string) {
  return content.replace(/<[^>]*>/g, '')
}

export function isHtmlAlreadyExtracted(assistantResponse: string): boolean {
  return assistantResponse.includes(HTML_EXTRACTION_PLACEHOLDER)
}

export function containsHtmlTags(content: string): boolean {
  return /<[^>]*>/g.test(content)
}
