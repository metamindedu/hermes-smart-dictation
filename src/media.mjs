import { safeError } from './core.mjs'

/** Own every stream and callback by operation, including pending permission requests. */
export class RecorderCoordinator {
  constructor(controller, environment = {}) {
    this.controller = controller; this.operation = null; this.disposed = false
    this.getMedia = environment.getMedia || (() => {
      if (!globalThis.navigator?.mediaDevices?.getUserMedia) throw new Error('microphone_unavailable')
      return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false})
    })
    this.recorderClass = environment.recorderClass || (() => globalThis.MediaRecorder)
    this.makeBlob = environment.makeBlob || ((chunks, type) => new Blob(chunks,{type}))
    // Browser timer functions require their Window receiver.
    this.setTimer = environment.setTimer || ((...args) => globalThis.setTimeout(...args))
    this.clearTimer = environment.clearTimer || (timer => globalThis.clearTimeout(timer))
  }
  valid(op) { return !this.disposed && this.operation === op && !op.discard && this.controller.current(op.generation) }
  releaseTracks(op) {
    if (!op.stream || op.released) return
    op.released = true
    for (const track of op.stream.getTracks()) { try { track.stop() } catch {} }
  }
  clearOperationTimer(op) {
    if (op.timer == null) return
    // Cleanup must still release the microphone if timer cancellation fails.
    // The operation/generation fence makes a surviving callback inert.
    try { this.clearTimer(op.timer) } catch {}
    op.timer = null
  }
  close(op) {
    op.discard = true; this.clearOperationTimer(op)
    if (this.operation === op) this.operation = null
    try { if (op.recorder?.state !== 'inactive') op.recorder?.stop() } catch {}
    this.releaseTracks(op); op.chunks.length = 0
  }
  stop(discard = false) {
    const op = this.operation; if (!op) return
    if (discard) { this.close(op); return }
    this.clearOperationTimer(op)
    try { if (op.recorder?.state !== 'inactive') op.recorder?.stop() }
    catch { if (this.valid(op)) this.controller.cancel('microphone_unavailable'); this.close(op) }
    finally { this.releaseTracks(op) }
  }
  cancel() { if (this.operation) this.close(this.operation) }
  dispose() { this.disposed = true; this.cancel() }
  async start(config) {
    if (this.disposed || this.operation) throw new Error('busy')
    const op = {generation:null,stream:null,recorder:null,chunks:[],bytes:0,timer:null,discard:false,released:false}
    this.operation = op
    try {
      const prepared = await this.controller.prepare(config)
      op.generation = prepared.generation
      if (!this.valid(op)) { this.close(op); return }
      const Recorder = this.recorderClass()
      if (!Recorder) throw new Error('microphone_unavailable')
      op.stream = await this.getMedia()
      if (!this.valid(op)) { this.close(op); return }
      const preferred = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'].find(t => Recorder.isTypeSupported(t))
      op.recorder = new Recorder(op.stream, preferred ? {mimeType:preferred} : undefined)
      const recorder = op.recorder
      recorder.ondataavailable = event => {
        if (!this.valid(op) || !event.data.size) return
        op.bytes += event.data.size
        if (op.bytes > (prepared.backend.max_audio_bytes || 12582912)) { this.controller.cancel('recording_too_large'); this.close(op); return }
        op.chunks.push(event.data)
      }
      recorder.onerror = () => {
        if (this.valid(op)) this.controller.cancel('microphone_unavailable')
        this.close(op)
      }
      recorder.onstop = () => {
        const accepted = this.valid(op)
        this.clearOperationTimer(op); this.releaseTracks(op)
        if (this.operation === op) this.operation = null
        if (!accepted) { op.chunks.length = 0; return }
        const blob = this.makeBlob(op.chunks,recorder.mimeType || 'audio/webm'); op.chunks.length = 0
        void this.controller.transcribe(blob,op.generation).catch(() => {})
      }
      recorder.start(500); this.controller.recording(op.generation)
      op.timer = this.setTimer(() => { if (this.valid(op)) this.stop(false) },180000)
    } catch (error) {
      const relevant = !this.disposed && this.operation === op && !op.discard && (op.generation === null || this.controller.current(op.generation))
      this.close(op)
      if (relevant && !this.controller.disposed) this.controller.emit({phase:'error',message:['NotAllowedError','NotFoundError'].includes(error?.name) ? 'microphone_unavailable' : safeError(error)})
    }
  }
}
