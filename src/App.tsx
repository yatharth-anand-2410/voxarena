import { useEffect, useRef, useState } from "react";
import { Debate, type Debater } from "./debate";
import { MODELS, VOICES } from "./models";

const hasGpu = "gpu" in navigator;
const variety = (d: Debater) => MODELS.find((m) => m.id === d.modelId)?.variety;
const init = (name: string, voice: string, modelId: string): Debater => ({ name, stance: "", modelId, voice });

function Card({ label, d, set, locked }: { label: string; d: Debater; set: (d: Debater) => void; locked: boolean }) {
  const f = "w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm";
  return (
    <div className="flex flex-1 flex-col gap-2 rounded-lg border border-neutral-800 p-4">
      <h2 className="font-semibold">Debater {label}</h2>
      <input className={f} disabled={locked} placeholder="Name" value={d.name} onChange={(e) => set({ ...d, name: e.target.value })} />
      <textarea className={f} disabled={locked} rows={2} placeholder="Stance (e.g. pineapple belongs on pizza)" value={d.stance} onChange={(e) => set({ ...d, stance: e.target.value })} />
      <select className={f} disabled={locked} value={d.modelId} onChange={(e) => set({ ...d, modelId: e.target.value })}>
        {MODELS.map((m) => <option key={m.id} value={m.id}>{m.name} [{m.variety}]</option>)}
      </select>
      <select className={f} disabled={locked} value={d.voice} onChange={(e) => set({ ...d, voice: e.target.value })}>
        {VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
    </div>
  );
}

export default function App() {
  const [a, setA] = useState(init("Ava", "af_heart", MODELS[0].id));
  const [b, setB] = useState(init("Ben", "am_michael", MODELS[0].id));
  const [topic, setTopic] = useState("");
  const [live, setLive] = useState(false);
  const [status, setStatus] = useState("");
  const [log, setLog] = useState<{ who: "A" | "B"; text: string }[]>([]);
  const [speaker, setSpeaker] = useState<"A" | "B" | null>(null);
  const [level, setLevel] = useState(0);
  const debate = useRef<Debate>(null!);
  debate.current ??= new Debate({ status: setStatus, transcript: setLog, speaker: setSpeaker });

  useEffect(() => {
    const t = setInterval(() => setLevel(debate.current.player.level()), 50);
    return () => clearInterval(t);
  }, []);

  const start = async () => {
    setLive(true); setLog([]);
    await debate.current.start(a, b, topic);
    setLive(false);
  };

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-neutral-950 p-6 text-neutral-100">
      <h1 className="mb-4 text-2xl font-bold">VoxArena</h1>
      {!hasGpu && <p className="mb-4 rounded bg-red-900 p-3 text-sm">WebGPU is not available in this browser. Use recent Chrome or Edge.</p>}
      <div className="flex gap-4"><Card label="A" d={a} set={setA} locked={live} /><Card label="B" d={b} set={setB} locked={live} /></div>
      <input className="mt-4 w-full rounded border border-neutral-700 bg-neutral-900 p-2" disabled={live} placeholder="Opening topic (Debater B replies first)" value={topic} onChange={(e) => setTopic(e.target.value)} />
      <div className="mt-3 flex items-center gap-3">
        {live
          ? <button className="rounded bg-red-600 px-5 py-2 font-semibold" onClick={() => debate.current.stop()}>Stop</button>
          : <button className="rounded bg-emerald-600 px-5 py-2 font-semibold disabled:opacity-40" disabled={!hasGpu || !topic.trim()} onClick={start}>Start</button>}
        <span className="text-sm text-neutral-400">{status}</span>
      </div>
      <div className="mt-3 h-1.5 rounded bg-neutral-800"><div className="h-full rounded bg-emerald-500 transition-[width] duration-75" style={{ width: `${level * 100}%` }} /></div>
      <div className="mt-4 flex flex-col gap-2">
        {log.map((m, i) => (
          <p key={i} className={`rounded p-3 text-sm ${m.who === speaker && i === log.length - 1 ? "bg-neutral-800 font-medium" : "bg-neutral-900"}`}>
            <b>{m.who === "A" ? a.name : b.name}</b> <span className="text-xs text-neutral-500">[{variety(m.who === "A" ? a : b)}]</span>: {m.text}
          </p>
        ))}
      </div>
    </div>
  );
}
