import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { isAuthenticated } from '@/lib/auth'
import { extractVideoUrl, validateInputs } from '@/lib/video-utils'
import { startProcessing } from '@/lib/replicate'
import { createJob } from '@/lib/jobs'
import type { Job } from '@/types'

export async function POST(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { urls } = (await request.json()) as { urls: string[] }

  const validation = validateInputs(urls)
  if (!validation.valid) {
    return NextResponse.json({ errors: validation.errors }, { status: 400 })
  }

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook`
  const results = []

  for (const rawUrl of urls) {
    const url = rawUrl.trim()
    const jobId = randomUUID()

    try {
      const sourceVideoUrl = await extractVideoUrl(url)
      const result = await startProcessing(sourceVideoUrl, webhookUrl)

      const job: Job = {
        id: jobId,
        inputUrl: url,
        inputType: url.match(/\.mp4(\?|$)/i) ? 'upload' : 'link',
        status: 'processing',
        replicatePredictionId: result.predictionId,
        createdAt: Date.now(),
      }
      await createJob(job)

      results.push({ jobId, status: 'processing' })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      const job: Job = {
        id: jobId,
        inputUrl: url,
        inputType: 'link',
        status: 'failed',
        errorMessage: message,
        createdAt: Date.now(),
      }
      await createJob(job)

      results.push({ jobId, status: 'failed', error: message })
    }
  }

  return NextResponse.json({ jobs: results })
}
