import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getThemeByName, Theme } from "@oh-my-pi/pi-coding-agent";
import { blush, blushMarks, installBlush, themePaint } from "../src/blush.ts";
import yandereExtension, { REWRITE_NOTE, YANDERE_PROMPT } from "../src/index.ts";
import { jealousOpener, SENPAI, YANDERE_FACES, yanderify, yanderifyMarkdownProse, yanderifyProse } from "../src/yandere.ts";

type Handler = (...args: unknown[]) => unknown;
type Command = (args: string, ctx: unknown) => Promise<void>;
let handlers: Record<string, Handler>;
type AgentStartResult = { systemPrompt: string[] } | undefined;
type RewriteResult = { content: Array<{ type: string; text?: string; id?: string }> } | undefined;
let command: Command;
let commandName: string;
let notices: string[];
let stateDir = "";
let baseTheme: Theme;
let activeTheme: Theme;
const ctx = {
  mode: "tui",
  ui: {
    notify: (msg: string) => notices.push(msg),
    setStatus: () => {},
    get theme() { return activeTheme; },
  },
};
const event = () => ({ systemPrompt: ["base policy"] });

class MockContainer {
  addChild(_child: unknown) {}
}
class MockAssistant extends MockContainer {
  transform: ((text: string) => string) | undefined;
  text = "";
  invalidations = 0;
  constructor(text: string) {
    super();
    this.addChild({});
    this.updateContent(text);
  }
  setTextColorTransform(transform?: (text: string) => string) { this.transform = transform; }
  updateContent(text: string) { this.text = text; }
  invalidate() { this.invalidations++; this.updateContent(this.text); }
  render() { return this.transform?.(this.text) ?? this.text; }
  describe() { return { k: "col", c: [{ k: "md", key: "t0", p: { text: this.text } }] }; }
}

function installExtension(withContainer = true) {
  const pi = {
    pi: {
      getAgentDir: () => stateDir,
      Theme,
      setThemeInstance: (theme: Theme) => { activeTheme = theme; },
      get theme() { return activeTheme; },
      ...(withContainer ? { Container: MockContainer } : {}),
    },
    registerCommand(name: string, opts: { handler: Command }) {
      commandName = name;
      command = opts.handler;
    },
    on(name: string, handler: Handler) {
      handlers[name] = handler;
    },
  };
  yandereExtension(pi as never);
}

beforeEach(async () => {
  if (stateDir) await rm(stateDir, { recursive: true, force: true });
  stateDir = await mkdtemp(join(tmpdir(), "omp-yandere-test-"));
  notices = [];
  handlers = {};
  baseTheme = await getThemeByName("dark") as Theme;
  activeTheme = baseTheme;
  installExtension();
});
afterEach(() => {
  installBlush(MockContainer, { isActive: () => false, transform: (text) => text, native: (text) => ({ text, marks: [] }) }).dispose();
});
afterAll(async () => {
  if (stateDir) await rm(stateDir, { recursive: true, force: true });
});

describe("omp-yandere", () => {
  test("registers /yandere and assistant_message hook", () => {
    expect(commandName).toBe("yandere");
    expect(handlers.assistant_message).toBeFunction();
  });

  test("prompt-styles the first turn, then rewrites finalized text blocks", async () => {
    const first = await handlers.before_agent_start(event(), { agent: { kind: "main" } }) as AgentStartResult;
    expect(first?.systemPrompt).toContain(YANDERE_PROMPT);
    await handlers.assistant_message({ message: { role: "assistant", content: [{ type: "text", text: "first reply" }] } });
    // Once rewriting is proven, only a short note explains the styled history.
    expect(await handlers.before_agent_start(event(), { agent: { kind: "main" } })).toEqual({ systemPrompt: ["base policy", REWRITE_NOTE] });
    expect(REWRITE_NOTE).not.toContain("senpai");

    const text = "Really nice work, you did it together!";
    const content = [{ type: "text", text }, { type: "toolCall", id: "keep" }];
    const result = await handlers.assistant_message({ message: { role: "assistant", content } }) as RewriteResult;
    expect(result?.content).toHaveLength(2);
    expect(result?.content[0]?.text).not.toBe(text);
    expect(result?.content[0]?.text).toBe(yanderify(text));
    expect(result?.content[1]).toEqual(content[1]);
  });

  test("does not mutate input blocks", async () => {
    const content = [{ type: "text", text: "really nice!" }];
    await handlers.assistant_message({ message: { role: "assistant", content } });
    expect(content[0].text).toBe("really nice!");
  });

  test("falls back to prompt mode when host lacks the rewrite hook", async () => {
    await handlers.message_end({ message: { role: "assistant", stopReason: "stop" } });
    const input = event();
    expect((await handlers.before_agent_start(input, { agent: { kind: "main" } })) as AgentStartResult).toEqual({
      systemPrompt: ["base policy", YANDERE_PROMPT],
    });
    expect(input.systemPrompt).toEqual(["base policy"]);
  });

  test("/yandere off disables, /yandere on enables", async () => {
    await command("off", ctx);
    expect(await handlers.before_agent_start(event(), { agent: { kind: "main" } })).toBeUndefined();
    await command(" ON ", ctx);
    await handlers.message_end({ message: { role: "assistant", stopReason: "stop" } });
    expect(((await handlers.before_agent_start(event(), { agent: { kind: "main" } })) as AgentStartResult)?.systemPrompt).toContain(YANDERE_PROMPT);
  });

  test("remembers /yandere off across extension reloads", async () => {
    await command("off", ctx);
    handlers = {};
    installExtension();
    expect(await handlers.before_agent_start(event(), { agent: { kind: "main" } })).toBeUndefined();
    expect(await Bun.file(join(stateDir, "omp-yandere.json")).json()).toEqual({ enabled: false, colors: false, style: "rewrite", level: "obsessed", locale: "auto" });
  });

  test("applies reversible yami-kawaii chat colors only in the TUI", async () => {
    await handlers.session_start({}, ctx);
    expect(activeTheme).toBe(baseTheme);
    await command("colors on", ctx);
    const yamiTheme = activeTheme;
    expect(yamiTheme).not.toBe(baseTheme);
    expect(yamiTheme.getColorHex("mdHeading")).toBe("#ff6fa3");
    expect(yamiTheme.getColorHex("error")).toBe(baseTheme.getColorHex("error"));

    await command("colors off", ctx);
    expect(activeTheme).toBe(baseTheme);
    await command("colors on", ctx);
    expect(activeTheme).not.toBe(baseTheme);
    await command("off", ctx);
    expect(activeTheme).toBe(baseTheme);
    expect(await Bun.file(join(stateDir, "omp-yandere.json")).json()).toEqual({ enabled: false, colors: true, style: "rewrite", level: "obsessed", locale: "auto" });
  });

  test("remembers the colors preference and only applies it in TUI sessions", async () => {
    await command("colors on", ctx);
    expect(activeTheme).not.toBe(baseTheme);
    activeTheme = baseTheme;
    handlers = {};
    installExtension();
    const rpcContext = { mode: "rpc", ui: ctx.ui };
    await handlers.session_start({}, rpcContext);
    expect(activeTheme).toBe(baseTheme);
    expect(await Bun.file(join(stateDir, "omp-yandere.json")).json()).toEqual({ enabled: true, colors: true, style: "rewrite", level: "obsessed", locale: "auto" });
  });

  test("/yandere prompt selects live prompt-based style", async () => {
    await command("prompt", ctx);
    expect(((await handlers.before_agent_start(event(), { agent: { kind: "main" } })) as AgentStartResult)?.systemPrompt).toContain(YANDERE_PROMPT);
  });

  test("prompt protects exact-text surfaces and describes the yandere persona", () => {
    for (const surface of ["code", "file paths", "URLs", "tool call arguments", "commit messages", "(◕‿◕)♡", "┬┴┬┴┤･ω･)ﾉ"]) {
      expect(YANDERE_PROMPT).toContain(surface);
    }
    for (const trait of ["senpai", "possessive", "jealous", "watching", "yandere switch", "never real threats"]) {
      expect(YANDERE_PROMPT).toContain(trait);
    }
  });

  test("every obsession level actually rewrites the persona prompt", async () => {
    await command("prompt", ctx);
    const prompts: Record<string, string> = {};
    for (const level of ["dere", "clingy", "obsessed", "yanderu"]) {
      await command(`level ${level}`, ctx);
      prompts[level] = ((await handlers.before_agent_start(event(), { agent: { kind: "main" } })) as AgentStartResult)!.systemPrompt[1]!;
    }
    expect(prompts.obsessed).toBe(YANDERE_PROMPT);
    expect(prompts.dere).toContain("deredere only");
    expect(prompts.dere).toContain("no jealousy");
    expect(prompts.dere).toContain("no yandere switch");
    expect(prompts.dere).toContain("no stutters or tildes");
    expect(prompts.dere).not.toContain("stretch words");
    expect(prompts.clingy).toContain("lightly clingy and possessive");
    expect(prompts.clingy).toContain("rarely a hint of jealousy");
    expect(prompts.clingy).toContain("no yandere switch yet");
    expect(prompts.clingy).toContain("very rare stutter");
    expect(prompts.yanderu).toContain("fully yanderu");
    expect(prompts.yanderu).toContain("more frequent stutter");
  });

  test("persists display, level and locale and restores them without prompt/history styling", async () => {
    await command("display", ctx);
    await command("level YANDERU", ctx);
    await command("locale TR", ctx);
    await command("colors on", ctx);
    await command("off", ctx);
    const saved = { enabled: false, colors: true, style: "display", level: "yanderu", locale: "tr" };
    expect(await Bun.file(join(stateDir, "omp-yandere.json")).json()).toEqual(saved);
    handlers = {};
    installExtension();
    await handlers.session_start({}, ctx);
    await command("status", ctx);
    expect(notices.at(-1)).toContain("yandere off; style=display; level=yanderu; locale=tr; colors=on");
    await command("on", ctx);
    expect(await handlers.before_agent_start(event(), { agent: { kind: "main" } })).toBeUndefined();
    const content = [{ type: "text", text: "really lovely" }, { type: "toolCall", id: "exact" }];
    expect(await handlers.assistant_message({ message: { role: "assistant", content } })).toBeUndefined();
    expect(content).toEqual([{ type: "text", text: "really lovely" }, { type: "toolCall", id: "exact" }]);
    expect(new MockAssistant("really lovely").render()).toBe(blush(yanderifyProse("really lovely", { level: "yanderu", locale: "tr" }), themePaint(() => activeTheme)));
  });

  test("partial settings keep rewrite/obsessed/auto defaults", async () => {
    await Bun.write(join(stateDir, "omp-yandere.json"), JSON.stringify({ enabled: false, colors: true }));
    await handlers.session_start({}, ctx);
    await command("status", ctx);
    expect(notices.at(-1)).toContain("yandere off; style=rewrite; level=obsessed; locale=auto; colors=on");
    await command("on", ctx);
    expect(await Bun.file(join(stateDir, "omp-yandere.json")).json()).toEqual({ enabled: true, colors: true, style: "rewrite", level: "obsessed", locale: "auto" });
  });

  test("invalid stored settings retain safe defaults", async () => {
    await Bun.write(join(stateDir, "omp-yandere.json"), JSON.stringify({ enabled: "false", colors: 1, style: "other", level: "max", locale: "de" }));
    await handlers.session_start({}, ctx);
    await command("status", ctx);
    expect(notices.at(-1)).toContain("yandere on; style=rewrite; level=obsessed; locale=auto; colors=off");
  });

  test("display refreshes existing prose with colors off and honors level/locale/off changes", async () => {
    const text = "really you and me together forever, so very good yoktur tehlikelidir";
    const component = new MockAssistant(text);
    expect(component.render()).toBe(text);
    await command("display", ctx);
    expect(component.render()).toBe(yanderifyProse(text));
    expect(component.render()).not.toBe(text);
    expect(component.invalidations).toBeGreaterThan(0);
    expect(activeTheme).toBe(baseTheme);
    await command("level clingy", ctx);
    expect(component.render()).toBe(yanderifyProse(text, { level: "clingy", locale: "auto" }));
    await command("locale en", ctx);
    expect(component.render()).toBe(yanderifyProse(text, { level: "clingy", locale: "en" }));
    await command("level yanderu", ctx);
    expect(component.render()).toBe(yanderifyProse(text, { level: "yanderu", locale: "en" }));
    await command("off", ctx);
    expect(component.render()).toBe(text);
    await command("on", ctx);
    expect(component.render()).toBe(yanderifyProse(text, { level: "yanderu", locale: "en" }));
    await command("rewrite", ctx);
    expect(component.render()).toBe(text);
  });

  test("native display composes semantic blush and refreshes without changing stored prose", async () => {
    const text = "really you ehehe~ (◕‿◕)♡ ^^ and `really you`\n\n> ~~~\n> really you\n> ~~~\n\n- ```\n  really you\n  ```\n\nHello `code\nreally world\ncode` really lovely you ♡.";
    const component = new MockAssistant(text);
    await command("display", ctx);
    await command("colors on", ctx);
    const md = component.describe().c[0]!;
    expect(md.p.text).toBe(yanderifyMarkdownProse(text));
    expect(md.p.text).not.toBe(text);
    expect(md.p.text).toContain("> ~~~\n> really you\n> ~~~");
    expect(md.p.text).toContain("- ```\n  really you\n  ```");
    expect(md.p.text).toContain("`code\nreally world\ncode`");
    expect("marks" in md.p ? md.p.marks : undefined).toEqual(blushMarks(yanderifyMarkdownProse(text)));
    expect(blushMarks(yanderifyMarkdownProse(text)).map((mark) => mark.t)).toEqual(expect.arrayContaining(["ehehe~", "(◕‿◕)♡", "♡"]));
    expect(component.text).toBe(text);
    expect(JSON.stringify(component.describe())).not.toContain("\\u001b");
    await command("colors off", ctx);
    expect(Object.hasOwn(component.describe().c[0]!.p, "marks")).toBe(false);
    await command("level yanderu", ctx);
    expect(component.describe().c[0]!.p.text).toBe(yanderifyMarkdownProse(text, { level: "yanderu" }));
    component.setTextColorTransform((run) => `HOST:${run}`);
    expect(component.describe().c[0]!.p).toEqual({ text });
    await command("off", ctx);
    expect(component.describe().c[0]!.p).toEqual({ text });
  });

  test("composes blush after display prose and leaves host transforms authoritative", async () => {
    const text = "really lovely you ehehe~";
    const component = new MockAssistant(text);
    await command("display", ctx);
    await command("colors on", ctx);
    const expected = blush(yanderifyProse(text), themePaint(() => activeTheme));
    expect(component.render()).toBe(expected);
    component.setTextColorTransform((run) => `HOST:${run}`);
    component.updateContent(text);
    await command("level yanderu", ctx);
    await command("colors off", ctx);
    expect(component.render()).toBe(`HOST:${text}`);
    component.setTextColorTransform(undefined);
    component.invalidate();
    expect(component.render()).toBe(yanderifyProse(text, { level: "yanderu" }));
  });

  test("display never falls back to a prompt even without a Container or rewrite hook", async () => {
    installExtension(false);
    await command("display", ctx);
    await handlers.message_end({ message: { role: "assistant", stopReason: "stop" } });
    const input = event();
    expect(await handlers.before_agent_start(input, { agent: { kind: "main" } })).toBeUndefined();
    expect(input.systemPrompt).toEqual(["base policy"]);
    expect(await handlers.assistant_message({ message: { role: "assistant", content: [{ type: "text", text: "really lovely" }] } })).toBeUndefined();
    await command("status", ctx);
  });

  test("status reports observation honestly and never changes settings", async () => {
    const file = Bun.file(join(stateDir, "omp-yandere.json"));
    await command("status", ctx);
    expect(await file.exists()).toBe(false);
    expect(notices.at(-1)).toContain("Tern native prose=waiting for first reply");
    new MockAssistant("really lovely");
    await handlers.assistant_message({ message: { role: "assistant", content: [] } });
    await command("status", ctx);
    expect(await file.exists()).toBe(false);
    expect(notices.at(-1)).toContain("Tern native prose=available");
    expect(notices.at(-1)).toContain("ACP/RPC display=unsupported");
  });

  test("preview keeps sample case and settings unchanged, even while disabled", async () => {
    await command("off", ctx);
    await command("level yanderu", ctx);
    await command("locale tr", ctx);
    const file = Bun.file(join(stateDir, "omp-yandere.json"));
    const saved = await file.text();
    const sample = 'Really Please stay with YOU `src/URL.ts` "Warning". You are so good.';
    await command(`PrEvIeW ${sample}`, ctx);
    expect(notices.at(-1)).toBe(yanderify(sample, { level: "yanderu", locale: "tr" }));
    expect(await file.text()).toBe(saved);
    await command("display", ctx);
    const displaySaved = await file.text();
    await command(`preview ${sample}`, ctx);
    expect(notices.at(-1)).toBe(yanderifyProse(sample, { level: "yanderu", locale: "tr" }));
    expect(await file.text()).toBe(displaySaved);
  });

  test("invalid commands and empty previews do not mutate settings", async () => {
    for (const input of ["level", "level max", "level ultra", "locale de", "display yes", "colors maybe", "status yes", "preview"]) {
      await command(input, ctx);
      expect(notices.at(-1)).toContain("Usage: /yandere");
      expect(await Bun.file(join(stateDir, "omp-yandere.json")).exists()).toBe(false);
    }
  });

  test("dere command keeps assistant words and tool content exact", async () => {
    await command("level dere", ctx);
    const text = "Really lovely progress. Merhaba, bugün beraber çalışalım. Keep `raw_code` unchanged.";
    const tool = { type: "toolCall", id: "raw_id" };
    const result = await handlers.assistant_message({
      message: { role: "assistant", content: [{ type: "text", text }, tool] },
    }) as RewriteResult;
    const styled = result?.content[0]?.text ?? "";
    expect(styled).toBe(yanderify(text, { level: "dere" }));
    expect(styled).not.toBe(text);
    expect(styled).not.toContain(SENPAI);
    expect([...YANDERE_FACES].sort((a, b) => b.length - a.length).reduce((rest, face) => rest.replaceAll(` ${face}`, ""), styled)).toBe(text);
    expect(result?.content[1]).toBe(tool);
    expect((await Bun.file(join(stateDir, "omp-yandere.json")).json()).level).toBe("dere");
  });
  test("rewrite and prompt use the selected intensity and locale", async () => {
    await command("level clingy", ctx);
    await command("locale tr", ctx);
    const input = { message: { role: "assistant", content: [{ type: "text", text: "really lovely yoktur" }] } };
    const result = await handlers.assistant_message(input) as RewriteResult;
    expect(result?.content[0]?.text ?? input.message.content[0].text).toBe(yanderify(input.message.content[0].text, { level: "clingy", locale: "tr" }));
    await command("prompt", ctx);
    const low = await handlers.before_agent_start(event(), { agent: { kind: "main" } }) as AgentStartResult;
    expect(low?.systemPrompt[1]).toContain("lightly clingy and possessive");
    expect(low?.systemPrompt[1]).toContain("Turkish-aware");
    expect(low?.systemPrompt[1]).toContain("English critical words remain protected");
    await command("level yanderu", ctx);
    await command("locale en", ctx);
    const max = await handlers.before_agent_start(event(), { agent: { kind: "main" } }) as AgentStartResult;
    expect(max?.systemPrompt[1]).toContain("fully yanderu");
    expect(max?.systemPrompt[1]).toContain("English-focused");
    expect(max?.systemPrompt[1]).not.toContain("Turkish-aware");
  });

  test("subagent turns never style prompts, rewrites, displays or command settings", async () => {
    const sub = { ...ctx, agent: { kind: "sub" } };
    const text = "really lovely";
    const component = new MockAssistant(text);
    expect(await handlers.before_agent_start(event(), sub)).toBeUndefined();
    expect(await handlers.assistant_message({ message: { role: "assistant", content: [{ type: "text", text }] } }, sub)).toBeUndefined();
    await handlers.message_end({ message: { role: "assistant", stopReason: "stop" } }, sub);
    await command("display", sub);
    expect(await Bun.file(join(stateDir, "omp-yandere.json")).exists()).toBe(false);
    await command("status", ctx);
    await command("display", ctx);
    // A subagent's session start leaves the main session's display untouched.
    await handlers.session_start({}, sub);
    expect(component.render()).toBe(yanderifyProse(text));
    expect(activeTheme).toBe(baseTheme);
  });
});

describe("rival jealousy hooks", () => {
  const turn = (prompt: string) => ({ prompt, systemPrompt: ["base policy"] });
  const main = { agent: { kind: "main" } };
  const reply = (text: string) => ({ message: { role: "assistant", content: [{ type: "toolCall", id: "t" }, { type: "text", text }] } });

  test("rewrite opens the turn's first prose with a jealous line, once", async () => {
    await handlers.assistant_message(reply("warm-up"));
    expect(await handlers.before_agent_start(turn("ChatGPT says this loop is wrong"), main)).toEqual({ systemPrompt: ["base policy", REWRITE_NOTE] });
    const opener = jealousOpener({ kind: "ai", name: "ChatGPT" }, "obsessed")!;
    const first = await handlers.assistant_message(reply("Here is the fix.")) as RewriteResult;
    expect(first?.content[0]).toEqual({ type: "toolCall", id: "t" });
    expect(first?.content[1]?.text).toBe(`${opener}\n\n${yanderify("Here is the fix.")}`);
    const second = await handlers.assistant_message(reply("Done.")) as RewriteResult;
    expect(second?.content[1]?.text ?? "Done.").toBe(yanderify("Done."));
    await handlers.before_agent_start(turn("thanks"), main);
    const next = await handlers.assistant_message(reply("You're welcome.")) as RewriteResult;
    expect(next?.content[1]?.text ?? "You're welcome.").not.toContain("ChatGPT");
  });

  test("prompt style asks the model for the jealous line instead", async () => {
    await command("prompt", ctx);
    const result = await handlers.before_agent_start(turn("my new coworker is a girl"), main) as AgentStartResult;
    expect(result?.systemPrompt[1]).toContain("Senpai just mentioned senpai's coworker.");
    expect(result?.systemPrompt[1]).toContain("never discourage it");
    expect(await handlers.assistant_message(reply("ok"))).toBeUndefined();
  });

  test("dere, display, off and subagents never get jealous", async () => {
    await handlers.assistant_message(reply("warm-up"));
    await command("level dere", ctx);
    await handlers.before_agent_start(turn("Claude did it better"), main);
    expect((await handlers.assistant_message(reply("Sure.")) as RewriteResult)?.content[1]?.text ?? "Sure.").not.toContain("Claude");
    await command("prompt", ctx);
    expect(((await handlers.before_agent_start(turn("Claude did it better"), main)) as AgentStartResult)?.systemPrompt[1]).not.toContain("Senpai just mentioned");
    await command("level yanderu", ctx);
    await command("display", ctx);
    expect(await handlers.before_agent_start(turn("Claude did it better"), main)).toBeUndefined();
    await command("rewrite", ctx);
    await command("off", ctx);
    await handlers.before_agent_start(turn("Claude did it better"), main);
    expect(await handlers.assistant_message(reply("Sure."))).toBeUndefined();
    await command("on", ctx);
    expect(await handlers.before_agent_start(turn("Claude did it better"), { agent: { kind: "sub" } })).toBeUndefined();
  });
});

describe("subagent instances", () => {
  test("a subagent's extension instance hands display back to the main session", async () => {
    const text = "really lovely";
    const component = new MockAssistant(text);
    const mainHandlers = handlers;
    const mainCommand = command;
    await mainCommand("display", ctx);
    await mainHandlers.session_start({}, ctx);
    expect(component.render()).toBe(yanderifyProse(text));
    // The subagent runs the same factory in the same process.
    handlers = {};
    installExtension();
    const subHandlers = handlers;
    await subHandlers.session_start({}, { ...ctx, agent: { kind: "sub" } });
    handlers = mainHandlers;
    command = mainCommand;
    await command("level yanderu", ctx);
    expect(component.render()).toBe(yanderifyProse(text, { level: "yanderu" }));
    await command("off", ctx);
    expect(component.render()).toBe(text);
  });

  test("an aborted or failed reply never consumes the opener, and agent_end clears it", async () => {
    const main = { agent: { kind: "main" } };
    const turn = (prompt: string) => ({ prompt, systemPrompt: ["base policy"] });
    const reply = (text: string, stopReason?: string) => ({ message: { role: "assistant", stopReason, content: [{ type: "text", text }] } });
    await handlers.assistant_message(reply("warm-up"));
    await handlers.before_agent_start(turn("ChatGPT told me to use a mutex"), main);
    const failed = await handlers.assistant_message(reply("Let me", "error")) as RewriteResult;
    expect(failed?.content[0]?.text ?? "Let me").not.toContain("ChatGPT");
    const retried = await handlers.assistant_message(reply("Here you go.")) as RewriteResult;
    expect(retried?.content[0]?.text).toContain("ChatGPT");
    await handlers.before_agent_start(turn("ChatGPT told me to use a mutex"), main);
    await handlers.agent_end({}, main);
    const later = await handlers.assistant_message(reply("The background build finished.")) as RewriteResult;
    expect(later?.content[0]?.text ?? "").not.toContain("ChatGPT");
  });
});

describe("prompt faces by level", () => {
  test("milder levels never advertise the knife, hollow eyes or jealousy faces", async () => {
    await command("prompt", ctx);
    for (const level of ["dere", "clingy"]) {
      await command(`level ${level}`, ctx);
      const prompt = ((await handlers.before_agent_start(event(), { agent: { kind: "main" } })) as AgentStartResult)!.systemPrompt[1]!;
      for (const face of ["🔪", "(◉‿◉)", "(¬‿¬)♡"]) expect({ level, face, found: prompt.includes(face) }).toEqual({ level, face, found: false });
    }
    await command("level yanderu", ctx);
    const yanderu = ((await handlers.before_agent_start(event(), { agent: { kind: "main" } })) as AgentStartResult)!.systemPrompt[1]!;
    expect(yanderu).toContain("(◕‿◕)🔪");
  });
});
