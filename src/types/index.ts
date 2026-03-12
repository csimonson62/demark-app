export interface Job {
  id: string
  inputUrl: string
  inputType: 'link' | 'upload'
  status: 'pending' | 'fetching' | 'processing' | 'completed' | 'failed'
  replicatePredictionId?: string
  outputUrl?: string
  errorMessage?: string
  createdAt: number
  completedAt?: number
}

export interface ProcessRequest {
  urls: string[]
}

export interface ProcessResponse {
  jobs: Array<{
    jobId: string
    status: string
    error?: string
  }>
}
