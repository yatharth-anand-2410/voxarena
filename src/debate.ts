import { WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { Chunker, windowed, type Msg } from "./chunker";
import { Player } from "./audio";
import { MODELS, appConfig } from "./models";

export interface Debater { name: string; stance: string; modelId: string; voice: string }
export interface UI {
  status(s: string): void;
  transcript(t: { who: "A" | "B"; text: string }[]): void;
  speaker(s: "A" | "B" | null): void;
}

const systemPrompt = (me: Debater, other: Debater, label: "A" | "B", topic: string) =>
  `You are Debater ${label} (${me.name}). Stance: ${me.stance}. ${MODELS.find((m) => m.id === me.modelId)?.style ?? ""} ` +
  `Topic: ${topic}. RULES: Never agree with your opponent (${other.name}). Directly challenge their previous point in 1-2 short spoken sentences (under 40 words total). ` +
  `Never concede. Output plain spoken text only, no markdown, asterisks or lists.`;

export class Debate {
  player = new Player();
  private tts = new Worker(new URL("./tts.worker.ts", import.meta.url), { type: "module" });
  private engine?: WebWorkerMLCEngine;
  private loadedModel = "";
  private ttsReady?: Promise<void>;
  private gen = 0; // bumped on stop; invalidates in-flight work
  private pending = new Map<number, (pcm: Float32Array | null) => void>();
  private sayId = 0;
  private ui: UI;

  constructor(ui: UI) {
    this.ui = ui;
    this.tts.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") ui.status(`Loading voice model… ${Math.round(m.pct)}%`);
      else if (m.type === "audio") { this.pending.get(m.id)?.(m.pcm); this.pending.delete(m.id); }
    };
  }

  private loadTts() {
    return (this.ttsReady ??= new Promise((res, rej) => {
      const h = (e: MessageEvent) => {
        if (e.data.type === "ready") { this.tts.removeEventListener("message", h); res(); }
        else if (e.data.type === "error") rej(new Error(e.data.error));
      };
      this.tts.addEventListener("message", h);
      this.tts.postMessage({ type: "load" });
    }));
  }

  // Resolves with the ctx time the sentence starts playing, or null if dropped.
  private say(text: string, voice: string, g: number): Promise<number | null> {
    const id = ++this.sayId;
    return new Promise((res) => {
      this.pending.set(id, (pcm) => res(pcm && g === this.gen ? this.player.enqueue(pcm) : null));
      this.tts.postMessage({ type: "say", id, text, voice });
    });
  }

  private waits = new Set<() => void>();
  private wait(ms: number) { // resolves early on stop()
    return new Promise<void>((res) => {
      const done = () => { clearTimeout(t); this.waits.delete(done); res(); };
      const t = setTimeout(done, Math.max(0, ms));
      this.waits.add(done);
    });
  }
  private until(ctxTime: number) { return this.wait((ctxTime - this.player.ctx.currentTime) * 1000); }

  private async useModel(id: string) {
    if (!this.engine) {
      this.engine = new WebWorkerMLCEngine(new Worker(new URL("./slm.worker.ts", import.meta.url), { type: "module" }), {
        appConfig, initProgressCallback: (r) => this.ui.status(r.text),
      });
    }
    if (this.loadedModel !== id) { await this.engine.reload(id); this.loadedModel = id; }
  }

  async start(a: Debater, b: Debater, topic: string) {
    const g = ++this.gen;
    const alive = () => g === this.gen;
    const log: { who: "A" | "B"; text: string }[] = [];
    const hist = { A: [] as Msg[], B: [] as Msg[] };
    hist.B.push({ role: "user", content: `Topic: ${topic}\nGive your opening argument from your stance.` }); // B answers the opening first
    try {
      await this.player.ctx.resume();
      this.ui.status("Loading voice model…");
      await this.loadTts();
      // One turn: generate, synthesize and queue audio. Audio is scheduled behind whatever is still playing,
      // and transcript text is revealed when its sentence actually starts.
      const MAX_SENTENCES = 2;
      const turn = async (who: "A" | "B") => {
        const me = who === "A" ? a : b, other = who === "A" ? b : a;
        await this.useModel(me.modelId);
        const entry = { who, text: "" };
        const chunker = new Chunker();
        const spoken: Promise<void>[] = [];
        let full = "", startAt = 0, n = 0;
        const speak = (s: string) => {
          n++;
          full += (full ? " " : "") + s;
          spoken.push(this.say(s, me.voice, g).then((at) => {
            if (at === null) return;
            startAt ||= at;
            return this.until(at).then(() => {
              if (!alive()) return;
              if (!entry.text) { log.push(entry); this.ui.speaker(who); this.ui.status(`${me.name} speaking`); }
              entry.text += (entry.text ? " " : "") + s;
              this.ui.transcript([...log]);
            });
          }));
        };
        const stream = await this.engine!.chat.completions.create({
          messages: windowed(systemPrompt(me, other, who, topic), hist[who]),
          stream: true, max_tokens: 100, temperature: 0.8,
        });
        for await (const c of stream) {
          if (!alive()) break;
          chunker.push(c.choices[0]?.delta?.content ?? "").forEach(speak);
          if (n >= MAX_SENTENCES) { this.engine!.interruptGenerate(); break; } // small models ignore length rules
        }
        const tail = n < MAX_SENTENCES ? chunker.flush() : null;
        if (tail && alive()) speak(tail);
        await Promise.all(spoken);
        return { full: full || "...", startAt }; // empty reply would break role alternation
      };

      let who: "A" | "B" = "B";
      while (alive()) {
        const me = who === "A" ? a : b, next: "A" | "B" = who === "A" ? "B" : "A";
        const t = await turn(who);
        if (!alive()) break;
        hist[who].push({ role: "assistant", content: t.full });
        hist[next].push({ role: "user", content: `${me.name} said: "${t.full}"\nRebut this with a NEW argument in your own words. Do not repeat it.` });
        // Prefetch: the next turn is generated while this one plays, but never more than one turn ahead.
        await this.until(t.startAt);
        who = next;
      }
    } catch (e) {
      if (alive()) { this.ui.status(`Error: ${e instanceof Error ? e.message : e}`); this.ui.speaker(null); return; }
    }
    if (alive()) this.ui.status("Stopped");
    this.ui.speaker(null);
  }

  stop() {
    this.gen++;
    this.engine?.interruptGenerate();
    this.tts.postMessage({ type: "clear" });
    this.player.stop();
    this.pending.forEach((r) => r(null));
    this.pending.clear();
    [...this.waits].forEach((f) => f());
    this.ui.speaker(null);
    this.ui.status("Stopped");
  }
}
