// Capture ANSI frames for render.py from omp's real TUI components, drawn with
// the yami-kawaii palette over omp's dark-sunset theme and with blush installed:
// what a user with `/yandere colors on` sees. No model calls, fully deterministic.
// Writes demo/captures/:
//   chat.json      prompt.txt typed into a user bubble, plain.txt streaming into
//                  an assistant message, then the finalized rewrite.txt swapped
//                  in, which is how rewrite style refreshes after streaming ends
//   dashboard.json the `/yandere status` card while a scripted key sequence edits it
//   stalker.json   the real status-line brand segment over two peeking cycles
// Usage: COLORTERM=truecolor bun demo/capture.ts
import { getThemeByName, setThemeInstance, Theme } from "@oh-my-pi/pi-coding-agent";
import { Container } from "@oh-my-pi/pi-tui";
import { AssistantMessageComponent } from "@oh-my-pi/pi-tui/chat/assistant-message";
import { UserMessageComponent } from "@oh-my-pi/pi-tui/chat/user-message";
import { renderSegment } from "@oh-my-pi/pi-tui/status-line";
import type { SegmentContext } from "@oh-my-pi/pi-tui/status-line";
import { blush, blushMarks, installBlush, themePaint } from "../src/blush.ts";
import { createStatusCard, type YandereStatus } from "../src/status.ts";
import { buildYamiKawaiiTheme } from "../src/theme.ts";

type Frame = { key?: string | null; ms: number; lines: readonly string[] };

const transcripts = `${import.meta.dir}/transcripts`;
const captures = `${import.meta.dir}/captures`;
const THEME = "dark-sunset";

const base = await getThemeByName(THEME);
if (!base) throw new Error(`omp theme ${THEME} not found`);
if (base.getColorMode() !== "truecolor") throw new Error("run with COLORTERM=truecolor so colors match the theme exactly");
const theme = buildYamiKawaiiTheme(Theme, base);
setThemeInstance(theme);
const rendering = installBlush(Container, {
  isActive: () => true,
  transform: (text) => blush(text, themePaint(() => theme)),
  native: (text) => ({ text, marks: blushMarks(text) }),
});

// --- chat: type the prompt, stream the plain reply, then the finalized rewrite ------
const CHAT_WIDTH = 76;
const [prompt, plain, rewrite] = await Promise.all(["prompt.txt", "plain.txt", "rewrite.txt"].map(async (name) =>
  (await Bun.file(`${transcripts}/${name}`).text()).replace(/\r\n/g, "\n").trim()));
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const message = (text: string) => ({
  role: "assistant", content: [{ type: "text", text }], api: "demo", provider: "demo", model: "demo",
  usage, stopReason: "stop", timestamp: 0,
}) as never;
const chat: Frame[] = [{ ms: 600, lines: [] }];
for (let n = 8; n < prompt.length; n += 8) chat.push({ ms: 30, lines: new UserMessageComponent(prompt.slice(0, n)).render(CHAT_WIDTH) });
const sent = new UserMessageComponent(prompt).render(CHAT_WIDTH);
chat.push({ ms: 900, lines: sent });
const component = new AssistantMessageComponent();
for (let n = 6; n < plain.length + 6; n += 6) {
  component.updateContent(message(plain.slice(0, n)));
  chat.push({ ms: 40, lines: [...sent, "", ...component.render(CHAT_WIDTH)] });
}
chat.at(-1)!.ms = 1400;
component.updateContent(message(rewrite));
chat.push({ ms: 6000, lines: [...sent, "", ...component.render(CHAT_WIDTH)] });
await Bun.write(`${captures}/chat.json`, `${JSON.stringify({ theme: THEME, width: CHAT_WIDTH, frames: chat }, null, 1)}\n`);

// --- dashboard ---------------------------------------------------------------------
const DASH_WIDTH = 68;
const KEYS = { down: "\x1b[B", right: "\x1b[C", left: "\x1b[D", tab: "\t" } as const;
const status: YandereStatus = {
  enabled: true, style: "rewrite", level: "obsessed", locale: "auto", colorsEnabled: true,
  rewrite: "available", display: "available",
  nativeDisplay: rendering.isNativeSupported() ? "available" : "unavailable", promptFallback: false,
};
const card = createStatusCard(status, theme, () => {}, () => {});
// Each step: key to press (or null for the opening frame) and how long to hold the result.
const script: [keyof typeof KEYS | null, number][] = [
  [null, 1600],
  ["down", 500], ["right", 1100], ["right", 1100], ["left", 700], ["left", 900],
  ["down", 500], ["right", 1600], ["left", 900], ["left", 900], ["left", 1400], ["right", 700], ["right", 700], ["right", 2000],
  ["down", 500], ["right", 700], ["right", 900],
  ["tab", 2600], ["tab", 700],
  ["down", 500], ["down", 2600],
];
const dashboard: Frame[] = script.map(([key, ms]) => {
  if (key) card.handleInput!(KEYS[key]);
  return { key, ms, lines: card.render(DASH_WIDTH) };
});
await Bun.write(`${captures}/dashboard.json`, `${JSON.stringify({ theme: THEME, width: DASH_WIDTH, frames: dashboard }, null, 1)}\n`);

// --- stalker: sample the host's actual time-derived brand spinner -------------------
const stalker: Frame[] = [];
const cycleTicks = theme.getSpinnerFrames("activity").length;
for (let tick = 0; tick < cycleTicks * 2; tick += 3) {
  // The pi segment reads only these fields; no session/model is needed.
  const context = {
    now: new Date(tick * 80),
    turnElapsedMs: tick * 80,
    brandFgAnsi: theme.getFgAnsi("accent"),
  } as SegmentContext;
  stalker.push({ ms: 240, lines: [renderSegment("pi", context).content] });
}
await Bun.write(`${captures}/stalker.json`, `${JSON.stringify({ theme: THEME, kind: "stalker", width: 40, frames: stalker }, null, 1)}\n`);
console.log(`captured ${chat.length} chat frames, ${dashboard.length} dashboard frames and ${stalker.length} stalker frames`);
