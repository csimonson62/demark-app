import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

const MODEL = 'uglyrobot/sora2-watermark-remover'

export interface ReplicateResult {
  predictionId: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  outputUrl?: string
  error?: string
}

export async function startProcessing(
  videoUrl: string,
  webhookUrl?: string
): Promise<ReplicateResult> {
  const options: Parameters<typeof replicate.predictions.create>[0] = {
    model: MODEL,
    input: { video: videoUrl },
  }

  if (webhookUrl) {
    options.webhook = webhookUrl
    options.webhook_events_filter = ['completed']
  }

  const prediction = await replicate.predictions.create(options)

  return {
    predictionId: prediction.id,
    status: prediction.status as ReplicateResult['status'],
  }
}

export async function checkPrediction(predictionId: string): Promise<ReplicateResult> {
  const prediction = await replicate.predictions.get(predictionId)

  const outputUrl =
    typeof prediction.output === 'string'
      ? prediction.output
      : Array.isArray(prediction.output)
        ? (prediction.output[0] as string)
        : undefined

  return {
    predictionId: prediction.id,
    status: prediction.status as ReplicateResult['status'],
    outputUrl,
    error: prediction.error as string | undefined,
  }
}
