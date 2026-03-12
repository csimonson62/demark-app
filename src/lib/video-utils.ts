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

  // Try to fetch and parse the share page for a direct MP4 URL.
  // If Sora blocks the request (403/other error), fall through and pass
  // the share link directly to Replicate — the model handles Sora links natively.
  try {
    const response = await fetch(shareLink, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    })

    if (response.ok) {
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
    }
  } catch {
    // Network error — fall through to direct link passthrough
  }

  // Fallback: pass the share link directly to Replicate.
  // The uglyrobot/sora2-watermark-remover model was built for Sora and
  // may resolve share links natively.
  return shareLink
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
