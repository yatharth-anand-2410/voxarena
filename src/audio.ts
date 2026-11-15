// 24 kHz PCM queue on a plain AudioContext: gapless via scheduled sources, stop() is instant.
export class Player {
  ctx = new AudioContext({ sampleRate: 24000 });
  private an = this.ctx.createAnalyser();
  private active = new Set<AudioBufferSourceNode>();
  private next = 0;
  private waiters: (() => void)[] = [];
  private data = new Uint8Array(256);

  constructor() { this.an.fftSize = 256; this.an.connect(this.ctx.destination); }

  enqueue(pcm: Float32Array) {
    const buf = this.ctx.createBuffer(1, pcm.length, 24000);
    buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.an);
    this.next = Math.max(this.next, this.ctx.currentTime + 0.02);
    src.start(this.next);
    this.next += buf.duration;
    this.active.add(src);
    src.onended = () => { this.active.delete(src); if (!this.active.size) this.release(); };
  }

  drained(): Promise<void> {
    return this.active.size ? new Promise((r) => this.waiters.push(r)) : Promise.resolve();
  }

  stop() {
    for (const s of this.active) { s.onended = null; try { s.stop(); } catch {} }
    this.active.clear();
    this.next = 0;
    this.release();
  }

  level(): number { // 0..1 RMS
    this.an.getByteTimeDomainData(this.data);
    let s = 0;
    for (const v of this.data) s += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(s / this.data.length) * 3);
  }

  private release() { this.waiters.splice(0).forEach((r) => r()); }
}
