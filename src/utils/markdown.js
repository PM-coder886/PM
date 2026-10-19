import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
})

markdown.validateLink = (value) => {
  const url = String(value).trim()
  if (!url || /[\u0000-\u0020\u007f\\]/.test(url)) return false

  const scheme = url.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase()
  if (scheme) {
    if (!['http', 'https', 'mailto'].includes(scheme)) return false
    try {
      const parsed = new URL(url)
      return scheme === 'mailto'
        ? parsed.protocol === 'mailto:' && Boolean(parsed.pathname)
        : parsed.protocol === `${scheme}:` && Boolean(parsed.hostname)
    } catch {
      return false
    }
  }

  return !url.startsWith('//')
}

const defaultLinkOpen = markdown.renderer.rules.link_open
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index]
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen ? defaultLinkOpen(tokens, index, options, env, self) : self.renderToken(tokens, index, options)
}

export function renderMarkdown(source = '') {
  return markdown.render(source)
}
