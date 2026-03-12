# DeMark — Revised Build Spec (Vercel Only, No Supabase)

## What Changed From Original Spec

- **REMOVED:** Supabase entirely (no database, no storage, no auth)
- **ADDED:** Vercel KV (Redis) for job tracking with auto-expiry TTL
- **SIMPLIFIED:** No file storage — use Replicate output URLs directly
- **SIMPLIFIED:** Auth is a simple password gate via environment variable

---

## Tech Stack

| Layer | Technology | Cost |
|-------|-----------|------|
| Frontend | Next.js 14+ (App Router) | Free (Vercel) |
| Hosting | Vercel | Free tier |
| Job Tracking | Vercel KV (Redis) | Free tier (30k requests/mo) |
| GPU Processing | Replicate API | Pay per use (~$0.05-0.10/video) |
| Auth | Simple password env var | Free |
| Repo | GitHub `demark-app` | Free |

**Total monthly cost: $0 + Replicate usage**

---

## Step-by-Step Build Checklist

Complete each step fully before moving to the next. Confirm completion before proceeding.

### Step 1: Project Scaffold

```bash
npx create-next-app@latest demark-app --typescript --tailwind --app --src-dir --use-npm
cd demark-app
npm install replicate @vercel/kv
```

**File structure:**
```
demark-app/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # Login / password gate
│   │   ├── dashboard/
│   │   │   └── page.tsx                # Main app UI
│   │   └── api/
│   │       ├── auth/
│   │       │   └── route.ts            # Simple password check
│   │       ├── process/
│   │       │   └── route.ts            # Accept links, create jobs, trigger Replicate
│   │       ├── status/
│   │       │   └── route.ts            # Check job statuses (polls Replicate)
│   │       └── webhook/
│   │           └── route.ts            # Replicate completion webhook
│   ├── lib/
│   │   ├── replicate.ts                # Replicate API wrapper
│   │   ├── jobs.ts                     # Vercel KV job store
│   │   └── video-utils.ts             # Sora link parser
│   ├── components/
│   │   ├── LinkInput.tsx               # Paste up to 5 links
│   │   ├── FileUpload.tsx              # Drag-drop MP4 upload
│   │   ├── JobList.tsx                 # Active jobs with status + download
│   │   └── Header.tsx
│   └── types/
│       └── index.ts
├── .env.local
├── .env.example
└── package.json
```

---

### Step 2: Environment Variables

Create `.env.example`:

```env
# Replicate
REPLICATE_API_TOKEN=your-replicate-api-token

# Vercel KV (auto-populated when you add KV store in Vercel dashboard)
KV_URL=
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Simple auth (personal use)
APP_PASSWORD=pick-a-strong-password-here
```

---

### Step 3: Types

**`src/types/index.ts`**:

```typescript
export interface Job {
  id: string
  inputUrl: string
  inputType: 'link' | 'upload'
  status: 'pending' | 'fetching' | 'processing' | 'completed' | 'failed'
  replicatePredictionId?: string
  outputUrl?: string          // Replicate's output URL — this IS the download link
  errorMessage?: string
  createdAt: number           // Unix timestamp
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
```

---

### Step 4: Job Store (Vercel KV)

**`src/lib/jobs.ts`**:

```typescript
import { kv } from '@vercel/kv'
import { Job } from '@/types'

const JOB_TTL = 3600 // 1 hour in seconds — jobs auto-delete after this

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
  return typeof data === 'string' ? JSON.parse(data) : data as Job
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
      await kv.zrem('jobs:active', id)
    }
  }
  return jobs
}

export async function deleteJob(jobId: string): Promise<void> {
  await kv.del(`job:${jobId}`)
  await kv.zrem('jobs:active', jobId)
}
```

---

### Step 5: Sora Link Parser

**`src/lib/video-utils.ts`** — Fetches share page HTML and extracts direct MP4 URL using multiple strategies (og:video, video src, source tag, JSON-LD, any mp4 URL).

---

### Step 6: Replicate API Wrapper

**`src/lib/replicate.ts`** — Model: `uglyrobot/sora2-watermark-remover`. Methods: `startProcessing(videoUrl, webhookUrl)`, `checkPrediction(predictionId)`.

---

### Step 7: API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/auth` | POST | Password check, set cookie |
| `/api/auth` | DELETE | Logout, clear cookie |
| `/api/process` | POST | Accept links, create jobs, trigger Replicate |
| `/api/status` | GET | Poll all active jobs, check Replicate for updates |
| `/api/webhook` | POST | Replicate completion callback |

---

### Step 8: Frontend — Login Page

`src/app/page.tsx` — Centered card, dark background (#0a0a0f), password input, redirect to `/dashboard` on success.

---

### Step 9: Frontend — Dashboard

`src/app/dashboard/page.tsx` — Auth-gated. Header with logout. Textarea for up to 5 links. Job cards with status badges, elapsed time, download button. Polls `/api/status` every 3 seconds while jobs are active.

**Design:** bg #0a0a0f | card #141420 | border #1e1e30 | accent #4361ee | success #06d6a0 | error #ef476f

---

### Step 10: Middleware

`src/middleware.ts` — Protects `/dashboard` and `/api/*` (except `/api/auth` and `/api/webhook`). Checks `demark-auth` cookie.

---

### Step 11: Deploy

1. Push to GitHub `demark-app`
2. Import to Vercel
3. Vercel dashboard → Integrations → Upstash Redis → create + link to project (auto-populates KV env vars)
4. Add env vars: `REPLICATE_API_TOKEN`, `NEXT_PUBLIC_APP_URL`, `APP_PASSWORD`
5. Deploy
6. Test with a real Sora share link

---

## Testing Checklist

- [ ] Wrong password shows error, does not enter dashboard
- [ ] Correct password enters dashboard, cookie persists
- [ ] Logout clears cookie, returns to login
- [ ] Paste 1 Sora link → job shows "processing"
- [ ] Paste 5 links → all 5 jobs appear
- [ ] 6th link is rejected
- [ ] Invalid URL shows inline error
- [ ] Status polling updates jobs from processing → completed
- [ ] Download button appears on completed jobs
- [ ] Download delivers clean MP4
- [ ] Failed jobs show error message
- [ ] Direct MP4 URL works as input
- [ ] Jobs disappear after 1 hour (KV TTL)

---

## Local Development

```bash
npm install -g vercel
vercel link       # Link to your Vercel project
vercel env pull   # Pull env vars including KV credentials
vercel dev        # Run locally with Vercel KV connected
```

---

## Future Phases

### Phase 2: File Upload Support
- Replicate file upload API integration
- Enable drag-drop MP4 upload tab

### Phase 3: Public Access + Payment
- Stripe checkout, credit system, remove password gate

### Phase 4: Multi-Platform
- Kling, Runway, Pika, Veo watermark support
- Auto-detect AI platform, custom region selection

### Phase 5: Scale
- RunPod serverless, batch queue, API access
