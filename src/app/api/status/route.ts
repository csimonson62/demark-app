import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { getActiveJobs, updateJob } from '@/lib/jobs'
import { checkPrediction } from '@/lib/replicate'

export async function GET(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const jobs = await getActiveJobs()

  for (const job of jobs) {
    if (job.status === 'processing' && job.replicatePredictionId) {
      try {
        const result = await checkPrediction(job.replicatePredictionId)

        if (result.status === 'succeeded' && result.outputUrl) {
          await updateJob(job.id, {
            status: 'completed',
            outputUrl: result.outputUrl,
            completedAt: Date.now(),
          })
          job.status = 'completed'
          job.outputUrl = result.outputUrl
        } else if (result.status === 'failed') {
          await updateJob(job.id, {
            status: 'failed',
            errorMessage: result.error || 'Processing failed',
          })
          job.status = 'failed'
          job.errorMessage = result.error
        }
      } catch (err) {
        console.error(`Failed to check prediction ${job.replicatePredictionId}:`, err)
      }
    }
  }

  return NextResponse.json({ jobs })
}
