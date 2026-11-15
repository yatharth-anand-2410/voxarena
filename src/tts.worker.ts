import { KokoroTTS } from "kokoro-js";

let tts: KokoroTTS;
let gen = 0;
let chain: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === "load") {
    KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-ONNX", {
      dtype: "fp32", device: "webgpu",
      progress_callback: (p: any) => p.status === "progress" && postMessage({ type: "progress", pct: p.progress }),
    }).then((t) => { tts = t; postMessage({ type: "ready" }); }, (err) => postMessage({ type: "error", error: String(err) }));
  } else if (m.type === "clear") {
    gen++; // queued sentences from older generations are skipped
  } else if (m.type === "say") {
    const g = gen;
    chain = chain.then(async () => {
      if (g !== gen) return postMessage({ type: "audio", id: m.id, pcm: null });
      try {
        const a = await tts.generate(m.text, { voice: m.voice });
        const pcm = a.audio;
        postMessage({ type: "audio", id: m.id, pcm: g === gen ? pcm : null }, g === gen ? [pcm.buffer] : []);
      } catch (err) {
        postMessage({ type: "audio", id: m.id, pcm: null, error: String(err) });
      }
    });
  }
};
