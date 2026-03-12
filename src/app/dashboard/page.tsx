'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { Job } from '@/types'

const STATUS_COLOR: Record<Job['status'], string> = {
  pending: 'var(--muted)',
  fetching: 'var(--muted)',
  processing: 'var(--accent)',
  completed: 'var(--success)',
  failed: 'var(--error)',
}

const STATUS_LABEL: Record<Job['status'], string> = {
  pending: 'Pending',
  fetching: 'Fetching',
  processing: 'Processing',
  completed: 'Done',
  failed: 'Failed',
}

function elapsed(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

function JobCard({ job, index }: { job: Job; index: number }) {
  const shortUrl = job.inputUrl.length > 60
    ? job.inputUrl.slice(0, 57) + '...'
    : job.inputUrl

  function handleDownload() {
    if (!job.outputUrl) return
    const a = document.createElement('a')
    a.href = job.outputUrl
    a.download = `demark-cleaned-${index + 1}.mp4`
    a.click()
  }

  const isProcessing = job.status === 'processing' || job.status === 'pending' || job.status === 'fetching'

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      {/* URL + status row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
        <p
          title={job.inputUrl}
          style={{
            margin: 0,
            fontSize: '13px',
            color: 'var(--muted)',
            fontFamily: 'monospace',
            wordBreak: 'break-all',
            flex: 1,
          }}
        >
          {shortUrl}
        </p>
        <span style={{
          flexShrink: 0,
          fontSize: '12px',
          fontWeight: '600',
          color: STATUS_COLOR[job.status],
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          {isProcessing && (
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'var(--accent)',
              animation: 'pulse 1.2s ease-in-out infinite',
            }} />
          )}
          {STATUS_LABEL[job.status]}
        </span>
      </div>

      {/* Error message */}
      {job.status === 'failed' && job.errorMessage && (
        <p style={{
          margin: 0,
          fontSize: '12px',
          color: 'var(--error)',
          background: 'rgba(239,71,111,0.1)',
          padding: '8px 12px',
          borderRadius: '6px',
        }}>
          {job.errorMessage}
        </p>
      )}

      {/* Footer: time + download */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
          {elapsed(job.createdAt)}
        </span>
        {job.status === 'completed' && job.outputUrl && (
          <button
            onClick={handleDownload}
            style={{
              padding: '8px 20px',
              background: 'var(--success)',
              color: '#0a0a0f',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            Download
          </button>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [links, setLinks] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [inputError, setInputError] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status')
      if (res.status === 401) { router.push('/'); return }
      const data = await res.json()
      if (data.jobs) setJobs(data.jobs)
    } catch {}
  }, [router])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    const hasActive = jobs.some(
      j => j.status === 'processing' || j.status === 'pending' || j.status === 'fetching'
    )

    if (hasActive) {
      intervalRef.current = setInterval(fetchStatus, 3000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [jobs, fetchStatus])

  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' })
    document.cookie = 'demark-auth=; max-age=0; path=/'
    router.push('/')
  }

  async function handleSubmit() {
    setInputError('')
    const urls = links
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)

    if (urls.length === 0) { setInputError('Paste at least one link.'); return }
    if (urls.length > 5) { setInputError('Maximum 5 links at a time.'); return }

    for (let i = 0; i < urls.length; i++) {
      try { new URL(urls[i]) } catch {
        setInputError(`Link ${i + 1} is not a valid URL.`); return
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      })

      if (res.status === 401) { router.push('/'); return }

      const data = await res.json()
      if (data.errors) { setInputError(data.errors.join(' ')); return }

      setLinks('')
      await fetchStatus()
    } catch {
      setInputError('Failed to submit. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const urlCount = links.split('\n').map(l => l.trim()).filter(Boolean).length

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        {/* Header */}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 32px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontWeight: '700', fontSize: '18px', letterSpacing: '-0.3px' }}>
            DeMark
          </span>
          <button
            onClick={handleLogout}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              padding: '7px 16px',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </header>

        <main style={{ maxWidth: '720px', margin: '0 auto', padding: '48px 24px' }}>
          {/* Input section */}
          <section style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '28px',
            marginBottom: '32px',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: '12px',
            }}>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '600' }}>
                Paste Sora Links
              </h2>
              <span style={{ fontSize: '12px', color: urlCount > 5 ? 'var(--error)' : 'var(--muted)' }}>
                {urlCount}/5 links
              </span>
            </div>

            <textarea
              value={links}
              onChange={e => { setLinks(e.target.value); setInputError('') }}
              placeholder={'https://sora.com/...\nhttps://sora.com/...\n\nPaste up to 5 links, one per line'}
              rows={6}
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'var(--bg)',
                border: `1px solid ${inputError ? 'var(--error)' : 'var(--border)'}`,
                borderRadius: '8px',
                color: 'var(--text)',
                fontSize: '14px',
                fontFamily: 'monospace',
                resize: 'vertical',
                outline: 'none',
                display: 'block',
                lineHeight: '1.6',
              }}
            />

            {inputError && (
              <p style={{ color: 'var(--error)', fontSize: '13px', margin: '8px 0 0' }}>
                {inputError}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting || !links.trim()}
              style={{
                marginTop: '16px',
                padding: '11px 28px',
                background: submitting || !links.trim() ? 'var(--border)' : 'var(--accent)',
                color: 'var(--text)',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: submitting || !links.trim() ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {submitting ? 'Submitting...' : 'Process All'}
            </button>
          </section>

          {/* Jobs section */}
          {jobs.length > 0 && (
            <section>
              <h2 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                margin: '0 0 16px',
              }}>
                Jobs
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {jobs.map((job, i) => (
                  <JobCard key={job.id} job={job} index={i} />
                ))}
              </div>
            </section>
          )}

          {jobs.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '14px', marginTop: '48px' }}>
              No jobs yet. Paste links above to get started.
            </p>
          )}
        </main>
      </div>
    </>
  )
}
