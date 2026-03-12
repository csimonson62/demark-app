import { kv } from '@vercel/kv'
import { Job } from '@/types'

const JOB_TTL = 3600 // 1 hour

export async function createJob(job: Job): Promise<void> {
  await kv.set(`job:${job.id}`, JSON.stringify(job), { ex: JOB_TTL })
  await kv.zadd('jobs:active', { score: job.createdAt, member: job.id })
}

export async function updateJob(jobId: string, updates: Partial<Job>): Promise<Job | null> {
  const existing = await getJob(jobId)
  if (!existing) return null

  const updated = { ...existing, ...updates }
  await kv.set(`job:${jobId}`, JSON.stringify(updated), { ex: JOB_TTL })
  return updated
}

export async function getJob(jobId: string): Promise<Job | null> {
  const data = await kv.get(`job:${jobId}`)
  if (!data) return null
  return typeof data === 'string' ? JSON.parse(data) : (data as Job)
}

export async function getActiveJobs(): Promise<Job[]> {
  const jobIds = await kv.zrange('jobs:active', 0, -1, { rev: true })
  if (!jobIds.length) return []

  const jobs: Job[] = []
  for (const id of jobIds) {
    const job = await getJob(id as string)
    if (job) {
      jobs.push(job)
    } else {
      // Job expired via TTL — remove from index
      await kv.zrem('jobs:active', id)
    }
  }

  return jobs
}

export async function deleteJob(jobId: string): Promise<void> {
  await kv.del(`job:${jobId}`)
  await kv.zrem('jobs:active', jobId)
}
