import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yandereExtension from "../src/index.ts";
import { DERE_LEVELS, type DereLevel } from "../src/yandere.ts";

type Handler = (event: unknown, ctx?: unknown) => unknown;
type Rewrite = { content: { type: string; text?: string }[] } | undefined;

const transcripts = join(import.meta.dir, "transcripts");
const [prompt, plain] = await Promise.all(["prompt.txt", "plain.txt"].map(async (name) =>
  (await Bun.file(join(transcripts, name)).text()).replace(/\r\n/g, "\n").trim()));

const level = (process.argv[2] ?? "yanderu") as DereLevel;
if (!DERE_LEVELS.includes(level)) throw new Error(`level must be one of ${DERE_LEVELS.join(", ")}`);
const metaFile = Bun.file(join(transcripts, "meta.json"));
const model: string = process.argv[3] ?? (await metaFile.exists() ? (await metaFile.json()).model : "unknown");
const agentDir = await mkdtemp(join(tmpdir(), "omp-yandere-demo-"));
const handlers: Record<string, Handler> = {};
type Command = (args: string, ctx: unknown) => Promise<void>;
let command: Command | undefined;
yandereExtension({
  pi: { getAgentDir: () => agentDir, Theme: class {}, setThemeInstance() {}, theme: undefined },
  registerCommand(_name: string, options: { handler: Command }) { command = options.handler; },
  on(name: string, handler: Handler) { handlers[name] = handler; },
} as never);

const main = { agent: { kind: "main" } };
const assistant = (text: string) => ({ message: { role: "assistant", content: [{ type: "text", text }] } });
try {
  await command!(`level ${level}`, { mode: "print", ui: { notify() {} } });
  await handlers.assistant_message!(assistant("warm-up"), main);
  await handlers.before_agent_start!({ prompt, systemPrompt: [] }, main);
  const result = await handlers.assistant_message!(assistant(plain), main) as Rewrite;
  const rewritten = result?.content[0]?.text ?? plain;
  await Bun.write(join(transcripts, "rewrite.txt"), `${rewritten}\n`);
  await Bun.write(metaFile, `${JSON.stringify({ model, level }, null, 2)}\n`);
  console.log(rewritten);
} finally {
  await rm(agentDir, { recursive: true, force: true });
}
