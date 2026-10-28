import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Container, getMarkdownTheme, Markdown, visibleWidth } from "@oh-my-pi/pi-tui";
import { AssistantMessageComponent } from "@oh-my-pi/pi-tui/chat/assistant-message";
import type { NativeNode } from "@oh-my-pi/pi-tui/native/node";
import { getThemeByName, Theme } from "@oh-my-pi/pi-coding-agent";
import { buildYamiKawaiiTheme, STALKER_POSE_MS, STALKER_POSES_BY_LEVEL, stalkerPoseAt, stalkerPoseMs, YamiKawaiiTheme } from "../src/theme.ts";
import { blush, blushMarks, installBlush, type BlushInstallation, type Paint } from "../src/blush.ts";
import { DERE_LEVELS, type DereLevel, yanderify, yanderifyMarkdownProse, yanderifyProse } from "../src/yandere.ts";

const YANDERU = { level: "yanderu" } as const;

const bracket: Paint = (tone, text) => `[${tone}:${text}]`;
const painted = (text: string) => [...blush(text, bracket).matchAll(/\[\w+:([^\]]*)\]/g)].map((m) => m[1]);

const MARK = "\x1b[38;2;1;2;3m";
const ansiPaint: Paint = (_tone, text) => `${MARK}${text}\x1b[39m`;

const message = (text: string) =>
  ({
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "test",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: 0,
  }) as never;

function nativeMd(root: NativeNode, key = "t0") {
  const child = root.c?.find((child) => "k" in child && child.key === key);
  if (!child || !("k" in child) || child.k !== "md") throw new Error(`Missing native Markdown ${key}`);
  return child;
}

describe("blush", () => {
  test("paints phrases, faces and symbols as one tone each", () => {
    const source = "Senpai~ ehehe~ ♡ (◕ᴗ◕✿) ☆ I'm always watching~ ♡";
    const out = blush(source, bracket);
    expect(painted(source)).toEqual(["Senpai~", "ehehe~ ♡", "(◕ᴗ◕✿)", "☆", "I'm always watching~ ♡"]);
    expect(out.replace(/\[\w+:([^\]]*)\]/g, "$1")).toBe(source);
  });

  test("paints unlisted kaomoji and known ASCII emoticons at word edges", () => {
    expect(painted("done ʕ•ᴥ•ʔ nope, but (｡◕‿◕｡) yes ^^ <3 :)")).toEqual(["(｡◕‿◕｡)", "^^", "<3", ":)"]);
    expect(painted("fixed it (ﾉ◕ヮ◕)ﾉ")).toEqual(["(ﾉ◕ヮ◕)ﾉ"]);
    expect(painted("yay ヽ(・∀・)ﾉ done")).toEqual(["ヽ(・∀・)ﾉ"]);
  });

  test("leaves prose, math, numbers and look-alikes plain", () => {
    for (const text of [
      "a:) ratio", "ehehe~xyz", "(şimdi)", "(≥ 3)", "(see “docs”)", "x^^y", "こんにちは (テスト)",
      "(x−y)", "(a—b)", "ş(a…)ı", "ş(◕‿◕)ı", "❤️ ♥️ ♡️", "♡\u0301\uFE0F", "☆\u0301\uFE0F",
    ]) {
      expect(painted(text)).toEqual([]);
    }
  });

  test("keeps combining marks with the symbol they decorate", () => {
    expect(painted("wish ☆\u0301 granted")).toEqual(["☆\u0301"]);
  });

  test("hollow-eyed and knife faces stay crimson while hearts keep rotating", () => {
    const source = "(◉‿◉) ♡ (⊙ˍ⊙) ♡ (•‿•)🔪 ♡ 【◉ˍ◉】 ♡";
    const tones = [...blush(source, bracket).matchAll(/\[(\w+):([^\]]*)\]/g)].map((m) => [m[2], m[1]]);
    expect(tones.filter(([text]) => text !== "♡")).toEqual([
      ["(◉‿◉)", "mdListBullet"], ["(⊙ˍ⊙)", "mdListBullet"], ["(•‿•)", "mdListBullet"], ["【◉ˍ◉】", "mdListBullet"],
    ]);
    expect(new Set(tones.filter(([text]) => text === "♡").map(([, tone]) => tone)).size).toBeGreaterThan(1);
    const marks = blushMarks("(•‿•) hi (•‿•)🔪 and (◉‿◉)");
    expect(marks.find(({ t }) => t === "(•‿•)")?.s).toBe("mdListBullet");
    expect(marks.find(({ t }) => t === "(◉‿◉)")?.s).toBe("mdListBullet");
    expect(blushMarks("(•‿•) hi").map(({ s }) => s)).not.toEqual(["mdListBullet"]);
    expect(painted("【注意】 and 【docs】")).toEqual([]);
  });

  test("roleplay actions take one soft tone of their own, apart from the faces and hearts around them", () => {
    const source = "＊twirls the knife＊ hi ♡ (◉‿◉) ＊kisses your cheek softly＊ ♡ *real italics*";
    const tones = [...blush(source, bracket).matchAll(/\[(\w+):([^\]]*)\]/g)].map((m) => [m[2], m[1]]);
    expect(tones.filter(([text]) => text!.startsWith("＊"))).toEqual([["＊twirls the knife＊", "mdQuote"], ["＊kisses your cheek softly＊", "mdQuote"]]);
    expect(tones.find(([text]) => text === "(◉‿◉)")).toEqual(["(◉‿◉)", "mdListBullet"]);
    expect(painted(source)).not.toContain("*real italics*");
    expect(blushMarks(source).filter(({ t }) => t.startsWith("＊")).map(({ s }) => s)).toEqual(["mdQuote", "mdQuote"]);
  });

  test("the yandere theme restores an enclosing color after a nested span", async () => {
    const base = (await getThemeByName("dark")) as Theme;
    const yandere = buildYamiKawaiiTheme(Theme, base);
    const heading = yandere.fg("mdHeading", `hi ${yandere.fg("accent", "♡")} there`);
    const open = yandere.getFgAnsi("mdHeading");
    expect(heading).toBe(`${open}hi ${yandere.getFgAnsi("accent")}♡${open} there\x1b[39m`);
  });

  test("the working stalker keeps text aligned and leaves compact tool spinners unchanged at every level", async () => {
    const original = (await getThemeByName("dark")) as Theme;
    expect(Object.keys(STALKER_POSES_BY_LEVEL)).toEqual([...DERE_LEVELS]);
    for (const level of DERE_LEVELS) {
      const expectedActivity = buildYamiKawaiiTheme(Theme, original, level).getSpinnerFrames("activity");
      for (const preset of ["unicode", "nerd", "ascii"] as const) {
        const base = new Theme({} as ConstructorParameters<typeof Theme>[0], {} as ConstructorParameters<typeof Theme>[1], original.getColorMode(), preset, {});
        const originalActivity = [...base.getSpinnerFrames("activity")];
        const stalker = buildYamiKawaiiTheme(Theme, base, level);
        const frames = stalker.getSpinnerFrames("activity");
        expect({ level, widths: [...new Set(frames.map(visibleWidth))] }).toEqual({ level, widths: [11] });
        expect(new Set(frames).size).toBeGreaterThan(1);
        expect(new Set(frames.map((frame) => frame.trimEnd().length)).size).toBeGreaterThan(1);
        expect(frames.every((frame) => !/[\r\n\x1b]/.test(frame))).toBe(true);
        expect(frames).not.toEqual(base.getSpinnerFrames("activity"));
        expect(stalker.getSpinnerFrames("status")).toEqual(base.getSpinnerFrames("status"));
        expect(base.getSpinnerFrames("activity")).toEqual(originalActivity);
        expect(frames).toEqual(expectedActivity);
        const poses = STALKER_POSES_BY_LEVEL[level];
        expect(stalkerPoseAt(stalker, 0)).toBe(poses[0]);
        expect(stalkerPoseAt(stalker, stalkerPoseMs(level))).toBe(poses[1]);
      }
    }
    expect(stalkerPoseAt(original, 0)).toBeUndefined();
  });

  test("the stalker creeps faster as the level rises, and obsessed is the default", () => {
    const periods = DERE_LEVELS.map(stalkerPoseMs);
    expect(periods).toEqual([...periods].sort((a, b) => b - a));
    expect(stalkerPoseMs("obsessed")).toBeLessThan(stalkerPoseMs("clingy"));
    expect(stalkerPoseMs("yanderu")).toBeLessThan(stalkerPoseMs("obsessed"));
    expect(STALKER_POSE_MS).toBe(stalkerPoseMs("obsessed"));
  });

  test("a level change rebuilds the overlay from the user's theme", async () => {
    const original = (await getThemeByName("dark")) as Theme;
    const base = new Theme({} as ConstructorParameters<typeof Theme>[0], {} as ConstructorParameters<typeof Theme>[1], original.getColorMode(), "unicode", {}, { activity: ["a", "b"] });
    let current = base;
    let installs = 0;
    const overlay = new YamiKawaiiTheme({ Theme, setThemeInstance: (theme) => { current = theme; installs++; } });
    overlay.enable(current, "dere");
    const dere = current;
    overlay.enable(current, "dere");
    expect(installs).toBe(1);
    overlay.enable(current, "yanderu");
    expect(installs).toBe(2);
    expect(current).not.toBe(dere);
    expect(stalkerPoseAt(current, 0)).toBe(STALKER_POSES_BY_LEVEL.yanderu[0]);
    overlay.disable(current);
    expect(current).toBe(base);
    expect(current.getSpinnerFrames("activity")).toEqual(["a", "b"]);
  });

  test("turning the yandere theme off restores the user's theme and custom activity spinner", async () => {
    const original = (await getThemeByName("dark")) as Theme;
    const base = new Theme({} as ConstructorParameters<typeof Theme>[0], {} as ConstructorParameters<typeof Theme>[1], original.getColorMode(), "unicode", {}, { activity: ["a", "b"] });
    let current = base;
    const overlay = new YamiKawaiiTheme({ Theme, setThemeInstance: (theme) => { current = theme; } });
    overlay.enable(current);
    expect(current.getSpinnerFrames("activity")).not.toEqual(["a", "b"]);
    overlay.disable(current);
    expect(current).toBe(base);
    expect(current.getSpinnerFrames("activity")).toEqual(["a", "b"]);
  });

  test("is deterministic and never changes visible text", () => {
    const text = yanderify("This is really nice. That was a lovely fix. The tests all pass now!", YANDERU);
    expect(blush(text, bracket)).toBe(blush(text, bracket));
    expect(blush(text, ansiPaint).replaceAll(MARK, "").replaceAll("\x1b[39m", "")).toBe(text);
  });

  test("native marks are distinct, stable semantic colors and skip short ASCII tokens", () => {
    const marks = blushMarks("ehehe~ ehehe~ Senpai~ (◕ᴗ◕✿) ☆ :) <3 x3 ^^ ^_^");
    expect(marks.map(({ t }) => t)).toEqual(["ehehe~", "Senpai~", "(◕ᴗ◕✿)", "☆", "^_^"]);
    expect(marks.find(({ t }) => t === "ehehe~")).toEqual(blushMarks("☆ ehehe~")[1]);
    expect(marks.every(({ s }) => ["accent", "mdLink", "mdCode", "mdListBullet", "mdHeading", "thinkingText"].includes(s))).toBe(true);
    expect(JSON.stringify(marks)).not.toContain("\x1b");
    expect(blushMarks("ehehe~xyz a:) x^^y")).toEqual([]);
  });
});

describe("installBlush on omp's AssistantMessageComponent", () => {
  let active: boolean;
  let installation: BlushInstallation;
  let originalAddChild: typeof Container.prototype.addChild;
  let originalDescribe: typeof AssistantMessageComponent.prototype.describe;
  beforeEach(() => {
    active = true;
    originalAddChild = Container.prototype.addChild;
    originalDescribe = AssistantMessageComponent.prototype.describe;
    installation = installBlush(Container, {
      isActive: () => active,
      transform: (text) => blush(text, ansiPaint),
      native: (text) => ({ text, marks: blushMarks(text) }),
    });
  });
  afterEach(() => installation.dispose());

  test("finds the component through its Container base, then stops watching", () => {
    expect(Container.prototype.addChild).not.toBe(originalAddChild);
    active = true;
    const component = new AssistantMessageComponent(message("Senpai~ ehehe~"));
    expect(Container.prototype.addChild).toBe(originalAddChild);
    expect(component.render(80).join("\n")).toContain(MARK);
  });
  const render = (component: AssistantMessageComponent) => component.render(80).join("\n");
  const body = "Senpai~ ehehe~ (◕ᴗ◕✿) and `ehehe~` stays code\n\n```\nehehe~ (◕ᴗ◕✿)\n```";

  test("paints prose only, never inline code or code blocks", () => {
    active = true;
    const component = new AssistantMessageComponent();
    component.updateContent(message(body));
    const rows = render(component);
    expect(rows.split(MARK).length - 1).toBe(3);
  });

  test("toggling off repaints plain on the next update", () => {
    active = true;
    const component = new AssistantMessageComponent();
    component.updateContent(message(body));
    expect(render(component)).toContain(MARK);
    active = false;
    component.invalidate();
    expect(render(component)).not.toContain(MARK);
  });

  test("a host-set transform wins over blush", () => {
    active = true;
    const component = new AssistantMessageComponent();
    component.setTextColorTransform((text) => text.toUpperCase());
    component.updateContent(message("Senpai~ ehehe~"));
    const rows = render(component);
    expect(rows).toContain("SENPAI~ EHEHE~");
    expect(rows).not.toContain(MARK);
  });

  test("refresh invalidates already-rendered components without a theme change", () => {
    const component = new AssistantMessageComponent(message(body));
    expect(render(component)).toContain(MARK);
    active = false;
    installation.refresh();
    expect(render(component)).not.toContain(MARK);
    active = true;
    installation.refresh();
    expect(render(component)).toContain(MARK);
  });

  test("reload replaces controls without double-patching and invalidates cached rows", () => {
    const component = new AssistantMessageComponent(message("really sweet"));
    const patched = AssistantMessageComponent.prototype.updateContent;
    installation = installBlush(Container, {
      isActive: () => true,
      transform: (text) => yanderifyProse(text, YANDERU),
      native: (text) => ({ text: yanderifyMarkdownProse(text, YANDERU), marks: [] }),
    });
    expect(AssistantMessageComponent.prototype.updateContent).toBe(patched);
    expect(Bun.stripANSI(render(component))).toMatch(/rea{3,}lly swe{3,}t/);
  });

  test("display prose composes with blush but never changes inline/fenced code or raw messages", () => {
    const runs: string[] = [];
    installation = installBlush(Container, {
      isActive: () => true,
      transform: (text) => { runs.push(text); return blush(yanderifyProse(text, YANDERU), ansiPaint); },
      native: (text) => { const prose = yanderifyMarkdownProse(text, YANDERU); return { text: prose, marks: blushMarks(prose) }; },
    });
    const text = 'really sweet Senpai~ (◕ᴗ◕✿) ☆ and `really` stays code\n\n```\nconst really = "sweet";\nSenpai~\n```';
    const raw = message(text);
    const original = JSON.stringify(raw);
    const component = new AssistantMessageComponent(raw);
    const rows = component.render(80);
    const plain = Bun.stripANSI(rows.join("\n"));
    expect(plain).toMatch(/rea{3,}lly swe{3,}t/);
    expect(plain).toContain("really");
    expect(plain).toContain('const really = "sweet";');
    expect(rows.join("\n").split(MARK).length - 1).toBe(3);
    expect(runs).not.toContain("really");
    expect(runs.some((run) => run.includes('const really = "sweet";'))).toBe(false);
    expect(JSON.stringify(raw)).toBe(original);
  });

  test("real Markdown wraps transformed, length-expanded prose rather than raw text", () => {
    const raw = "northern nature normal nearby really sweet flowers";
    const options = YANDERU;
    const transformed = yanderifyProse(raw, options);
    expect(transformed.length).toBeGreaterThan(raw.length);
    for (const width of [12, 18, 24]) {
      const md = new Markdown(raw, 0, 0, getMarkdownTheme(), { color: (run) => yanderifyProse(run, options) });
      const expected = new Markdown(transformed, 0, 0, getMarkdownTheme());
      expect(md.render(width).map(Bun.stripANSI)).toEqual(expected.render(width).map(Bun.stripANSI));
      expect(md.render(width).every((row) => visibleWidth(row) <= width)).toBe(true);
    }
  });

  test("colors-off display intensity refreshes a narrow-width Assistant render", () => {
    let level: DereLevel = "obsessed";
    installation = installBlush(Container, {
      isActive: () => true,
      transform: (run) => yanderifyProse(run, { level }),
      native: (text) => ({ text: yanderifyMarkdownProse(text, { level }), marks: [] }),
    });
    const text = "really sweet northern nature normal nearby flowers";
    const raw = message(text);
    const original = JSON.stringify(raw);
    const component = new AssistantMessageComponent(raw);
    const mid = component.render(18).map(Bun.stripANSI);
    level = "clingy";
    installation.refresh();
    const low = component.render(18).map(Bun.stripANSI);
    expect(low).not.toEqual(mid);
    expect(low.every((row) => visibleWidth(row) <= 18)).toBe(true);
    level = "yanderu";
    installation.refresh();
    expect(component.render(18).map(Bun.stripANSI)).not.toEqual(low);
    expect(JSON.stringify(raw)).toBe(original);
    component.setTextColorTransform((run) => run.toUpperCase());
    installation.refresh();
    expect(Bun.stripANSI(component.render(80).join("\n"))).toContain(text.toUpperCase());
    component.setTextColorTransform(undefined);
    installation.refresh();
    expect(Bun.stripANSI(component.render(80).join("\n"))).toContain(yanderifyProse(text, { level }));
  });

  test("native display decorates copies with semantic marks, preserving code, URLs and raw messages", () => {
    installation = installBlush(Container, {
      isActive: () => active,
      transform: (text) => blush(yanderifyProse(text, YANDERU), ansiPaint),
      native: (text) => { const prose = yanderifyMarkdownProse(text, YANDERU); return { text: prose, marks: blushMarks(prose) }; },
    });
    const text = "really sweet Senpai~ (◕ᴗ◕✿) ehehe~ ☆ and `ehehe~` stays code ^^\n\n```\nehehe~ (◕ᴗ◕✿)\n```\nhttps://example.com/really";
    const raw = message(text);
    const original = JSON.stringify(raw);
    const component = new AssistantMessageComponent(raw);
    const source = originalDescribe.call(component);
    const sourceJson = JSON.stringify(source);
    const description = component.describe();
    const md = nativeMd(description);
    expect(installation.isNativeSupported()).toBe(true);
    expect(md.p?.text).toBe(yanderifyMarkdownProse(text, YANDERU));
    expect(md.p?.text).toMatch(/rea{3,}lly swe{3,}t/);
    expect(md.p?.text).toContain("`ehehe~`");
    expect(md.p?.text).toContain("```\nehehe~ (◕ᴗ◕✿)\n```");
    expect(md.p?.text).toContain("https://example.com/really");
    expect(md.p?.marks).toEqual(blushMarks(yanderifyMarkdownProse(text, YANDERU)));
    expect(md.p?.marks?.some(({ t }) => t === "^^")).toBe(false);
    expect(JSON.stringify(description)).not.toContain("\\u001b");
    expect(description).not.toBe(source);
    expect(JSON.stringify(source)).toBe(sourceJson);
    expect(JSON.stringify(raw)).toBe(original);
    expect(component.describe()).toBe(description);
  });

  for (const colors of [false, true]) {
    test(`native display preserves container fences and multiline code with colors ${colors ? "on" : "off"}`, () => {
      installation = installBlush(Container, {
        isActive: () => active,
        transform: (text) => yanderifyProse(text, YANDERU),
        native: (text) => { const prose = yanderifyMarkdownProse(text, YANDERU); return { text: prose, marks: colors ? blushMarks(prose) : [] }; },
      });
      const codeBlocks = [
        "- -\t> ~~~\n    > really world\n    > ~~~",
        "> ```\n> hello really world\n> ```",
        "> ~~~\n> really sweet\n> ~~~",
        "- ```\n  hello really world\n  ```",
        "> - ```\n>   hello really world\n>   ```",
        "- > ~~~\n  > really sweet\n  > ~~~",
        "- really\n\n  ~~~\n  hello really world\n  ~~~",
        "-\n  ~~~\n  hello really world\n  ~~~",
        "    hello really world\n    really sweet",
        ">     hello really world\n>     really sweet",
        "- item\n\n      hello really world\n      really sweet",
        "````\nhello really world\n```\nreally sweet\n````",
      ];
      const spans = [
        "`code\nreally world\ncode`",
        "``code ` literal\nreally world\ncode``",
        "```code``\nreally world\ncode```",
      ];
      for (const protectedSource of [...codeBlocks, ...spans]) {
        const isSpan = spans.includes(protectedSource);
        const text = isSpan ? `Hello ${protectedSource} really sweet ehehe~ world.` : `Hello really sweet ehehe~ world.\n\n${protectedSource}\n\nreally sweet world.`;
        const raw = message(text);
        const original = JSON.stringify(raw);
        const component = new AssistantMessageComponent(raw);
        const description = component.describe();
        const md = nativeMd(description);
        const paragraphBreak = protectedSource.indexOf("\n\n");
        const protectedCode = paragraphBreak === -1 ? protectedSource : protectedSource.slice(paragraphBreak + 2);
        expect(md.p?.text).toContain(protectedCode);
        if (protectedSource.startsWith("- really\n")) expect(md.p?.text).toMatch(/- rea{3,}lly\n/);
        expect(md.p?.text).toMatch(/rea{3,}lly swe{3,}t/);
        expect(md.p?.text).not.toBe(text);
        if (colors) {
          expect(md.p?.marks).toEqual(blushMarks(md.p?.text ?? ""));
          expect(md.p?.marks?.some(({ t }) => t === "ehehe~")).toBe(true);
        }
        else expect(Object.hasOwn(md.p!, "marks")).toBe(false);
        expect(JSON.stringify(description)).not.toContain("\\u001b");
        expect(JSON.stringify(raw)).toBe(original);
        expect(component.describe()).toBe(description);
      }
    });

    test(`native streaming protects unfinished code until closure with colors ${colors ? "on" : "off"}`, () => {
      installation = installBlush(Container, {
        isActive: () => active,
        transform: (text) => yanderifyProse(text, YANDERU),
        native: (text) => { const prose = yanderifyMarkdownProse(text, YANDERU); return { text: prose, marks: colors ? blushMarks(prose) : [] }; },
      });
      for (const [unfinished, closure] of [
        ["> ```\n> really world", "\n> ```"],
        ["> ~~~\n> really world", "\n> ~~~"],
        ["- ```\n  really world", "\n  ```"],
        ["`code\nreally world", "\ncode`"],
        ["``code ` literal\nreally world", "\ncode``"],
      ]) {
        const initial = `Hello really sweet ehehe~ world.\n\n${unfinished}`;
        const component = new AssistantMessageComponent(message(initial));
        const first = component.describe();
        expect(nativeMd(first).p?.text).toContain(unfinished!);
        expect(nativeMd(first).p?.text).toMatch(/rea{3,}lly swe{3,}t/);
        const completed = `${initial}${closure}\n\nreally sweet world.`;
        const raw = message(completed);
        component.updateContent(raw, { transient: true });
        const next = component.describe();
        expect(nativeMd(next).p?.text).toContain(`${unfinished}${closure}`);
        expect(nativeMd(next).p?.text).toMatch(/rea{3,}lly swe{3,}t world\.$/);
        expect(next).not.toBe(first);
        expect(JSON.stringify(raw)).toBe(JSON.stringify(message(completed)));
        if (colors) {
          expect(nativeMd(next).p?.marks).toEqual(blushMarks(nativeMd(next).p?.text ?? ""));
          expect(nativeMd(next).p?.marks?.some(({ t }) => t === "ehehe~")).toBe(true);
        }
        else expect(Object.hasOwn(nativeMd(next).p!, "marks")).toBe(false);
      }
    });
  }

  test("native source ranges retain lexical protection and rewrite prose after container exit", () => {
    installation = installBlush(Container, {
      isActive: () => active,
      transform: (text) => yanderifyProse(text, YANDERU),
      native: (text) => ({ text: yanderifyMarkdownProse(text, YANDERU), marks: [] }),
    });
    for (const protectedSource of [
      "> ```\n> really world\n",
      "- item\n\n  ~~~\n  really world\n",
      "-\n  ~~~\n  really world\n",
      "$$ really little $$",
      "$$\nreally ` world\n$$",
      '"really `code` little"',
      "'really `code` little'",
      "“really `code` little”",
      '"hello `code" text\nreally world\ncode` goodbye',
      '<span title="`">hello `code\nreally world\ncode`',
    ]) {
      const text = `${protectedSource}\n\nreally sweet world.`;
      const component = new AssistantMessageComponent(message(text));
      const prose = nativeMd(component.describe()).p?.text;
      expect(prose).toContain(protectedSource);
      expect(prose).toMatch(/rea{3,}lly swe{3,}t world\.$/);
    }
    const component = new AssistantMessageComponent(message("hello `code`    really world"));
    expect(nativeMd(component.describe()).p?.text).toMatch(/`code` {4}rea{3,}lly world/);
  });

  test("native inactive and host-transform paths return the host node unchanged", () => {
    const component = new AssistantMessageComponent(message(body));
    expect(component.describe()).not.toBe(originalDescribe.call(component));
    active = false;
    expect(component.describe()).toBe(originalDescribe.call(component));
    active = true;
    component.setTextColorTransform((text) => `HOST:${text}`);
    installation.refresh();
    expect(component.describe()).toBe(originalDescribe.call(component));
    component.setTextColorTransform(undefined);
    installation.refresh();
    expect(nativeMd(component.describe()).p?.marks).toEqual(blushMarks(body));
  });

  test("native settings refresh rebuilds cached nodes and omits empty marks", () => {
    let level: DereLevel = "clingy";
    let colors = true;
    installation = installBlush(Container, {
      isActive: () => active,
      transform: (text) => yanderifyProse(text, { level }),
      native: (text) => { const prose = yanderifyMarkdownProse(text, { level }); return { text: prose, marks: colors ? blushMarks(prose) : [] }; },
    });
    const text = "really sweet northern flowers ehehe~";
    const component = new AssistantMessageComponent(message(text));
    const first = component.describe();
    level = "yanderu";
    colors = false;
    installation.refresh();
    const next = component.describe();
    expect(next).not.toBe(first);
    expect(nativeMd(next).p?.text).toBe(yanderifyMarkdownProse(text, { level }));
    expect(Object.hasOwn(nativeMd(next).p!, "marks")).toBe(false);
    expect(component.describe()).toBe(next);
    active = false;
    installation.refresh();
    expect(component.describe()).toBe(originalDescribe.call(component));
  });

  test("native streaming reuses earlier Markdown and never decorates thinking or other children", () => {
    const thought = "really sweet ehehe~ (◕ᴗ◕✿)";
    const raw = Object.assign(message(""), {
      content: [{ type: "text", text: "first ehehe~" }, { type: "thinking", thinking: thought }, { type: "text", text: "tail Senpai~" }],
    });
    const component = new AssistantMessageComponent(raw);
    const source = originalDescribe.call(component);
    const first = component.describe();
    const section = source.c?.find((child) => "k" in child && child.key === "k1");
    expect(section).toBeDefined();
    expect(first.c?.find((child) => "k" in child && child.key === "k1")).toBe(section);
    expect(JSON.stringify(section)).toContain(thought);
    expect(JSON.stringify(section)).not.toContain('"marks"');
    for (let index = 0; index < source.c!.length; index++) {
      const child = source.c![index]!;
      if (!("k" in child) || child.k !== "md") expect(first.c![index]).toBe(child);
    }
    component.updateContent(Object.assign(message(""), {
      content: [{ type: "text", text: "first ehehe~" }, { type: "thinking", thinking: thought }, { type: "text", text: "tail Senpai~ grows" }],
    }), { transient: true });
    const next = component.describe();
    expect(next).not.toBe(first);
    expect(nativeMd(next)).toBe(nativeMd(first));
    expect(nativeMd(next, "t2").p?.text).toBe("tail Senpai~ grows");
  });

  test("native reload keeps one patch and dispose restores describe", () => {
    const component = new AssistantMessageComponent(message("really sweet ehehe~"));
    const patched = AssistantMessageComponent.prototype.describe;
    const first = component.describe();
    installation = installBlush(Container, {
      isActive: () => true,
      transform: (text) => yanderifyProse(text, YANDERU),
      native: (text) => ({ text: yanderifyMarkdownProse(text, YANDERU), marks: [] }),
    });
    expect(AssistantMessageComponent.prototype.describe).toBe(patched);
    const next = component.describe();
    expect(next).not.toBe(first);
    expect(nativeMd(next).p?.text).toBe(yanderifyMarkdownProse("really sweet ehehe~", YANDERU));
    expect(Object.hasOwn(nativeMd(next).p!, "marks")).toBe(false);
    installation.dispose();
    expect(AssistantMessageComponent.prototype.describe).toBe(originalDescribe);
    expect(nativeMd(component.describe()).p?.text).toBe("really sweet ehehe~");
  });
});

test("native node guards preserve malformed nodes, host marks, metadata and component children", () => {
  class HostContainer { addChild(_child: unknown) {} }
  let source: unknown;
  class HostAssistant extends HostContainer {
    constructor() { super(); this.addChild({}); this.updateContent(); }
    setTextColorTransform(_transform?: (text: string) => string) {}
    updateContent() {}
    describe() { return source; }
  }
  const installation = installBlush(HostContainer, {
    isActive: () => true,
    transform: (text) => text,
    native: (text) => ({ text, marks: blushMarks(text) }),
  });
  try {
    const component = new HostAssistant();
    for (const malformed of [null, { k: "row", c: [] }, { k: "col", c: null }]) {
      source = malformed;
      expect(component.describe()).toBe(source);
    }
    const hostMarks = [{ t: "host", s: "strong" }];
    const md = { k: "md", key: "t0", p: { text: "ehehe~", marks: hostMarks, stream: true }, reveal: { at: "end", n: 1 }, scroll: { by: "end", n: 1 } };
    const plain = { k: "md", key: "t1", p: { text: "plain", marks: [] } };
    const untouched = [
      { render() { return []; } },
      { k: "md", key: "t4", p: { text: "ehehe~", marks: {} } },
      { k: "md", key: "k0", p: { text: "ehehe~" } },
      { k: "section", key: "k1", c: [{ k: "md", key: "t5", p: { text: "ehehe~" } }] },
      { k: "badge", key: "error", p: { text: "ehehe~" } },
    ];
    const root = { k: "col", key: "root", p: { role: "omp.assistant" }, reveal: "end", c: [md, plain, ...untouched] };
    source = root;
    const original = JSON.stringify(source);
    const out = component.describe() as { key: string; p: unknown; reveal: string; c: typeof md[] };
    expect(out.key).toBe("root");
    expect(out.reveal).toBe("end");
    expect(out.p).toBe(root.p);
    expect(blushMarks("ehehe~")).toHaveLength(1);
    expect(out.c[0]!.p).toEqual({ text: "ehehe~", stream: true, marks: [...hostMarks, ...blushMarks("ehehe~")] });
    expect(out.c[0]!.reveal).toBe(md.reveal);
    expect(out.c[0]!.scroll).toBe(md.scroll);
    expect(out.c[1]!.p.marks).toEqual([]);
    untouched.forEach((child, index) => {
      const preservedChild: unknown = out.c[index + 2];
      expect(preservedChild).toBe(child);
    });
    expect(component.describe()).toBe(out);
    expect(JSON.stringify(source)).toBe(original);
    source = { k: "col", c: [md] };
    const next = component.describe() as { c: unknown[] };
    expect(next.c[0]).toBe(out.c[0]);
  } finally {
    installation.dispose();
  }
});

test("inherited native describe is not patched or reported as installed support", () => {
  class HostContainer {
    addChild(_child: unknown) {}
    describe() { return { k: "col", c: [{ k: "md", key: "t0", p: { text: "ehehe~" } }] }; }
  }
  class HostAssistant extends HostContainer {
    constructor() { super(); this.addChild({}); this.updateContent(); }
    setTextColorTransform(_transform?: (text: string) => string) {}
    updateContent() {}
  }
  const installation = installBlush(HostContainer, {
    isActive: () => true, transform: (text) => text,
    native: (text) => ({ text, marks: blushMarks(text) }),
  });
  try {
    const component = new HostAssistant();
    expect(installation.isSupported()).toBe(true);
    expect(installation.isNativeSupported()).toBe(false);
    expect(Object.hasOwn(HostAssistant.prototype, "describe")).toBe(false);
    expect(component.describe().c[0]!.p).toEqual({ text: "ehehe~" });
  } finally {
    installation.dispose();
  }
});

const hostTui = process.env.OMP_YANDERE_HOST_TUI ?? join(homedir(), ".bun", "install", "global", "node_modules", "@oh-my-pi", "pi-tui");
test.skipIf(!existsSync(join(hostTui, "src", "chat", "assistant-message.ts")))("installed omp ANSI render wraps display prose and preserves code/history", async () => {
  const host = await import(pathToFileURL(join(hostTui, "src", "index.ts")).href);
  const chat = await import(pathToFileURL(join(hostTui, "src", "chat", "assistant-message.ts")).href);
  let level: DereLevel = "yanderu";
  const installation = installBlush(host.Container, {
    isActive: () => true,
    transform: (run) => yanderifyProse(run, { level }),
    native: (text) => ({ text: yanderifyMarkdownProse(text, { level }), marks: [] }),
  });
  try {
    const prose = "northern nature normal nearby really sweet flowers";
    const body = `${prose} and \`really\`\n\n\`\`\`\nconst really = "sweet";\n\`\`\``;
    const raw = message(body);
    const original = JSON.stringify(raw);
    const component = new chat.AssistantMessageComponent(raw);
    expect(installation.isSupported()).toBe(true);
    const wide = Bun.stripANSI(component.render(80).join("\n"));
    expect(wide).toContain(yanderifyProse(`${prose} and `, { level }).trim());
    expect(wide).toContain('const really = "sweet";');
    expect(wide).toContain("really");
    const narrow = component.render(24).map((row: string) => Bun.stripANSI(row));
    expect(narrow.every((row: string) => host.visibleWidth(row) <= 24)).toBe(true);
    const md = new host.Markdown(prose, 0, 0, host.getMarkdownTheme(), { color: (run: string) => yanderifyProse(run, { level }) });
    const expected = new host.Markdown(yanderifyProse(prose, { level }), 0, 0, host.getMarkdownTheme());
    expect(md.render(12).map(Bun.stripANSI)).toEqual(expected.render(12).map(Bun.stripANSI));
    level = "dere";
    installation.refresh();
    expect(component.render(24).map(Bun.stripANSI)).not.toEqual(narrow);
    expect(JSON.stringify(raw)).toBe(original);
    if (installation.isNativeSupported()) {
      const description = JSON.stringify(component.describe());
      expect(description).toContain(JSON.stringify(yanderifyMarkdownProse(body, { level })).slice(1, -1));
      expect(description).not.toContain("\\u001b");
    }
  } finally {
    installation.dispose();
  }
});
