export type Msg = { role: "system" | "user" | "assistant"; content: string };

// Streams tokens in, emits complete spoken sentences. Strips markdown and <think> blocks.
export class Chunker {
  private buf = "";
  push(t: string): string[] {
    this.buf += t;
    if (this.buf.includes("<think>")) {
      if (!this.buf.includes("</think>")) return [];
      this.buf = this.buf.replace(/<think>[\s\S]*?<\/think>/g, "");
    }
    const out: string[] = [];
    let m: RegExpMatchArray | null;
    // sentence end needs trailing whitespace, so "3.5" is not split mid-stream
    while ((m = this.buf.match(/^([\s\S]*?[.!?]+["')\]]*)\s+/))) {
      this.buf = this.buf.slice(m[0].length);
      const s = clean(m[1]);
      if (s) out.push(s);
    }
    return out;
  }
  flush(): string | null {
    const s = this.buf.includes("<think>") ? "" : clean(this.buf);
    this.buf = "";
    return s || null;
  }
}

const clean = (s: string) => s.replace(/[*_#`>~]|^\s*[-•]\s+/gm, "").replace(/\s+/g, " ").trim();

// Pinned system prompt + last 6 turns, trimmed so the window starts on a user turn.
export function windowed(system: string, hist: Msg[]): Msg[] {
  const tail = hist.slice(-6);
  while (tail.length && tail[0].role !== "user") tail.shift();
  return [{ role: "system", content: system }, ...tail];
}
