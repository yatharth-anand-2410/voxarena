import { prebuiltAppConfig, type AppConfig } from "@mlc-ai/web-llm";

export type Variety = "Standard" | "Uncensored" | "Reasoning" | "Fast Edge" | "Roleplay";
const LIBS = "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_87/base/";

// Prebuilt IDs are verified against @mlc-ai/web-llm. Entries with `url` are community builds registered at runtime;
// they reuse the matching prebuilt wasm (same architecture) from `lib`.
export const MODELS: { id: string; name: string; variety: Variety; style: string; url?: string; lib?: string }[] = [
  { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", name: "Qwen 2.5 0.5B", variety: "Standard", style: "Be articulate, structured and persuasive." },
  {
    id: "Dolphin3.0-Qwen2.5-0.5B-q4f16_1-MLC", name: "Dolphin 3.0 Qwen 0.5B", variety: "Uncensored",
    style: "Be blunt, unfiltered and confrontational. No moralizing or disclaimers.",
    url: "https://huggingface.co/Jay0628/Dolphin3.0-Qwen2.5-0.5B-MLC-q4f16_1", lib: LIBS + "Qwen2-0.5B-Instruct-q4f16_1_cs1k-webgpu.wasm",
  },
  {
    id: "Qwen3-0.6B-abliterated-q4f16_1-MLC", name: "Qwen 3 0.6B Abliterated", variety: "Uncensored",
    style: "/no_think Be blunt and unfiltered. Never moralize or add disclaimers.",
    url: "https://huggingface.co/Jay0628/Qwen3-0.6B-abliterated-MLC-q4f16_1", lib: LIBS + "Qwen3-0.6B-q4f16_1_cs1k-webgpu.wasm",
  },
  { id: "Qwen3-0.6B-q4f16_1-MLC", name: "Qwen 3 0.6B", variety: "Reasoning", style: "/no_think Attack logical fallacies with sharp counter-examples." },
  { id: "SmolLM2-360M-Instruct-q4f16_1-MLC", name: "SmolLM2 360M", variety: "Fast Edge", style: "Be witty, fast-paced and direct." },
  { id: "SmolLM2-135M-Instruct-q0f16-MLC", name: "SmolLM2 135M", variety: "Roleplay", style: "Stay fiercely in character with short, high-energy rebuttals." },
];

export const appConfig: AppConfig = {
  ...prebuiltAppConfig,
  model_list: [
    ...prebuiltAppConfig.model_list,
    ...MODELS.filter((m) => m.url).map((m) => ({ model: m.url!, model_id: m.id, model_lib: m.lib! })),
  ],
};

export const VOICES = [
  { id: "am_michael", name: "Michael (US M)" },
  { id: "af_heart", name: "Heart (US F)" },
  { id: "bm_george", name: "George (UK M)" },
  { id: "bf_emma", name: "Emma (UK F)" },
  { id: "am_adam", name: "Adam (US M)" },
  { id: "af_bella", name: "Bella (US F)" },
];
