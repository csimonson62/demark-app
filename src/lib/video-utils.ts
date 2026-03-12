export async function extractVideoUrl(shareLink: string): Promise<string> {
  // Already a direct MP4
  if (shareLink.match(/\.mp4(\?|$)/i)) {
    return shareLink
  }

  const knownPatterns = [
    /sora\.com/,
    /openai\.com/,
    /sora\.chatgpt\.com/,
    /chatgpt\.com.*sora/,
  ]

  const isKnownPlatform = knownPatterns.some(p => p.test(shareLink))
  if (!isKnownPlatform) {
    throw new Error('Unsupported link. Paste a Sora share link or direct MP4 URL.')
  }

  const response = await fetch(shareLink, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeMark/1.0)' },
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`Could not reach link (HTTP ${response.status})`)
  }

  const html = await response.text()

  const strategies = [
    () => html.match(/property="og:video(?::url)?"\s+content="([^"]+)"/)?.[1],
    () => html.match(/<video[^>]*src="([^"]+\.mp4[^"]*)"/)?.[1],
    () => html.match(/<source[^>]*src="([^"]+\.mp4[^"]*)"/)?.[1],
    () => html.match(/"contentUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/)?.[1],
    () => html.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/i)?.[0],
  ]

  for (const strategy of strategies) {
    const url = strategy()
    if (url) return url
  }

  throw new Error(
    'Could not find video URL in the share page. The link format may have changed.'
  )
}

export function validateInputs(urls: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (urls.length === 0) errors.push('Provide at least one video link.')
  if (urls.length > 5) errors.push('Maximum 5 videos per batch.')

  urls.forEach((url, i) => {
    try {
      new URL(url.trim())
    } catch {
      errors.push(`Link ${i + 1} is not a valid URL.`)
    }
  })

  return { valid: errors.length === 0, errors }
}
