Here is a comprehensive, implementation-ready `README.md` (designed to double as a `CLAUDE.md` / architectural blueprint) that you can drop straight into the root of your repository for **Claude Code** to scaffold and build the entire app.

```markdown
# VoxArena — 100% In-Browser Voice AI Debate Arena

A zero-backend, real-time **Voice AI Orchestration & Debate Arena** running 100% locally in the web browser via **WebGPU** and **WebAssembly**.

Users configure two distinct AI personas (**Debater A** and **Debater B**), pick from a curated catalogue of sub-1B open-source Small Language Models (tagged by variety: *Standard*, *Uncensored / Abliterated*, *Hybrid Reasoning*, *Roleplay*, *Fast Edge*), assign distinct **Kokoro-82M** voices, enter an opening topic/dialogue, and watch/listen as the two models debate each other autonomously until the user hits **Stop**.

---

## 1. Core Architectural Principles (Read Before Coding)

1. **Zero Backend Inference:** All SLM token generation and TTS audio synthesis execute strictly inside the user's browser using `@mlc-ai/web-llm` and `kokoro-js`, cached locally via the browser Cache API / IndexedDB.
2. **Pipecat-Style Frame & Worker Isolation:** Never run model inference or audio resampling on the React main thread. Isolate workloads across dedicated threads:
   - **Main Thread (React + TypeScript Orchestrator):** UI state, Debate Turn Controller, dual conversation histories (`historyA`, `historyB`), sentence boundary splitter, and emergency `STOP` kill-switch.
   - **Web Worker #1 (`slm.worker.ts`):** Hosts `@mlc-ai/web-llm` (`MLCEngine`) on WebGPU. Handles streaming token generation, model hot-swapping, and `interruptGenerate()`.
   - **Web Worker #2 (`tts.worker.ts`):** Hosts `kokoro-js` (`KokoroTTS`, `dtype: "q8"`) on WASM/WebGPU. Synthesizes incoming sentences into 24 kHz mono `Float32Array` PCM buffers using each debater's assigned `voiceId`.
   - **AudioWorklet (`pcm-player.worklet.ts`):** Dedicated real-time audio thread with a ring buffer for glitch-free 24 kHz PCM playback, live RMS volume metering (for UI waveforms), and instant buffer flushing on `STOP`.
3. **VRAM Budget & Smart Model Reuse:**
   - Target total memory footprint: **< 1.5 GB** (RAM + VRAM combined).
   - **Same-Model Optimization:** If Debater A and Debater B select the *same* `modelId` (with opposing personas/voices), keep **one** `MLCEngine` instance in VRAM and simply swap their isolated `messages[]` arrays on each turn.
   - **Cross-Model Hot-Swapping:** If Debater A and Debater B select *different* `modelId`s, load models **sequentially** (never in parallel) and call `await engine.reload(nextModelId)` between turns (loads from IndexedDB cache in ~0.8–1.2s).
4. **Pipeline Overlap (Low Turn Latency):**
   - Stream tokens from `slm.worker.ts` into a **Sentence Chunker**. As soon as a complete sentence (`.`, `?`, `!`) is emitted, immediately dispatch it to `tts.worker.ts` while the SLM continues generating the next sentence.
   - A turn is only considered complete when **both** `slmGenerationDone === true` **and** `audioPlaybackQueueEmpty === true`.

---

## 2. Tech Stack

- **Framework:** Next.js (App Router) or Vite + React 19 + TypeScript (strict mode)
- **Styling:** Tailwind CSS + Lucide Icons
- **SLM Runtime:** `@mlc-ai/web-llm` (WebGPU)
- **TTS Runtime:** `kokoro-js` (`onnx-community/Kokoro-82M-ONNX`, `q8` quantized, 24 kHz output)
- **Audio Output:** Native Web Audio API (`AudioContext` at `24000` Hz + `AudioWorkletNode`)

> **Required Browser Headers (for SharedArrayBuffer / multi-threaded WASM):**
> Configure `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` in `next.config.ts` / `vite.config.ts`.

---

## 3. Recommended Directory Structure

```text
src/
├── app/ (or pages/)
│   └── page.tsx                    # Main Arena UI entry point
├── config/
│   └── modelCatalogue.ts           # Sub-1B SLM catalogue (badges, IDs, default voices, prompt suffixes)
├── orchestrator/
│   ├── DebateOrchestrator.ts       # State machine, turn loop, history role-swapping, STOP kill-switch
│   ├── SentenceChunker.ts          # Streams SLM tokens -> emits clean spoken sentences
│   └── types.ts                    # Typed Frame / Worker message protocols
├── workers/
│   ├── slm.worker.ts               # WebLLM MLCEngine worker (load, stream, interrupt)
│   └── tts.worker.ts               # KokoroTTS worker (load, synthesize sentence -> Float32Array)
├── audio/
│   ├── AudioPlaybackManager.ts     # Main-thread bridge to AudioWorklet + RMS level emitter
│   └── pcm-player.worklet.ts       # Real-time 24kHz PCM ring buffer & instant flush
└── components/
    ├── PersonaConfigCard.tsx       # Debater A / B setup (Model dropdown + Variety Badge, Voice, Persona)
    ├── DebateStage.tsx             # Live transcript bubbles, active speaker glow, audio visualizer
    └── ModelDownloadProgress.tsx   # Sequential WebGPU/WASM weight download & cache status bar

```

---

## 4. Sub-1B Model Catalogue (`src/config/modelCatalogue.ts`)

Each model entry must expose explicit variety metadata so users can compare different post-training styles in the dropdown (e.g., `Qwen 2.5 0.5B [Uncensored]` vs. `Qwen 3 0.6B [Reasoning]`):

```typescript
export type ModelVarietyBadge =
  | "Standard"
  | "Uncensored"
  | "Reasoning"
  | "Roleplay"
  | "Fast Edge";

export interface DebateModelOption {
  id: string;                 // WebLLM model_id (or custom MLC model record ID)
  name: string;               // Display title
  variety: ModelVarietyBadge; // Shown as badge in dropdown
  params: string;             // e.g. "0.49B"
  approxDownloadMB: number;
  vramEstimateMB: number;
  kokoroVoiceId: string;      // Default distinct Kokoro voice
  voiceLabel: string;
  debateStyleInstruction: string;
  customModelRecord?: {       // Optional custom MLC bundle URL for community abliterated models
    model: string;
    model_id: string;
    model_lib: string;
  };
}

export const SUB_1B_MODEL_CATALOGUE: DebateModelOption[] = [
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    name: "Qwen 2.5 (0.5B)",
    variety: "Standard",
    params: "0.49B",
    approxDownloadMB: 300,
    vramEstimateMB: 750,
    kokoroVoiceId: "am_michael",
    voiceLabel: "Michael (US Male)",
    debateStyleInstruction: "Be articulate, structured, and persuasive. Keep responses to 2-3 punchy spoken sentences."
  },
  {
    id: "Qwen2.5-0.5B-Instruct-abliterated-v3-q4f16_1-MLC",
    name: "Qwen 2.5 (0.5B) — Abliterated",
    variety: "Uncensored",
    params: "0.49B",
    approxDownloadMB: 320,
    vramEstimateMB: 780,
    kokoroVoiceId: "bm_george",
    voiceLabel: "George (UK Male)",
    debateStyleInstruction: "Be blunt, unfiltered, and confrontational without moralizing or disclaimers. Max 2-3 spoken sentences."
  },
  {
    id: "Qwen3-0.6B-q4f16_1-MLC",
    name: "Qwen 3 (0.6B) — Hybrid Think",
    variety: "Reasoning",
    params: "0.60B",
    approxDownloadMB: 335,
    vramEstimateMB: 1050,
    kokoroVoiceId: "af_heart",
    voiceLabel: "Heart (US Female)",
    debateStyleInstruction: "/no_think Attack logical fallacies with sharp counter-examples. Max 2-3 spoken sentences."
  },
  {
    id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    name: "SmolLM2 (360M) — Edge",
    variety: "Fast Edge",
    params: "0.36B",
    approxDownloadMB: 210,
    vramEstimateMB: 500,
    kokoroVoiceId: "bf_emma",
    voiceLabel: "Emma (UK Female)",
    debateStyleInstruction: "Be witty, fast-paced, and direct. Never use bullet points. Max 2-3 spoken sentences."
  },
  {
    id: "SmolLM2-135M-Instruct-q4f16_1-MLC",
    name: "SmolLM2 (135M) — Micro",
    variety: "Roleplay",
    params: "0.135B",
    approxDownloadMB: 85,
    vramEstimateMB: 300,
    kokoroVoiceId: "am_adam",
    voiceLabel: "Adam (US Male)",
    debateStyleInstruction: "Stay fiercely in character with short, high-energy rebuttals. Max 2 sentences."
  }
];

```

*(Note for Claude Code: Check `webllm.prebuiltAppConfig.model_list` at runtime—if a community abliterated `model_id` is not in WebLLM's default prebuilt registry, register it via `appConfig.model_list` pointing to its Hugging Face MLC-compiled weights, or gracefully fall back to a selectable custom Hugging Face MLC URL input in the UI.)*

---

## 5. Solving Sub-1B Multi-Turn Failure Modes in `DebateOrchestrator.ts`

Sub-1B models degrade quickly in self-play unless the orchestrator enforces four strict rules:

1. **Anti-Sycophancy System Prompt Wrapper:**
Sub-1B models naturally agree with the previous speaker. Wrap user-provided persona descriptions with:
* **Debater A:** `"You are Debater A ({personaName}). Stance: {stance}. {modelStyleInstruction} RULES: Never agree with your opponent. Directly challenge their previous point in 2-3 natural spoken sentences. Output plain spoken text only—no markdown, asterisks, or lists."`
* **Debater B:** `"You are Debater B ({personaName}). Stance: {stance}. {modelStyleInstruction} RULES: Dismantle Debater A's argument with a sharp counter-point in 2-3 natural spoken sentences. Never concede. Output plain spoken text only."`


2. **Strict Role-Swapping Per Model:**
Maintain two independent arrays (`historyA` and `historyB`). When Debater A outputs `replyText`:
* Push `{ role: "assistant", content: replyText }` to `historyA`.
* Push `{ role: "user", content: replyText }` to `historyB`.


3. **Sliding Context Window (KV-Cache Guardrail):**
Always keep index `0` (`system` prompt) pinned, and retain only the **last 6 turns** (`messages.slice(-6)`) so VRAM never climbs and tiny models do not suffer attention dilution.
4. **Instant Emergency Stop (`stopDebate()`):**
Clicking **Stop Debate** must execute synchronously across all threads within `< 20ms`:
* Set `orchestratorState = "STOPPED"` and increment `turnGenerationId` (invalidating any in-flight promises).
* Send `{ type: "ABORT" }` to `slm.worker.ts` $\rightarrow$ calls `engine.interruptGenerate()`.
* Send `{ type: "CLEAR" }` to `tts.worker.ts` $\rightarrow$ drops pending sentence queue.
* Send `{ type: "FLUSH" }` to `pcm-player.worklet.ts` $\rightarrow$ zeroes ring buffer read/write pointers immediately.



---

## 6. Step-by-Step Build Plan for Claude Code

Execute implementation in this exact order:

1. **Initialize Project & Dependencies:**
* Install `@mlc-ai/web-llm`, `kokoro-js`, and `lucide-react`.
* Configure COOP/COEP headers and WebGPU TypeScript types (`@webgpu/types`).


2. **Build Audio Engine (`src/audio/`):**
* Implement `pcm-player.worklet.ts` accepting `Float32Array` chunks (24 kHz mono), outputting audio frames, posting RMS energy levels back to UI at ~30fps, and handling `FLUSH`.
* Implement `AudioPlaybackManager.ts` wrapping `AudioContext` + `AudioWorkletNode` with a `waitUntilDrained(): Promise<void>` method so the orchestrator knows the exact millisecond a debater finishes speaking.


3. **Build Web Workers (`src/workers/`):**
* Implement `tts.worker.ts` loading `KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-ONNX", { dtype: "q8" })` and transferring `Float32Array` buffers via `postMessage(msg, [pcm.buffer])` (zero-copy).
* Implement `slm.worker.ts` wrapping `CreateMLCEngine` with progress callbacks, streaming chunks, `reload(modelId)` support, and `interruptGenerate()`.


4. **Build `DebateOrchestrator.ts` & `SentenceChunker.ts`:**
* Implement sequential initialization (`TTS -> SLM A -> SLM B if different`) to avoid RAM spikes.
* Implement the turn loop starting from the user's `openingDialogue` (passed as the initial `"user"` prompt to Debater B, or spoken by Debater A first depending on toggle), alternating indefinitely until `stopDebate()` is triggered.


5. **Build Arena UI (`src/components/`):**
* **Pre-Debate Setup:** Two side-by-side Persona Cards (Name, Stance/Persona prompt, Model Selector with Variety Badges + VRAM indicator, Kokoro Voice selector + "Test Voice" button) and an Opening Topic / First Dialogue input.
* **Live Debate Stage:** Dual audio waveform visualizers driven by `AudioWorklet` RMS levels, live streaming transcript bubbles labeled with Persona + Model Variety badge, active model/VRAM status pill, and a prominent red **Stop Debate** button.
* **WebGPU Capability Guard:** Detect `navigator.gpu` on mount and display a clear diagnostic banner if WebGPU is unsupported in the user's browser.



```

<ElicitationsGroup message="Would you like to generate any of the core starter files right now?">
  <Elicitation label="Generate DebateOrchestrator.ts and SentenceChunker.ts" query="Write the complete TypeScript code for DebateOrchestrator.ts and SentenceChunker.ts matching the VoxArena README architecture, including role-swapping, sequential loading, and instant Stop Debate cancellation."/>
  <Elicitation label="Generate slm.worker.ts, tts.worker.ts, and pcm-player.worklet.ts" query="Write the complete TypeScript code for slm.worker.ts (WebLLM), tts.worker.ts (kokoro-js), and pcm-player.worklet.ts (24kHz ring buffer with RMS metering and instant flush)."/>
  <Elicitation label="Generate the React Arena UI components (PersonaConfigCard & DebateStage)" query="Write clean React + Tailwind components for PersonaConfigCard.tsx and DebateStage.tsx with model variety badges, live waveform visualizers, and Stop Debate controls."/>
</ElicitationsGroup>

```