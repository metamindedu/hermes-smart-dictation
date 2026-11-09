import { ownerKey, targetKey, validLocalTarget, responseOwned } from './core.mjs'

const JOB_ID = /^[A-Za-z0-9_-]{16,128}$/
const PATH = /^\/(?:status|native-status|soul|transcribe(?:\/jobs\/[A-Za-z0-9_-]{16,128})?)$/
const allowedError = value => ['no_speech', 'recording_too_large', 'busy', 'transcription_timeout'].includes(value) ? value : 'backend_unavailable'

// ctx.rest captures its ambient native route synchronously. Do not put an
// await between checking the captured owner and making that SDK call.
export class OwnerBackend {
  constructor(ctx, capture, queryClient, { now = () => Date.now(), pollMs = 2000, waitMs = 180000 } = {}) {
    this.ctx = ctx; this.capture = capture; this.queryClient = queryClient
    this.now = now; this.pollMs = pollMs; this.waitMs = waitMs
  }
  owns(target) {
    const live = this.capture()
    return validLocalTarget(target) && validLocalTarget(live) && ownerKey(live.owner) === ownerKey(target.owner)
  }
  assert(target) { if (!this.owns(target)) throw new Error('owner_unavailable') }
  request(target, path, options = {}, guard = () => {}) {
    guard(); this.assert(target)
    const [pathname, query = ''] = path.split('?')
    if (!PATH.test(pathname) || path.split('?').length > 2) throw new Error('backend_unavailable')
    const params = new URLSearchParams(query)
    const assertions = params.getAll('owner_profile')
    if (params.has('profile') || assertions.length > 1 || assertions.some(p => p !== target.owner.profile)) throw new Error('owner_unavailable')
    params.set('owner_profile', target.owner.profile)
    // Capture happens in ctx.rest before its first suspension. No async helper
    // or mutable route lookup may be inserted between this fence and dispatch.
    guard(); this.assert(target)
    const work = this.ctx.rest(pathname + '?' + params.toString(), options)
    return Promise.resolve(work).then(result => {
      guard(); this.assert(target)
      const legacy = pathname === '/transcribe' && !result?.job_id
      if (!responseOwned(result, target.owner.profile, legacy)) throw new Error('owner_unavailable')
      if (result?.state && typeof result.state === 'object' && !responseOwned(result.state, target.owner.profile, legacy)) throw new Error('owner_unavailable')
      return result
    })
  }
  async transcribe(blob, target, guard, status) {
    guard(); this.assert(target)
    if (!blob || !Number.isFinite(blob.size) || blob.size <= 0) throw new Error('no_speech')
    if (blob.size > Math.min(status?.max_audio_bytes || 12582912, 12582912)) throw new Error('recording_too_large')
    const asyncMode = status?.capabilities?.includes('async-transcription-v1') === true
    if (!asyncMode && target.owner.profile !== 'default') throw new Error('backend_unavailable')
    const bytes = await blob.arrayBuffer()
    guard(); this.assert(target)
    const upload = { filename: blob.type.includes('mp4') ? 'dictation.mp4' : blob.type.includes('ogg') ? 'dictation.ogg' : 'dictation.webm', contentType: blob.type.split(';')[0] || 'audio/webm', bytes }
    const started = await this.request(target, '/transcribe', { method: 'POST', timeoutMs: asyncMode ? 20000 : 180000, upload }, guard)
    // Only the known, default-only pre-0.3 router can complete synchronously.
    // This is protocol compatibility, never execution on default for another owner.
    if (!asyncMode) { if (started?.job_id) throw new Error('backend_unavailable'); return started }
    if (!started?.ok || !JOB_ID.test(started.job_id || '') || !['running', 'queued', 'done'].includes(started.state)) throw new Error('backend_unavailable')
    const path = '/transcribe/jobs/' + started.job_id
    const key = ['smart-dictation', 'transcription-job', targetKey(target), started.job_id]
    const deadline = this.now() + this.waitMs
    const pending = new Error('transcription_pending')
    try {
      return await this.queryClient.fetchQuery({
        queryKey: key, staleTime: 0, gcTime: 0,
        queryFn: async ({ signal }) => {
          guard(); this.assert(target)
          if (signal?.aborted) throw new Error('owner_unavailable')
          if (this.now() >= deadline) throw new Error('transcription_timeout')
          const result = await this.request(target, path, { timeoutMs: 12000 }, guard)
          if (result.job_id !== started.job_id) throw new Error('owner_unavailable')
          if (result.state === 'done' && result.ok && typeof result.raw_transcript === 'string') return result
          if (result.state === 'error' || result.ok === false) throw new Error(allowedError(result.error))
          if (!['queued', 'running'].includes(result.state)) throw new Error('backend_unavailable')
          throw pending
        },
        retry: (_count, error) => {
          if (error !== pending || !this.owns(target)) return false
          try { guard(); return true } catch { return false }
        },
        retryDelay: () => Math.min(this.pollMs, Math.max(0, deadline - this.now()))
      })
    } finally {
      // Do not leave dictated text in the app-wide query cache. Native decode
      // cannot always be interrupted; the backend also enforces its own TTL.
      try { this.queryClient.removeQueries({ queryKey: key, exact: true }) } catch {}
      try { guard(); this.assert(target); void this.request(target, path, { method: 'DELETE', timeoutMs: 12000 }, guard).catch(() => {}) } catch {}
    }
  }
}
