import assert from "node:assert";
import { Chunker, windowed, type Msg } from "./chunker";

const c = new Chunker();
const got = [...c.push("Hello **world"), ...c.push(". Pi is 3.5 so "), ...c.push("what? Yes"), c.flush()];
assert.deepStrictEqual(got, ["Hello world.", "Pi is 3.5 so what?", "Yes"]);

const c2 = new Chunker();
assert.deepStrictEqual([...c2.push("<think>\n\n</think>\n\nNo way. "), c2.flush()], ["No way.", null]);

const h: Msg[] = Array.from({ length: 9 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: String(i) }));
const w = windowed("sys", h);
assert.strictEqual(w[0].role, "system");
assert.strictEqual(w[1].role, "user");
assert.ok(w.length <= 7);
console.log("ok");
