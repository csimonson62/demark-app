import { NextRequest, NextResponse } from 'next/server'
import { getActiveJobs, updateJob } from '@/lib/jobs'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { id: predictionId, status, output, error } = body

  const jobs = await getActiveJobs()
  const job = jobs.find(j => j.replicatePredictionId === predictionId)

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (status === 'succeeded') {
    const outputUrl =
      typeof output === 'string'
        ? output
        : Array.isArray(output)
          ? output[0]
          : null

    await updateJob(job.id, {
      status: 'completed',
      outputUrl: outputUrl ?? undefined,
      completedAt: Date.now(),
    })
  } else if (status === 'failed') {
    await updateJob(job.id, {
      status: 'failed',
      errorMessage: error || 'Processing failed',
    })
  }

  return NextResponse.json({ received: true })
}
