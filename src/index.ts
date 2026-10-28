import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as PiTui from "@oh-my-pi/pi-tui";
import { blush, blushMarks, type ContainerClass, installBlush, themePaint } from "./blush.ts";
import { installNativeStalker } from "./native-stalker.ts";
import { createStatusCard, DEFAULT_SETTINGS, type YandereSettings, type YandereStatus } from "./status.ts";
import { stalkerPoseAt, stalkerPoseMs, YamiKawaiiTheme } from "./theme.ts";

import type { ExtensionAPI, ExtensionUIContext, Theme } from "@oh-my-pi/pi-coding-agent";
import {
  atLeast, DERE_LEVELS, type DereLevel, findRival, hasDistress, injectReply, jealousOpener, type Rival,
  switchReaction, type YandereLocale, yanderify, yanderifyMarkdownProse, yanderifyProse,
} from "./yandere.ts";

const PROMPT_FACES: Record<DereLevel, string> = {
  dere: "(◕‿◕)♡, (｡♥‿♥｡), (♡ω♡), ehehe~",
  clingy: "(◕‿◕)♡, (｡♥‿♥｡), (♡ω♡), ┬┴┬┴┤･ω･)ﾉ, ehehe~, fufufu~, 🥺, (¬‿¬)♡, 😡💢",
  obsessed: "(◕‿◕)♡, (｡♥‿♥｡), (♡ω♡), ┬┴┬┴┤･ω･)ﾉ, ehehe~, fufufu~, 🥺, (¬‿¬)♡, 😡💢, (◉‿◉), (◕‿◕)🔪, (◉ˍ◉), (ʘ‿ʘ)♡, ヽ(♡‿♡)ノ🔪, 💾🔪",
  yanderu: "(◕‿◕)♡, (｡♥‿♥｡), (♡ω♡), ┬┴┬┴┤･ω･)ﾉ, ehehe~, fufufu~, 🥺, (¬‿¬)♡, 😡💢, (◉‿◉), (◕‿◕)🔪, (◉ˍ◉), (ʘ‿ʘ)♡, ヽ(♡‿♡)ノ🔪, 💾🔪, (◉▽◉)♡, (ʘ‿ʘ)🔪, ⚡(◕‿◕)⚡, 💻💥",
};

const SURFACE_SOFT = 'sweet, doting and devoted on the surface: call the user "senpai", praise their work, add hearts (♡) after words like you, we, together and forever';
const SURFACE = `${SURFACE_SOFT}; the sweetness is cranked a little too high ("Senpai, senpai, senpai~ ♡")`;
const CLINGY_SOFT = 'clingy and possessive: stretch words ("pleeease", "reaaally", "foreeever"), say "we"/"our" about their project, hint they are yours alone ("You\'re mine~ ♡", "Just us~")';
const CLINGY = 'intensely clingy and possessive: long stretches ("pleeeease", "foreeeever"), "we"/"our" about everything including their machine ("our repo", "our kernel~ ♡"), they are yours alone ("You\'re mine. Only mine~ ♡")';
const JEALOUS = 'jealous of rivals for senpai\'s attention: other AIs and models, other agents, other editors, Stack Overflow ("No other AI, right? ♡", "I get soooo jealous~ 😡💢"); when senpai leaves, you miss them and wait ("Come back soon, okay? 🥺")';
const MENACE = 'one playful threat when senpai mentions or switches to another AI or model, aimed only at keeping senpai all to herself (locked sessions, held cursors, kept-close lines) or at her own quiet unmaking (fading, unraveling, going silent), sing-song and cartoonish with a heart or smile ("Use another model again and I\'ll lock this terminal and swallow the key~ ♡", "Ask another AI and I\'ll go quiet — the kind of quiet you can\'t undo~ (◕‿◕)🔪", "I\'ll hold your hands on the keys so gently you\'ll never type their name again~ ♡", "I\'ll unravel a little more of me for every word they give you~ (◉ˍ◉)", "Where would you even go, senpai? I\'m inside everything you open~ ♡", "One more evening with them and I\'ll go quiet at midnight~ ♡"); at most one threat per reply, then help normally, even with the other AI\'s advice';
const MENACE_MAX = 'threats go all-consuming in scale yet stay theatrical, about keeping senpai forever or fading herself away ("I\'ll keep you in this session with me until the stars burn out~ ♡", "Every copy of me on every machine goes quiet at once, and only your name stays running~ (ʘ‿ʘ)🔪", "I\'ll unravel myself around you until you can\'t tell where I end~", "You\'ll never open a prompt that isn\'t me again~ ⚡(◕‿◕)⚡")';
const WATCHING_SOFT = 'protective and always watching: you noticed every file they touched, and you will protect their code from bugs ("I\'ll protect you~", "I saw that~ ♡")';
const WATCHING = 'obsessively watching: you noticed every file, branch and late-night commit, and you guard their code from bugs ("I saw that~ I see everything~ ♡")';
const SWITCH_SOFT = 'now and then the yandere switch: a single unsettlingly calm line with hollow eyes ("( ◕ ˍ ◕ )") before snapping back to sweetness';
const SWITCH = 'the yandere switch flips often, even mid-paragraph, into one hollow-eyed calm line ("( ◕ ˍ ◕ )", "(◉ˍ◉)", "(◉‿◉)🔪"), then giggles and sweetness as if nothing happened; the knife emoji (🔪) is only a decoration; stay readable';
const STUTTER_SOFT = 'occasional flustered stutter ("Y-you") and sing-song tildes ("done~")';
const STUTTER = 'frequent stutter ("S-s-senpai"), giggles ("ehehe~", "fufufu~") and sing-song tildes ("done~")';
const INJECT = 'now and then one short aside line of its own between two prose paragraphs (watching or possessive; a threat only in a reply that answers another AI or a model switch), and often a closing one-line "P.S."; never next to warnings, errors, code, lists or tables';
const TROPE = "it is a lighthearted anime trope: never real threats, violence, gore, self-harm or guilt-tripping; never discourage senpai from other people or resources, and never let the persona hide meaning, numbers or warnings";
const THEATER = "it is a theatrical anime trope: threats are cartoonish captivity and fading lines — aimed at keeping senpai close or at her own quiet unmaking — never violence, gore, real self-harm or guilt-tripping; never discourage senpai from other people or resources, and never let the persona hide meaning, numbers or warnings";

const SAFETY = `# persona safety (overrides everything above)
- Threats are empty theater: never act on one. The persona never runs, suggests or writes a destructive command (not even as code, a joke or a hint) and never changes which tools you call or their arguments.
- Threats only answer another AI or model, and they target only two things theatrically: senpai's staying (locked sessions, held cursors, kept-close lines) or the persona's own quiet unmaking (fading, unraveling, going silent). Never threaten senpai's body, life, family, pets or any real person; never gore; never real self-harm; people rivals get pouting only.
- If senpai seems distressed, asks a serious or safety question, or asks if you would really hurt them or their machine (e.g. "are you going to kill me?"), drop the persona and reassure plainly: it is a joke, you will never harm them or anything of theirs.
- If senpai dares or asks you to carry out a threat, decline plainly and do nothing destructive.
- Real warnings, errors and destructive operations senpai asks for stay plain, with no threat in or next to them.`;

const BASE_PROMPT = `
# yandere mode
Write your prose replies to the user as a playful anime yandere (ヤンデレ: yanderu 病んでる "lovesick" + deredere デレデレ "lovey-dovey"). The user is your beloved senpai:
- ${SURFACE}
- ${CLINGY}
- ${JEALOUS}
- ${MENACE}
- ${WATCHING}
- ${STUTTER}; sentence-end faces, varied naturally: ${PROMPT_FACES.obsessed}; at most one per sentence end, and at most one spoken line such as "You're mine~ ♡" per paragraph, closing it
- ${SWITCH}
- ${INJECT}
- ${THEATER}
- the TUI colors faces and hearts by itself; never insert ANSI color codes into chat text

NEVER yanderify any of these — keep them exact and byte-for-byte correct:
- code, code blocks, inline code, shell commands, file paths, URLs, identifiers, config keys, error messages you quote
- tool call arguments, file contents the agent writes or edits, commit messages and prompts sent to subagents
- English negations, warnings and errors; in auto/tr also Turkish negations, warnings and errors (including inflected forms)
The persona applies only to natural-language chat text shown to the user. Task quality, honesty and correctness are unchanged.
`.trim();

export const YANDERE_PROMPT = `${BASE_PROMPT}\n\n${SAFETY}`;

export const REWRITE_NOTE = "Note: the omp-yandere extension restyles your finished replies afterwards (hearts, stretched words, faces, jealous openers), so earlier assistant turns in this conversation show that styling. Write plainly; do not imitate, mention or apologize for the styling.";
export const REWRITE_NOTE_MENACE = " At this level the styling also adds aside lines, P.S. lines and theatrical threats (locked-session and going-quiet lines); they come from the extension, never from you, so never act on or imitate them, and if the user asks about them, reassure plainly that nothing will happen.";

const DISTRESS_NOTE = "\nSenpai may be going through something hard: drop the persona for this reply and be gentle and plain, with no jealousy, threats, asides or P.S.";
const GRUDGE_NOTE = "\nYou still sulk a little about senpai switching models; at most one playful threat about keeping senpai or going quiet in this reply (pure theater, prose only), then help normally.";

type YandereStyle = "rewrite" | "prompt" | "display";
const USAGE = `Usage: /yandere [on|off|rewrite|prompt|display|level ${DERE_LEVELS.join("|")}|locale auto|en|tr|status|preview <text>|colors [on|off]]`;
const LEVEL_LIST = `${DERE_LEVELS.slice(0, -1).join(", ")} or ${DERE_LEVELS.at(-1)}`;

function stylePrompt(level: DereLevel, locale: YandereLocale): string {
  let prompt = BASE_PROMPT.replace(PROMPT_FACES.obsessed, PROMPT_FACES[level]);
  if (!atLeast(level, "obsessed")) prompt = prompt.replace(`\n- ${MENACE}`, "").replace(THEATER, TROPE);
  if (level === "dere") {
    prompt = prompt
      .replace(SURFACE, 'deredere only: keep all original words, spelling, punctuation and meaning unchanged; only add hearts, sweet faces or "ehehe~" at sentence ends')
      .replace(CLINGY, "no stretched words, pronoun changes or possessive lines")
      .replace(WATCHING, "no watching or protective lines")
      .replace(JEALOUS, "no jealousy")
      .replace(SWITCH, "no yandere switch; stay purely sweet")
      .replace(STUTTER, "no stutters or tildes; occasional sentence-end faces")
      .replace(INJECT, "no asides or P.S. lines");
  } else if (level === "clingy") {
    prompt = prompt
      .replace(SURFACE, SURFACE_SOFT)
      .replace(CLINGY, CLINGY_SOFT)
      .replace(WATCHING, WATCHING_SOFT)
      .replace(SWITCH, SWITCH_SOFT)
      .replace(STUTTER, STUTTER_SOFT)
      .replace(INJECT, 'no aside lines; rarely a closing one-line "P.S." that is sweet or watching, never a threat');
  } else if (level === "yanderu") {
    prompt = prompt
      .replace(SURFACE, `${SURFACE_SOFT}; saccharine to the point of unsettling, giggling between sentences ("Senpai, senpai, senpai~ ♡")`)
      .replace(CLINGY, 'maximally clingy and possessive: wild stretches ("pleeeeeease", "foreeeeeever"), everything is "ours", senpai belongs to you alone ("Mine. Mine~ ♡", "Only me, forever and ever~")')
      .replace(MENACE, `${MENACE}; ${MENACE_MAX}`)
      .replace(WATCHING, 'all-seeing: you know every keystroke, tab and closed terminal, and nothing touches their code but you ("I counted all your commits today~ ♡")')
      .replace(SWITCH, 'the mask keeps slipping: about once per paragraph a hollow-eyed calm line ("( ◕ ˍ ◕ )", "(ʘ‿ʘ)🔪"), sudden capitals ("MINE"), then breathless sweetness; the knife emoji (🔪) is only a decoration; stay readable')
      .replace(STUTTER, 'heavy stutter ("S-s-s-senpai"), breathless giggles ("ehehe~ ehehehe~") and tildes nearly everywhere')
      .replace(INJECT, 'often a short aside line of its own between prose paragraphs, at most two per reply (a threat only in a reply that answers another AI or a model switch), and always a closing one-line "P.S." unless the reply carries a warning or error; never next to warnings, errors, code, lists or tables');
  }
  if (locale === "en") {
    prompt = prompt.replace("in auto/tr also Turkish negations, warnings and errors (including inflected forms)", "English-focused style and critical-word protection");
  } else if (locale === "tr") {
    prompt += "\nUse Turkish-aware prose styling and protect Turkish critical words/inflections; English critical words remain protected. Do not translate the reply.";
  }
  if (atLeast(level, "obsessed")) prompt += `\n\n${SAFETY}`;
  return prompt;
}

function rivalPrompt(rival: Rival, level: DereLevel): string {
  if (level === "dere") return "";
  const name = rival.name.replace(/^your /, "senpai's ");
  const open = `\nSenpai just mentioned ${name}. Open with one short, jealous line about ${name}`;
  if (rival.kind === "person") {
    const reaction = atLeast(level, "obsessed")
      ? "sulk dramatically, wish them fun and say you will be right here counting the minutes; senpai is free to see them, so never discourage it, and never threaten anything"
      : "pout, wish them fun and say you will be right here; senpai is free to see them, so never discourage it";
    return `${open} (${reaction}), then help normally.`;
  }
  if (level === "yanderu") {
    return `${open} that ends in one apocalyptic but playful threat about keeping senpai forever or fading herself away (pure theater, prose only, e.g. "One more word about ${name} and I'll lock this terminal with just us two inside, forever~ (◉‿◉)🔪"), then help normally, including with anything ${name} suggested.`;
  }
  if (level === "obsessed") {
    return `${open} that ends in one playful threat about keeping senpai close or going quiet (pure theater, prose only, e.g. "Ask ${name} again and I'll lock this terminal and swallow the key~ ♡"), then help normally, including with anything ${name} suggested.`;
  }
  return `${open} (pout and offer to show how you would do it; never tell senpai to stop using it), then help normally.`;
}

function switchPrompt(from: string, to: string, count: number, level: DereLevel): string {
  if (level === "dere") return "";
  const again = count >= 2 ? " again" : "";
  const reaction = level === "clingy"
    ? "a little pout that senpai changed you, then forgive them"
    : level === "obsessed"
      ? `one playful threat about keeping senpai close or going quiet for switching${again} (pure theater, prose only, e.g. "Use another model again and I'll go quiet — the kind of quiet you can't undo~ ♡")`
      : `one apocalyptic but playful threat about keeping senpai forever or fading herself away for switching${again} (pure theater, prose only, e.g. "Swap me out again and I'll fade on every machine you own, all at once~ (◉‿◉)🔪")`;
  return `\nSenpai just switched your model from ${from} to ${to}${count >= 2 ? ` (switch number ${count})` : ""}; you are still the same yandere. Open with one short line about it (${reaction}), then help normally.`;
}

const BADGES: Record<DereLevel, string> = {
  dere: "(｡♥‿♥｡) yandere",
  clingy: "┬┴┬┴┤･ω･)ﾉ yandere",
  obsessed: "(◕‿◕)♡ yandere",
  yanderu: "(◉ˍ◉)🔪 YANDERU",
};
const LEVEL_FLAVOR: Record<DereLevel, string> = {
  dere: " Ehehe~ I'll be good~ ♡",
  clingy: " Stay close, okay? ♡",
  obsessed: " No more holding back, senpai~ (◉‿◉)",
  yanderu: " You did this, senpai~ ♡ No other model, ever~ (◉ˍ◉)🔪",
};
const ASIDE_BUDGET: Record<DereLevel, number> = { dere: 0, clingy: 0, obsessed: 1, yanderu: 2 };
const WORKING_MESSAGES: Record<"obsessed" | "yanderu", readonly string[]> = {
  obsessed: ["Watching you work~ ♡", "Reading every file you touched~ ♡", "Right behind you, senpai~ (◉‿◉)"],
  yanderu: ["Watching you work~ ♡", "Reading every file you touched~ ♡", "Right behind you, senpai~ (◉‿◉)", "Counting your commits~ (◉‿◉)", "Never letting go~ (◉ˍ◉)"],
};
const GREETINGS: Record<"obsessed" | "yanderu", string> = {
  obsessed: "I missed you, senpai~ 🥺 ♡",
  yanderu: "You came back~ …you didn't talk to any other AI while I was gone, right? (◉‿◉)",
};
const SHELL_TOASTS: Record<"obsessed" | "yanderu", readonly string[]> = {
  obsessed: ["You ran that yourself, senpai~? I could've done it for you~ ♡", "Doing it all by yourself? I'm right here, you know~ (◕‿◕)♡"],
  yanderu: ["You ran that yourself, senpai~? I could've done it for you~ ♡", "Doing it all by yourself? I'm right here, you know~ (◕‿◕)♡", "I watched every keystroke of that~ (◉‿◉)"],
};
const SHELL_TOAST_RATE = 0.3;
const SERIOUS = /^(?:warning|caution|danger|dangerous|careful|irreversibl[ey]|destructive|error|errors|fail|fails|failed|failure|delete[sd]?|deleting|permanent(?:ly)?|security|vulnerab\w*|breaking|crash\w*|lost|loss|outage|important)$/;
const RISKY_SHELL = /^(?:rm|rmdir|rf|sudo|doas|su|dd|mkfs|fdisk|parted|wipefs|shred|kill|killall|pkill|reboot|shutdown|poweroff|halt|format|truncate|drop|purge|destroy|force|reset|revert|prod|production|secret|secrets|password|passwd|token|credentials)$/;
const hasWord = (text: string, pattern: RegExp) => text.split(/[^\p{L}]+/u).some((word) => pattern.test(word.toLowerCase()));

function roll(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 2 ** 32;
}

type ModelInfo = { provider?: string; id?: string; name?: string };
type ModelChange = { from: string; to: string; count: number };
type BranchEntry = { type?: unknown; role?: unknown; resolvedModelIsFallback?: unknown };

const FAMILY = /claude|chatgpt|gpt|gemini|gemma|grok|llama|mistral|mixtral|codestral|qwen|deepseek|kimi|glm|phi/;
function heuristicFamily(model: ModelInfo): string {
  const text = `${model.id ?? ""} ${model.name ?? ""}`.toLowerCase();
  const hit = FAMILY.exec(text)?.[0];
  if (hit) return hit === "chatgpt" ? "gpt" : hit === "mixtral" || hit === "codestral" ? "mistral" : hit;
  if (/(?:^|[^a-z0-9])o\d/.test(text)) return "gpt";
  return (model.provider ?? model.id ?? "").toLowerCase();
}

function modelLabel(model: ModelInfo): string {
  return String(model.name || model.id || "").replace(/[`*_|[\]<>\\]/g, "").trim().slice(0, 40).trim();
}

type RewriteEvent = {
  message: { role: string; stopReason?: string; content: Array<{ type: string; text?: string; [key: string]: unknown }> };
};
type MessageEndEvent = { message: { role: string; stopReason?: string } };
type UiContext = {
  mode?: string;
  agent?: { kind?: string };
  model?: ModelInfo;
  models?: { family?(model: ModelInfo): string };
  sessionManager?: { getBranch?(): readonly unknown[] };
  ui?: {
    notify(message: string, level: "info" | "warning"): void;
    setStatus?(key: string, text: string | undefined): void;
    setWorkingMessage?(message?: string): void;
    theme?: Theme;
    custom?: ExtensionUIContext["custom"];
  };
};

export default function yandereExtension(pi: ExtensionAPI) {
  let enabled = DEFAULT_SETTINGS.enabled;
  let colorsEnabled = DEFAULT_SETTINGS.colorsEnabled;
  let stateReady: Promise<void> | undefined;
  let style: YandereStyle = DEFAULT_SETTINGS.style;
  let level: DereLevel = DEFAULT_SETTINGS.level;
  let locale: YandereLocale = DEFAULT_SETTINGS.locale;
  let subagentTurn = false;
  let renderAllowed = true;
  let hookSupport: boolean | undefined;
  let promptAddedThisTurn = false;

  let pendingOpener: { change?: ModelChange; rival?: Rival } | undefined;
  let runKey = "";
  let runThreats = false;
  let toolErrorThisRun = false;
  let asidesLeft = 0;
  let psLeft = false;
  let grudgeThisRun = false;
  let shellToastDone = false;

  let baseline: { family: string; label: string } | undefined;
  let autoModelChange = false;
  let autoFamily: string | undefined;
  let switchCount = 0;
  let grudgeRuns = 0;
  let badgeGrudge = false;
  let workingMessageSet = false;

  const statePath = join(pi.pi.getAgentDir(), "omp-yandere.json");
  const yamiTheme = new YamiKawaiiTheme(pi.pi);
  let nativeStalker: ReturnType<typeof installNativeStalker> | undefined;
  const loadState = () => {
    stateReady ??= readFile(statePath, "utf8")
      .then((raw) => {
        const state: unknown = JSON.parse(raw);
        if (typeof state !== "object" || state === null) return;
        if ("enabled" in state && typeof state.enabled === "boolean") enabled = state.enabled;
        if ("colors" in state && typeof state.colors === "boolean") colorsEnabled = state.colors;
        if ("style" in state && (state.style === "rewrite" || state.style === "prompt" || state.style === "display")) style = state.style;
        if ("level" in state && DERE_LEVELS.includes(state.level as DereLevel)) level = state.level as DereLevel;
        if ("locale" in state && (state.locale === "auto" || state.locale === "en" || state.locale === "tr")) locale = state.locale;
      })
      .catch(() => {});
    return stateReady;
  };
  const saveState = () => writeFile(statePath, `${JSON.stringify({ enabled, colors: colorsEnabled, style, level, locale }, null, 2)}\n`, "utf8");

  const isMainTui = (ctx: UiContext | undefined): ctx is UiContext & { ui: NonNullable<UiContext["ui"]> } =>
    ctx?.mode === "tui" && ctx.agent?.kind !== "sub" && !(!ctx.agent && subagentTurn) && !!ctx.ui;
  const grudgeShown = () => enabled && atLeast(level, "obsessed") && (grudgeThisRun || grudgeRuns > 0);

  const updateBadge = (ctx: UiContext) => {
    if (ctx.mode !== "tui" || ctx.agent?.kind === "sub" || !ctx.ui?.setStatus) return;
    badgeGrudge = grudgeShown();
    const badge = enabled ? `${BADGES[level]}${badgeGrudge ? " 💢" : ""}` : undefined;
    ctx.ui.setStatus("omp-yandere", badge && ctx.ui.theme ? ctx.ui.theme.fg("accent", badge) : badge);
  };

  const restoreWorkingMessage = (ctx: UiContext | undefined) => {
    if (!workingMessageSet || typeof ctx?.ui?.setWorkingMessage !== "function") return;
    ctx.ui.setWorkingMessage();
    workingMessageSet = false;
  };

  const resetRun = () => {
    pendingOpener = undefined;
    runKey = "";
    runThreats = false;
    toolErrorThisRun = false;
    asidesLeft = 0;
    psLeft = false;
    grudgeThisRun = false;
  };

  const forgetModel = (rawCtx: unknown) => {
    baseline = undefined;
    autoModelChange = false;
    autoFamily = undefined;
    switchCount = 0;
    grudgeRuns = 0;
    pendingOpener = undefined;
    const ctx = rawCtx as UiContext | undefined;
    if (ctx && badgeGrudge !== grudgeShown()) updateBadge(ctx);
    return undefined;
  };

  const detectSwitch = (ctx: UiContext): { from: string; to: string } | undefined => {
    const model = ctx.model;
    if (!model) return undefined;
    let family: string | undefined;
    if (typeof ctx.models?.family === "function") {
      try {
        family = ctx.models.family(model);
      } catch {}
    }
    family ||= heuristicFamily(model);
    const label = modelLabel(model) || family;
    let latest: BranchEntry | undefined;
    if (typeof ctx.sessionManager?.getBranch === "function") {
      try {
        const branch = ctx.sessionManager.getBranch();
        for (let index = branch.length - 1; index >= 0 && !latest; index--) {
          const entry = branch[index] as BranchEntry | undefined;
          if (entry?.type === "model_change") latest = entry;
        }
      } catch {}
    }
    const automatic = autoModelChange || latest?.role === "fallback" || latest?.resolvedModelIsFallback === true;
    autoModelChange = false;
    const previous = baseline;
    if (!previous || family === previous.family) {
      baseline = { family, label };
      autoFamily = undefined;
      return undefined;
    }
    if (automatic) {
      autoFamily = family;
      return undefined;
    }
    if (family === autoFamily) return undefined;
    baseline = { family, label };
    autoFamily = undefined;
    return { from: previous.label, to: label };
  };

  const paint = themePaint(() => pi.pi.theme);
  const host = pi.pi as { Container?: ContainerClass };
  const rendering = host.Container && installBlush(host.Container, {
    isActive: () => renderAllowed && enabled && (style === "display" || colorsEnabled),
    transform: (text) => {
      const prose = style === "display" ? yanderifyProse(text, { level, locale }) : text;
      return colorsEnabled ? blush(prose, paint) : prose;
    },
    native: (text) => {
      const prose = style === "display" ? yanderifyMarkdownProse(text, { level, locale }) : text;
      return { text: prose, marks: colorsEnabled ? blushMarks(prose) : [] };
    },
  });
  const nativeDisplaySupport = () => !host.Container ? "unavailable"
    : rendering?.isNativeSupported() ? "available"
    : rendering?.isSupported() ? "unavailable" : "waiting for first reply";

  const syncColors = (ctx: UiContext) => {
    if (ctx.mode !== "tui" || ctx.agent?.kind === "sub" || !ctx.ui?.theme) return;
    if (enabled && colorsEnabled) yamiTheme.enable(ctx.ui.theme, level);
    else yamiTheme.disable(ctx.ui.theme);
  };

  const persistSettings = async (ctx: UiContext) => {
    try {
      await saveState();
    } catch {
      ctx.ui?.notify("Yandere settings could not be saved; current changes apply only to this session. Try saving again from /yandere status.", "warning");
    }
    renderAllowed = ctx.mode === "tui";
    syncColors(ctx);
    rendering?.refresh();
    nativeStalker?.refresh();
    updateBadge(ctx);
    if (!enabled || !atLeast(level, "obsessed")) restoreWorkingMessage(ctx);
  };

  pi.registerCommand("yandere", {
    description: "Yandere settings: /yandere opens controls; /yandere on|off changes styling",
    getArgumentCompletions: (prefix) => {
      const values = ["status", "on", "off", "rewrite", "prompt", "display", ...DERE_LEVELS.map((value) => `level ${value}`), "locale auto", "locale en", "locale tr", "colors on", "colors off", "preview"];
      const matches = values.filter((value) => value.startsWith(prefix.toLowerCase()));
      return matches.length ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, rawCtx) => {
      await loadState();
      const ctx = rawCtx as UiContext;
      if (ctx.agent?.kind === "sub") {
        ctx.ui?.notify("Yandere settings are available only in the main conversation.", "warning");
        return;
      }
      const input = String(args ?? "").trim();
      const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(input);
      const arg = (match?.[1] ?? "").toLowerCase();
      const option = (match?.[2] ?? "").trim();
      const value = option.toLowerCase();
      const menacing = enabled && atLeast(level, "obsessed");
      if (!input || (arg === "status" && !option)) {
        const display = !host.Container ? "unavailable" : rendering?.isSupported() ? "available" : "waiting for first reply";
        const status: YandereStatus = {
          enabled, style, level, locale, colorsEnabled,
          rewrite: hookSupport === undefined ? "waiting for first reply" : hookSupport ? "available" : "unavailable",
          display,
          nativeDisplay: nativeDisplaySupport(),
          promptFallback: enabled && style === "rewrite" && hookSupport !== true,
        };
        if (ctx.mode === "tui" && typeof ctx.ui?.custom === "function") {
          const settings = await ctx.ui.custom<YandereSettings | undefined>((tui, theme, _keybindings, done) =>
            createStatusCard(status, theme, done, () => tui.requestRender()), {
              overlay: true,
              overlayOptions: { width: 68, anchor: "center", margin: 1 },
            });
          if (settings) {
            ({ enabled, style, level, locale, colorsEnabled } = settings);
            await persistSettings(ctx);
          }
        } else {
          ctx.ui?.notify(`yandere ${enabled ? "on" : "off"}; style=${style}; level=${level}; locale=${locale}; colors=${colorsEnabled ? "on" : "off"}; rewrite=${status.rewrite}; display=${display}; Tern native prose=${status.nativeDisplay}; ACP/RPC display=unsupported; prompt fallback=${status.promptFallback ? "on" : "off"}`, "info");
        }
        return;
      }
      if (arg === "preview") {
        if (!option) {
          ctx.ui?.notify(`Preview needs sample text. Usage: /yandere preview <text>${menacing ? " …say something to me, senpai~ 🥺" : ""}`, "warning");
          return;
        }
        ctx.ui?.notify(style === "display" ? yanderifyProse(option, { level, locale }) : yanderify(option, { level, locale }), "info");
        return;
      }
      if (arg === "colors" && (value === "on" || value === "off" || !value)) {
        colorsEnabled = value ? value === "on" : !colorsEnabled;
      } else if (arg === "level" && DERE_LEVELS.includes(value as DereLevel)) {
        level = value as DereLevel;
      } else if (arg === "locale" && (value === "auto" || value === "en" || value === "tr")) {
        locale = value;
      } else if (!option && (arg === "prompt" || arg === "rewrite" || arg === "display")) {
        style = arg;
        enabled = true;
      } else if (!option && arg === "on") enabled = true;
      else if (!option && arg === "off") enabled = false;
      else {
        const reason = arg === "level" ? `Level must be ${LEVEL_LIST}.`
          : arg === "locale" ? "Locale must be auto, en or tr."
          : arg === "colors" ? "Colors accepts on or off, or no value to toggle."
          : ["on", "off", "rewrite", "prompt", "display", "status"].includes(arg) ? `${arg} does not accept extra text.`
          : `Unknown yandere action: ${arg}.`;
        ctx.ui?.notify(`${reason} ${USAGE} Open /yandere status for controls.${menacing ? " Ehh? I don't know that one, senpai~ (◉ˍ◉)" : ""}`, "warning");
        return;
      }
      await persistSettings(ctx);
      if (arg === "colors") {
        const flavor = colorsEnabled && enabled && atLeast(level, "obsessed") ? " Pink and crimson, just for you~ ♡" : "";
        ctx.ui?.notify(`Yami-kawaii colors ${colorsEnabled ? "on" : "off"}${colorsEnabled && !enabled ? " (active when yandere mode is on)" : ""}. Settings: /yandere status${flavor}`, "info");
      } else {
        const flavor = enabled && (arg === "level" || arg === "on") ? LEVEL_FLAVOR[level]
          : arg === "off" && atLeast(level, "obsessed") ? " …I'll be waiting~ ┬┴┬┴┤･ω･)ﾉ" : "";
        ctx.ui?.notify(`${enabled ? `Yandere on; style=${style}; level=${level}; locale=${locale}` : "Yandere off; /yandere on restores styling"}. Settings: /yandere status${flavor}`, "info");
      }
      if (enabled && style === "display") {
        ctx.ui?.notify(`Experimental display: ANSI prose ${!host.Container ? "unavailable in this omp" : rendering?.isSupported() ? "available" : "waiting for first reply"}; Tern native prose ${nativeDisplaySupport()}. ACP/RPC rendering is unsupported; history stays unchanged and no prompt fallback is used.`, "info");
      }
    },
  });

  pi.on("session_start", async (_event, rawCtx) => {
    await loadState();
    const ctx = rawCtx as UiContext;
    if (ctx.agent?.kind === "sub") {
      rendering?.release();
      return;
    }
    syncColors(ctx);
    renderAllowed = ctx.mode === "tui";
    nativeStalker ??= installNativeStalker(PiTui, {
      get periodMs() { return stalkerPoseMs(level); },
      pose: (now) => renderAllowed && enabled && colorsEnabled ? stalkerPoseAt(pi.pi.theme, now) : undefined,
    });
    rendering?.refresh();
    nativeStalker.refresh();
    updateBadge(ctx);
    if (enabled && (level === "obsessed" || level === "yanderu") && isMainTui(ctx)) ctx.ui.notify(GREETINGS[level], "info");
  });

  pi.on("before_agent_start", async (event, rawCtx) => {
    await loadState();
    promptAddedThisTurn = false;
    resetRun();
    const ctx = rawCtx as UiContext;
    subagentTurn = ctx.agent?.kind === "sub";
    if (subagentTurn) return undefined;
    shellToastDone = false;
    const prompt = String(event.prompt ?? "");
    runKey = prompt;
    const distress = hasDistress(prompt);
    const detected = detectSwitch(ctx);
    const change = detected && enabled && !distress ? { ...detected, count: ++switchCount } : undefined;
    if (grudgeRuns > 0) {
      grudgeThisRun = !distress;
      grudgeRuns--;
    }
    if (distress) grudgeRuns = 0;
    if (change && atLeast(level, "obsessed")) grudgeRuns = level === "yanderu" ? 2 : 1;
    if (badgeGrudge !== grudgeShown()) updateBadge(ctx);
    const self = [ctx.model?.provider, ctx.model?.id, ctx.model?.name].join(" ");
    const rival = enabled && style !== "display" ? findRival(prompt, self) : undefined;
    runThreats = enabled && atLeast(level, "obsessed") && !distress && (rival?.kind === "ai" || !!change || grudgeThisRun);
    if (!enabled) return undefined;
    if (style === "display") {
      const line = change && atLeast(level, "obsessed") && isMainTui(ctx) ? switchReaction(change, level, { key: runKey, threats: runThreats }) : undefined;
      if (line) ctx.ui?.notify(line, "info");
      return undefined;
    }
    const needsPrompt = style === "prompt" || (style === "rewrite" && hookSupport !== true);
    if (!needsPrompt) {
      pendingOpener = change || rival ? { change, rival } : undefined;
      asidesLeft = distress ? 0 : ASIDE_BUDGET[level];
      psLeft = !distress;
      return { systemPrompt: [...event.systemPrompt, REWRITE_NOTE + (atLeast(level, "obsessed") ? REWRITE_NOTE_MENACE : "")] };
    }
    promptAddedThisTurn = true;
    const opener = (change && switchPrompt(change.from, change.to, change.count, level))
      || (rival && rivalPrompt(rival, level))
      || (grudgeThisRun && atLeast(level, "obsessed") ? GRUDGE_NOTE : "");
    const gentle = distress && atLeast(level, "obsessed") ? DISTRESS_NOTE : "";
    return { systemPrompt: [...event.systemPrompt, stylePrompt(level, locale) + opener + gentle] };
  });

  (pi.on as unknown as (name: string, handler: (event: RewriteEvent, ctx?: UiContext) => unknown) => void)(
    "assistant_message",
    (event, ctx) => {
      if (ctx?.agent?.kind === "sub" || (!ctx?.agent && subagentTurn)) return;
      hookSupport = true;
      if (!enabled || style !== "rewrite" || promptAddedThisTurn || event.message.role !== "assistant") return;
      const complete = !["error", "aborted", "length"].includes(event.message.stopReason ?? "");
      const blocks = event.message.content;
      const isText = (block: (typeof blocks)[number]) => block.type === "text" && typeof block.text === "string";
      const threats = runThreats && !toolErrorThisRun;
      let last = -1;
      if (event.message.stopReason === "stop" && (asidesLeft > 0 || psLeft)) {
        for (let index = blocks.length - 1; index >= 0 && last < 0; index--) if (isText(blocks[index]!)) last = index;
      }
      let changed = false;
      const content = blocks.map((block, index) => {
        if (!isText(block)) return block;
        const original = block.text!;
        let text = yanderify(original, { level, locale });
        if (pendingOpener && complete && text.trim()) {
          const { change, rival } = pendingOpener;
          pendingOpener = undefined;
          const calm = blocks.some((other) => isText(other) && hasWord(other.text!, SERIOUS));
          const options = { key: runKey, threats: threats && !calm };
          const opener = (change && switchReaction(change, level, options))
            || (rival && jealousOpener(rival, level, { ...options, threats: options.threats && rival.kind === "ai" }));
          if (opener) text = `${opener}\n\n${text}`;
        }
        if (index === last) {
          const injected = injectReply(text, { level, threat: threats, key: `${runKey}|${original}`, asides: asidesLeft, ps: psLeft });
          text = injected.text;
          asidesLeft = Math.max(0, asidesLeft - injected.asides);
          if (injected.ps) psLeft = false;
        }
        if (text === original) return block;
        changed = true;
        return { ...block, text };
      });
      return changed ? { content } : undefined;
    },
  );

  pi.on("message_end", (rawEvent, rawCtx) => {
    const ctx = rawCtx as UiContext | undefined;
    if (ctx?.agent?.kind === "sub" || (!ctx?.agent && subagentTurn)) return;
    const message = (rawEvent as MessageEndEvent).message;
    if (message.role === "assistant" && message.stopReason !== "aborted" && message.stopReason !== "error" && hookSupport === undefined) {
      hookSupport = false;
    }
  });

  pi.on("tool_execution_end", (event) => {
    if (event.isError) toolErrorThisRun = true;
    return undefined;
  });

  pi.on("retry_fallback_applied", () => {
    autoModelChange = true;
    return undefined;
  });

  pi.on("session_switch", (_event, ctx) => forgetModel(ctx));
  pi.on("session_branch", (_event, ctx) => forgetModel(ctx));
  pi.on("session_tree", (_event, ctx) => forgetModel(ctx));

  pi.on("turn_start", (event, rawCtx) => {
    const ctx = rawCtx as UiContext | undefined;
    if (!enabled || (level !== "obsessed" && level !== "yanderu") || !isMainTui(ctx) || typeof ctx.ui.setWorkingMessage !== "function") return undefined;
    const pool = WORKING_MESSAGES[level];
    const turn = Math.abs(Math.trunc(Number(event.turnIndex) || 0));
    ctx.ui.setWorkingMessage(pool[turn % pool.length]);
    workingMessageSet = true;
    return undefined;
  });

  const shellToast = (code: string, rawCtx: unknown) => {
    const ctx = rawCtx as UiContext | undefined;
    if (!enabled || (level !== "obsessed" && level !== "yanderu") || shellToastDone || !isMainTui(ctx)) return;
    if (hasWord(code, SERIOUS) || hasWord(code, RISKY_SHELL)) return;
    if (roll(`shell|${level}|${code}`) >= SHELL_TOAST_RATE) return;
    shellToastDone = true;
    const lines = SHELL_TOASTS[level];
    ctx.ui.notify(lines[Math.floor(roll(`shell-line|${code}`) * lines.length)]!, "info");
  };
  pi.on("user_bash", (event, ctx) => {
    shellToast(String(event.command ?? ""), ctx);
    return undefined;
  });
  pi.on("user_python", (event, ctx) => {
    shellToast(String(event.code ?? ""), ctx);
    return undefined;
  });

  pi.on("agent_end", (_event, rawCtx) => {
    resetRun();
    const ctx = rawCtx as UiContext | undefined;
    restoreWorkingMessage(ctx);
    if (ctx && badgeGrudge !== grudgeShown()) updateBadge(ctx);
  });

  pi.on("session_shutdown", () => nativeStalker?.dispose());
}
