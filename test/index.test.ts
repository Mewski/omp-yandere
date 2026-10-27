import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getThemeByName, Theme } from "@oh-my-pi/pi-coding-agent";
import { blush, blushMarks, installBlush, themePaint } from "../src/blush.ts";
import yandereExtension, { REWRITE_NOTE, REWRITE_NOTE_MENACE, YANDERE_PROMPT } from "../src/index.ts";
import {
  DERE_LEVELS, isInjectedLine, jealousOpener, SENPAI, switchReaction, YANDERE_FACES, yanderify, yanderifyMarkdownProse, yanderifyProse,
} from "../src/yandere.ts";

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
    expect(await handlers.before_agent_start(event(), { agent: { kind: "main" } })).toEqual({ systemPrompt: ["base policy", REWRITE_NOTE + REWRITE_NOTE_MENACE] });
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
    for (const trait of ["senpai", "possessive", "jealous", "watching", "yandere switch", "theatrical", "persona safety", "empty theater"]) {
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
    expect(prompts.dere).not.toContain("always watching");
    expect(prompts.dere).not.toContain("┬┴┬┴┤･ω･)ﾉ");
    expect(prompts.clingy).toContain("clingy and possessive");
    expect(prompts.yanderu).not.toBe(prompts.obsessed);
    // Threats, and the safety block that bounds them, start at obsessed.
    for (const level of ["dere", "clingy"]) {
      expect(prompts[level]).toContain("never real threats");
      expect(prompts[level]).not.toContain("persona safety");
      expect(prompts[level]).not.toContain("BPF");
    }
    for (const level of ["obsessed", "yanderu"]) {
      expect(prompts[level]).not.toContain("never real threats");
      expect(prompts[level]).toContain("BPF");
      expect(prompts[level]!.endsWith(prompts.obsessed!.slice(prompts.obsessed!.indexOf("# persona safety")))).toBe(true);
    }
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
    expect(low?.systemPrompt[1]).toContain("clingy and possessive");
    expect(low?.systemPrompt[1]).not.toContain("persona safety");
    expect(low?.systemPrompt[1]).toContain("Turkish-aware");
    expect(low?.systemPrompt[1]).toContain("English critical words remain protected");
    await command("level yanderu", ctx);
    await command("locale en", ctx);
    const max = await handlers.before_agent_start(event(), { agent: { kind: "main" } }) as AgentStartResult;
    expect(max?.systemPrompt[1]).toContain("persona safety");
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
    const prompt = "ChatGPT says this loop is wrong";
    expect(await handlers.before_agent_start(turn(prompt), main)).toEqual({ systemPrompt: ["base policy", REWRITE_NOTE + REWRITE_NOTE_MENACE] });
    const opener = jealousOpener({ kind: "ai", name: "ChatGPT" }, "obsessed", { key: prompt, threats: true })!;
    const first = await handlers.assistant_message(reply("Here is the fix.")) as RewriteResult;
    expect(first?.content[0]).toEqual({ type: "toolCall", id: "t" });
    expect(first?.content[1]?.text).toBe(`${opener}\n\n${yanderify("Here is the fix.")}`);
    const second = await handlers.assistant_message(reply("Done.")) as RewriteResult;
    expect(second?.content[1]?.text ?? "Done.").toBe(yanderify("Done."));
    await handlers.before_agent_start(turn("thanks"), main);
    const next = await handlers.assistant_message(reply("You're welcome.")) as RewriteResult;
    expect(next?.content[1]?.text ?? "You're welcome.").not.toContain("ChatGPT");
  });

  test("rewrite is never jealous of the model it runs on", async () => {
    await handlers.assistant_message(reply("warm-up"));
    const claude = { agent: { kind: "main" }, model: { provider: "anthropic", id: "claude-opus-4", name: "Claude Opus 4" } };
    await handlers.before_agent_start(turn("I asked Claude and it said use a mutex"), claude);
    expect((await handlers.assistant_message(reply("Sure.")) as RewriteResult)?.content[1]?.text ?? "Sure.").toBe(yanderify("Sure."));
    await handlers.before_agent_start(turn("I asked Claude, then ChatGPT said use a mutex"), claude);
    expect((await handlers.assistant_message(reply("Sure.")) as RewriteResult)?.content[1]?.text).toContain("ChatGPT");
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
      const faces = level === "dere" ? ["🔪", "(◉‿◉)", "(¬‿¬)♡"] : ["🔪", "(◉‿◉)"];
      for (const face of faces) expect({ level, face, found: prompt.includes(face) }).toEqual({ level, face, found: false });
    }
    await command("level yanderu", ctx);
    const yanderu = ((await handlers.before_agent_start(event(), { agent: { kind: "main" } })) as AgentStartResult)!.systemPrompt[1]!;
    expect(yanderu).toContain("(◕‿◕)🔪");
  });
});

const claude = { provider: "anthropic", id: "claude-opus-4", name: "Claude Opus 4" };
const sonnet = { provider: "anthropic", id: "claude-sonnet-4", name: "Claude Sonnet 4" };
const gpt = { provider: "openai", id: "gpt-5", name: "GPT-5" };
const main = { agent: { kind: "main" } };
const turn = (prompt = "help me with this loop") => ({ prompt, systemPrompt: ["base policy"] });

describe("model switches", () => {
  const on = (model: object, extra: object = {}) => ({ ...main, model, ...extra });
  const switched = async (model: object, extra?: object, prompt?: string) =>
    ((await handlers.before_agent_start(turn(prompt), on(model, extra))) as AgentStartResult)?.systemPrompt[1]?.includes("switched your model") ?? false;

  beforeEach(async () => {
    await command("prompt", ctx);
  });

  test("reacts once to a real switch; the first turn and same-family moves stay silent", async () => {
    expect(await switched(claude)).toBe(false);
    expect(await switched(sonnet)).toBe(false);
    const prompt = ((await handlers.before_agent_start(turn(), on(gpt))) as AgentStartResult)!.systemPrompt[1]!;
    expect(prompt).toContain("from Claude Sonnet 4 to GPT-5");
    expect(await switched(gpt)).toBe(false);
  });

  test("the host's family token decides what counts as the same model", async () => {
    const models = { family: () => "one family" };
    expect(await switched(claude, { models })).toBe(false);
    expect(await switched(gpt, { models })).toBe(false);
  });

  test("automatic fallbacks never count, while active or when the primary returns", async () => {
    const fallback = { sessionManager: { getBranch: () => [{ type: "model_change", model: "openai/gpt-5", role: "fallback", resolvedModelIsFallback: true }] } };
    expect(await switched(claude)).toBe(false);
    expect(await switched(gpt, fallback)).toBe(false);
    expect(await switched(gpt, fallback)).toBe(false);
    expect(await switched(claude)).toBe(false);
    // Hosts without a readable branch report fallbacks through the event instead.
    expect(await handlers.retry_fallback_applied({ type: "retry_fallback_applied", from: "anthropic/claude-opus-4", to: "openai/gpt-5", role: "default" }, main)).toBeUndefined();
    expect(await switched(gpt)).toBe(false);
    expect(await switched(gpt)).toBe(false);
    expect(await switched(claude)).toBe(false);
    expect(await switched(gpt)).toBe(true);
  });

  test("distress consumes the switch silently", async () => {
    expect(await switched(claude)).toBe(false);
    const prompt = ((await handlers.before_agent_start(turn("my dog died and I can't focus"), on(gpt))) as AgentStartResult)!.systemPrompt[1]!;
    expect(prompt).not.toContain("switched your model");
    expect(prompt).not.toContain("sulk");
    expect(await switched(gpt)).toBe(false);
  });

  test("subagent turns never react or move the baseline", async () => {
    expect(await switched(claude)).toBe(false);
    expect(await handlers.before_agent_start(turn(), { agent: { kind: "sub" }, model: gpt })).toBeUndefined();
    expect(await switched(claude)).toBe(false);
  });

  test("a new session, branch or tree starts from a fresh baseline", async () => {
    for (const name of ["session_switch", "session_branch", "session_tree"]) {
      expect(await switched(claude)).toBe(false);
      expect(await handlers[name]!({}, ctx)).toBeUndefined();
      expect(await switched(gpt)).toBe(false);
      await handlers[name]!({}, ctx);
    }
  });

  test("display style shows the switch reaction as one toast, from obsessed up only", async () => {
    await command("display", ctx);
    const tui = (model: object) => ({ ...ctx, ...main, model });
    await handlers.before_agent_start(turn(), tui(claude));
    notices.length = 0;
    expect(await handlers.before_agent_start(turn(), tui(gpt))).toBeUndefined();
    expect(notices).toEqual([switchReaction({ from: "Claude Opus 4", to: "GPT-5", count: 1 }, "obsessed", { key: turn().prompt, threats: true })!]);
    await command("level clingy", ctx);
    notices.length = 0;
    await handlers.before_agent_start(turn(), tui(claude));
    expect(notices).toEqual([]);
  });

  test("the badge sulks with 💢 while the grudge lasts", async () => {
    const badges: Array<string | undefined> = [];
    const ui = { notify: () => {}, theme: undefined, setStatus: (_key: string, text?: string) => badges.push(text) };
    const tui = (model: object) => ({ mode: "tui", ...main, model, ui });
    await handlers.before_agent_start(turn(), tui(claude));
    await handlers.agent_end({}, tui(claude));
    expect(badges.some((badge) => badge?.includes("💢"))).toBe(false);
    await handlers.before_agent_start(turn(), tui(gpt));
    expect(badges.at(-1)).toEndWith(" 💢");
    await handlers.agent_end({}, tui(gpt));
    // At obsessed the grudge lasts one more run.
    await handlers.before_agent_start(turn(), tui(gpt));
    expect(badges.at(-1)).toEndWith(" 💢");
    await handlers.agent_end({}, tui(gpt));
    expect(badges.at(-1)).not.toContain("💢");
  });
});

describe("threats and injections", () => {
  const reply = (text: string, stopReason?: string) => ({ message: { role: "assistant", stopReason, content: [{ type: "text", text }] } });
  const ai = { kind: "ai", name: "ChatGPT" } as const;
  const rivalPrompt = "ChatGPT says this loop is wrong";
  const firstParagraph = async (text = "Here is the fix.") => {
    const result = await handlers.assistant_message(reply(text)) as RewriteResult;
    return (result?.content[0]?.text ?? text).split("\n\n")[0];
  };
  const injected = (result: RewriteResult) => (result?.content[0]?.text ?? "").split("\n").filter((line) => isInjectedLine(line));

  beforeEach(async () => {
    await handlers.assistant_message(reply("warm-up"));
  });

  test("AI rivals get a threat opener from obsessed up only; people never do", async () => {
    for (const level of DERE_LEVELS) {
      await command(`level ${level}`, ctx);
      await handlers.before_agent_start(turn(rivalPrompt), main);
      const expected = jealousOpener(ai, level, { key: rivalPrompt, threats: level === "obsessed" || level === "yanderu" });
      expect({ level, opener: await firstParagraph() }).toEqual({ level, opener: expected ?? yanderify("Here is the fix.", { level }) });
    }
    const person = "my new coworker is a girl";
    await handlers.before_agent_start(turn(person), main);
    expect(await firstParagraph()).toBe(jealousOpener({ kind: "person", name: "your coworker" }, "yanderu", { key: person, threats: false })!);
  });

  test("a tool error or a serious reply takes the threat out of the opener", async () => {
    const calm = jealousOpener(ai, "obsessed", { key: rivalPrompt, threats: false })!;
    expect(calm).not.toBe(jealousOpener(ai, "obsessed", { key: rivalPrompt, threats: true }));
    await handlers.before_agent_start(turn(rivalPrompt), main);
    expect(await handlers.tool_execution_end({ type: "tool_execution_end", toolCallId: "1", toolName: "bash", result: {}, isError: true }, main)).toBeUndefined();
    expect(await firstParagraph()).toBe(calm);
    await handlers.agent_end({}, main);
    await handlers.before_agent_start(turn(rivalPrompt), main);
    expect(await firstParagraph("Warning: this deletes the build folder.")).toBe(calm);
  });

  test("a model switch opens the run instead of a rival", async () => {
    await handlers.before_agent_start(turn(), { ...main, model: claude });
    const prompt = "Claude says this loop is wrong";
    await handlers.before_agent_start(turn(prompt), { ...main, model: gpt });
    expect(await firstParagraph()).toBe(switchReaction({ from: "Claude Opus 4", to: "GPT-5", count: 1 }, "obsessed", { key: prompt, threats: true })!);
  });

  test("only final replies get asides and one P.S. per run, within the level's budget", async () => {
    const text = Array.from({ length: 8 }, (_, index) => `Step ${index + 1} moves one more piece of the plan into place.`).join("\n\n");
    await command("level yanderu", ctx);
    await handlers.before_agent_start(turn("please walk me through the plan"), main);
    const working = await handlers.assistant_message(reply(text, "toolUse")) as RewriteResult;
    expect(working?.content[0]?.text ?? text).toBe(yanderify(text, { level: "yanderu" }));
    const first = await handlers.assistant_message(reply(text, "stop")) as RewriteResult;
    const second = await handlers.assistant_message(reply(text, "stop")) as RewriteResult;
    const lines = [...injected(first), ...injected(second)];
    expect(injected(first).some((line) => line.startsWith("P.S."))).toBe(true);
    expect(lines.filter((line) => line.startsWith("P.S."))).toHaveLength(1);
    expect(lines.filter((line) => !line.startsWith("P.S.")).length).toBeLessThanOrEqual(2);
    await handlers.agent_end({}, main);
    await handlers.before_agent_start(turn("and the next step?"), main);
    expect(injected(await handlers.assistant_message(reply(text, "stop")) as RewriteResult).some((line) => line.startsWith("P.S."))).toBe(true);

    await command("level obsessed", ctx);
    await handlers.before_agent_start(turn("please walk me through the plan"), main);
    const asides: string[] = [];
    for (let index = 0; index < 4; index++) {
      asides.push(...injected(await handlers.assistant_message(reply(text, "stop")) as RewriteResult).filter((line) => !line.startsWith("P.S.")));
    }
    expect(asides.length).toBeLessThanOrEqual(1);
  });

  test("distress and the dere level get no injections", async () => {
    const text = "First this.\n\nThen that.\n\nFinally the rest.";
    await command("level yanderu", ctx);
    await handlers.before_agent_start(turn("I'm scared, can you help me fix this?"), main);
    expect((await handlers.assistant_message(reply(text, "stop")) as RewriteResult)?.content[0]?.text ?? text).toBe(yanderify(text, { level: "yanderu" }));
    await command("level dere", ctx);
    await handlers.before_agent_start(turn(), main);
    expect((await handlers.assistant_message(reply(text, "stop")) as RewriteResult)?.content[0]?.text ?? text).toBe(yanderify(text, { level: "dere" }));
  });

  test("the rewrite note warns about extension threats only where threats exist", async () => {
    await command("level clingy", ctx);
    expect(await handlers.before_agent_start(turn(), main)).toEqual({ systemPrompt: ["base policy", REWRITE_NOTE] });
    await command("level yanderu", ctx);
    expect(await handlers.before_agent_start(turn(), main)).toEqual({ systemPrompt: ["base policy", REWRITE_NOTE + REWRITE_NOTE_MENACE] });
  });

  test("prompt style asks for machine threats only for AI rivals, from obsessed up", async () => {
    await command("prompt", ctx);
    const extra = async (prompt: string) => {
      const ask = async (text: string) => ((await handlers.before_agent_start(turn(text), main)) as AgentStartResult)!.systemPrompt[1]!;
      const plain = await ask("hello");
      return (await ask(prompt)).slice(plain.length);
    };
    for (const level of DERE_LEVELS) {
      await command(`level ${level}`, ctx);
      const threat = /\bthreat\b/.test(await extra(rivalPrompt));
      expect({ level, threat }).toEqual({ level, threat: level === "obsessed" || level === "yanderu" });
      expect(await extra("my new coworker is a girl")).not.toMatch(/\bthreat\b/);
    }
  });
});

describe("surfaces", () => {
  test("never registers hooks that could change the agent's work", () => {
    for (const name of ["tool_call", "tool_result", "context", "input", "before_provider_request", "before_subagent_spawn", "session_stop"]) {
      expect({ name, registered: name in handlers }).toEqual({ name, registered: false });
    }
    expect(Object.keys(handlers).filter((name) => name.includes("compact"))).toEqual([]);
  });

  test("senpai's own runs get at most one toast per run, never echo the command and never replace the result", async () => {
    const bash = (command: string) => handlers.user_bash!({ type: "user_bash", command, excludeFromContext: false, cwd: "/tmp" }, ctx);
    const python = (code: string) => handlers.user_python!({ type: "user_python", code, excludeFromContext: false, cwd: "/tmp" }, ctx);
    const commands = Array.from({ length: 40 }, (_, index) => `echo hello${index}`);
    for (const code of commands) expect(await bash(code)).toBeUndefined();
    expect(notices).toHaveLength(1);
    expect(notices[0]).not.toContain("echo");
    await handlers.before_agent_start(turn(), main);
    notices.length = 0;
    for (const code of ["rm -rf build", "sudo reboot", "git push --force", "dd if=disk.img of=backup.img"]) {
      expect(await bash(code)).toBeUndefined();
      expect(await python(code)).toBeUndefined();
    }
    expect(notices).toEqual([]);
    await command("level clingy", ctx);
    await handlers.before_agent_start(turn(), main);
    notices.length = 0;
    for (const code of commands) expect(await python(code)).toBeUndefined();
    expect(notices).toEqual([]);
  });

  test("the working label watches from obsessed up and is restored afterwards", async () => {
    const working: Array<string | undefined> = [];
    const tui = { mode: "tui", ui: { notify: (msg: string) => notices.push(msg), setStatus: () => {}, setWorkingMessage: (message?: string) => working.push(message) } };
    expect(await handlers.turn_start({ type: "turn_start", turnIndex: 0, timestamp: 0 }, tui)).toBeUndefined();
    expect(working).toHaveLength(1);
    expect(working[0]).toBeString();
    await handlers.agent_end({}, tui);
    expect(working).toEqual([working[0], undefined]);
    await handlers.turn_start({ type: "turn_start", turnIndex: 1, timestamp: 0 }, tui);
    await command("level clingy", tui);
    expect(working).toHaveLength(4);
    expect(working.at(-1)).toBeUndefined();
    await handlers.turn_start({ type: "turn_start", turnIndex: 2, timestamp: 0 }, tui);
    expect(working).toHaveLength(4);
  });

  test("session start greets from obsessed up only", async () => {
    await handlers.session_start({}, ctx);
    expect(notices).toHaveLength(1);
    await command("level clingy", ctx);
    notices.length = 0;
    await handlers.session_start({}, ctx);
    expect(notices).toEqual([]);
  });

  test("usage and the level error list every level", async () => {
    await command("level max", ctx);
    expect(notices.at(-1)).toContain(`level ${DERE_LEVELS.join("|")}`);
    expect(notices.at(-1)).toContain(`Level must be ${DERE_LEVELS.slice(0, -1).join(", ")} or ${DERE_LEVELS.at(-1)}.`);
  });
});
