import type { Browser } from '../ports'

export function createBrowserWindowAdapter(): Browser {
  return {
    openInNewTab: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    copyToClipboard: (text) => navigator.clipboard.writeText(text),
  }
}
