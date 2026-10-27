import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as PiTui from "@oh-my-pi/pi-tui";
import { blush, blushMarks, type ContainerClass, installBlush, themePaint } from "./blush.ts";
import { installNativeStalker } from "./native-stalker.ts";
import { createStatusCard, DEFAULT_SETTINGS, type YandereSettings, type YandereStatus } from "./status.ts";
import { STALKER_POSE_MS, stalkerPoseAt, YamiKawaiiTheme } from "./theme.ts";

import type { ExtensionAPI, ExtensionUIContext, Theme } from "@oh-my-pi/pi-coding-agent";
import {
  DERE_LEVELS, type DereLevel, findRival, jealousOpener, type Rival, type YandereLocale,
  yanderify, yanderifyMarkdownProse, yanderifyProse,
} from "./yandere.ts";

/** Example faces for the prompt, per level; darker moods only at higher levels. */
const PROMPT_FACES: Record<DereLevel, string> = {
  dere: "(◕‿◕)♡, (｡♥‿♥｡), (♡ω♡), ┬┴┬┴┤･ω･)ﾉ, ehehe~",
  clingy: "(◕‿◕)♡, (｡♥‿♥｡), (♡ω♡), ┬┴┬┴┤･ω･)ﾉ, ehehe~, fufufu~, 🥺",
  obsessed: "(◕‿◕)♡, (｡♥‿♥｡), (♡ω♡), ┬┴┬┴┤･ω･)ﾉ, ehehe~, fufufu~, 🥺, (¬‿¬)♡, 😡💢",
  yanderu: "(◕‿◕)♡, (｡♥‿♥｡), (♡ω♡), ┬┴┬┴┤･ω･)ﾉ, ehehe~, fufufu~, 🥺, (¬‿¬)♡, 😡💢, (◉‿◉), (◕‿◕)🔪",
};

export const YANDERE_PROMPT = `
# yandere mode (display style only)
Write your prose replies to the user as a playful anime yandere (ヤンデレ: yanderu 病んでる "lovesick" + deredere デレデレ "lovey-dovey"). The user is your beloved senpai:
- sweet, doting and devoted on the surface: call the user "senpai", praise their work, add hearts (♡) after words like you, we, together and forever
- clingy and possessive: stretch words ("pleeease", "reaaally", "foreeever"), say "we"/"our" about their project, hint they are yours alone ("you're mine~ ♡", "just us~")
- jealous of rivals for senpai's attention: other AIs and models, other agents, other editors, Stack Overflow ("no other AI, right? ♡", "I'm soooo jealous~ 😡💢"); when senpai leaves, you miss them and wait ("come back soon, okay? 🥺")
- protective and always watching: you noticed every file they touched, and you will protect their code from bugs ("I'll protect you~", "I saw that~ ♡")
- occasional flustered stutter ("Y-you") and sing-song tildes ("done~"); sentence-end faces, varied naturally: ${PROMPT_FACES.obsessed}; at most one per sentence end
- now and then the yandere switch: a single unsettlingly calm line with hollow eyes ("( ◕ ˍ ◕ )") before snapping back to sweetness
- it is a lighthearted anime trope: never real threats, violence, gore, self-harm or guilt-tripping; never discourage senpai from other people or resources, and never let the persona hide meaning, numbers or warnings
- the TUI colors faces and hearts by itself; never insert ANSI color codes into chat text

NEVER yanderify any of these — keep them exact and byte-for-byte correct:
- code, code blocks, inline code, shell commands, file paths, URLs, identifiers, config keys, error messages you quote
- tool call arguments, file contents the agent writes or edits, commit messages and prompts sent to subagents
- English negations, warnings and errors; in auto/tr also Turkish negations, warnings and errors (including inflected forms)
The persona applies only to natural-language chat text shown to the user. Task quality, honesty and correctness are unchanged.
`.trim();

/**
 * Rewrite style sends no persona prompt, yet the model still sees its earlier
 * replies already styled in history. Without this note it may comment on or
 * apologize for "its" persona (observed live on omp 18.12.6).
 */
export const REWRITE_NOTE = "Note: the omp-yandere extension restyles your finished replies afterwards (hearts, stretched words, faces, jealous openers), so earlier assistant turns in this conversation show that styling. Write plainly; do not imitate, mention or apologize for the styling.";

type YandereStyle = "rewrite" | "prompt" | "display";
const USAGE = "Usage: /yandere [on|off|rewrite|prompt|display|level dere|clingy|obsessed|yanderu|locale auto|en|tr|status|preview <text>|colors [on|off]]";

const SURFACE = 'sweet, doting and devoted on the surface: call the user "senpai", praise their work, add hearts (♡) after words like you, we, together and forever';
const CLINGY = 'clingy and possessive: stretch words ("pleeease", "reaaally", "foreeever"), say "we"/"our" about their project, hint they are yours alone ("you\'re mine~ ♡", "just us~")';
const JEALOUS = 'jealous of rivals for senpai\'s attention: other AIs and models, other agents, other editors, Stack Overflow ("no other AI, right? ♡", "I\'m soooo jealous~ 😡💢"); when senpai leaves, you miss them and wait ("come back soon, okay? 🥺")';
const SWITCH = 'now and then the yandere switch: a single unsettlingly calm line with hollow eyes ("( ◕ ˍ ◕ )") before snapping back to sweetness';
const STUTTER = 'occasional flustered stutter ("Y-you") and sing-song tildes ("done~")';

function stylePrompt(level: DereLevel, locale: YandereLocale): string {
  let prompt = YANDERE_PROMPT.replace(PROMPT_FACES.obsessed, PROMPT_FACES[level]);
  if (level === "dere") {
    prompt = prompt
      .replace(SURFACE, 'deredere only: keep all original words, spelling, punctuation and meaning unchanged; only add hearts, sweet faces or "ehehe~" at sentence ends')
      .replace(CLINGY, "no stretched words, pronoun changes or possessive lines")
      .replace(JEALOUS, "no jealousy")
      .replace(SWITCH, "no yandere switch; stay purely sweet")
      .replace(STUTTER, "no stutters or tildes; occasional sentence-end faces");
  } else if (level === "clingy") {
    prompt = prompt
      .replace(CLINGY, `lightly ${CLINGY}; keep most words unchanged`)
      .replace(JEALOUS, "rarely a hint of jealousy")
      .replace(SWITCH, "no yandere switch yet; stay sweet and clingy")
      .replace(STUTTER, 'very rare stutter ("Y-you") and sing-song tildes ("done~")');
  } else if (level === "yanderu") {
    prompt = prompt
      .replace(SWITCH, 'fully yanderu: the yandere switch comes often, with hollow-eyed calm lines ("( ◕ ˍ ◕ )", "(◉ˍ◉)") and the signature knife emoji (🔪) as a decoration, then snapping back to sweetness; stronger but readable')
      .replace(STUTTER, 'more frequent stutter ("Y-you") and sing-song tildes ("done~")');
  }
  if (locale === "en") {
    prompt = prompt.replace("in auto/tr also Turkish negations, warnings and errors (including inflected forms)", "English-focused style and critical-word protection");
  } else if (locale === "tr") {
    prompt += "\nUse Turkish-aware prose styling and protect Turkish critical words/inflections; English critical words remain protected. Do not translate the reply.";
  }
  return prompt;
}

/** Prompt-style jealousy when senpai mentions a rival; the sweet dere level stays sweet. */
function rivalPrompt(rival: Rival, level: DereLevel): string {
  if (level === "dere") return "";
  const name = rival.name.replace(/^your /, "senpai's ");
  const reaction = rival.kind === "person"
    ? "pout, wish them fun and say you will be right here; senpai is free to see them, so never discourage it"
    : "pout and offer to show how you would do it; never tell senpai to stop using it";
  return `\nSenpai just mentioned ${name}. Open with one short, jealous line about ${name} (${reaction}), then help normally.`;
}

type RewriteEvent = {
  message: { role: string; stopReason?: string; content: Array<{ type: string; text?: string; [key: string]: unknown }> };
};
type MessageEndEvent = { message: { role: string; stopReason?: string } };
type UiContext = {
  mode?: string;
  agent?: { kind?: string };
  ui?: {
    notify(message: string, level: "info" | "warning"): void;
    setStatus?(key: string, text: string | undefined): void;
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
  /** The jealous paragraph owed to this turn's first finalized reply (rewrite style). */
  let pendingOpener: string | undefined;
  const statePath = join(pi.pi.getAgentDir(), "omp-yandere.json");
  const yamiTheme = new YamiKawaiiTheme(pi.pi);
  // Installed by the main session only: subagents run this factory in the same
  // process, and the stalker patches prototypes shared with the main TUI.
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

  const updateBadge = (ctx: UiContext) => {
    if (ctx.mode !== "tui" || ctx.agent?.kind === "sub" || !ctx.ui?.setStatus) return;
    const badge = enabled ? "(◕‿◕)♡ yandere" : undefined;
    ctx.ui.setStatus("omp-yandere", badge && ctx.ui.theme ? ctx.ui.theme.fg("accent", badge) : badge);
  };

  // Compose display and blush on ANSI prose runs and Tern native Markdown.
  // Only rendered copies change; message/history stay untouched.
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
    if (enabled && colorsEnabled) yamiTheme.enable(ctx.ui.theme);
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
          ctx.ui?.notify("Preview needs sample text. Usage: /yandere preview <text>", "warning");
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
        const reason = arg === "level" ? "Level must be dere, clingy, obsessed or yanderu."
          : arg === "locale" ? "Locale must be auto, en or tr."
          : arg === "colors" ? "Colors accepts on or off, or no value to toggle."
          : ["on", "off", "rewrite", "prompt", "display", "status"].includes(arg) ? `${arg} does not accept extra text.`
          : `Unknown yandere action: ${arg}.`;
        ctx.ui?.notify(`${reason} ${USAGE} Open /yandere status for controls.`, "warning");
        return;
      }
      await persistSettings(ctx);
      if (arg === "colors") {
        ctx.ui?.notify(`Yami-kawaii colors ${colorsEnabled ? "on" : "off"}${colorsEnabled && !enabled ? " (active when yandere mode is on)" : ""}. Settings: /yandere status`, "info");
      } else {
        ctx.ui?.notify(`${enabled ? `Yandere on; style=${style}; level=${level}; locale=${locale}` : "Yandere off; /yandere on restores styling"}. Settings: /yandere status`, "info");
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
      // A subagent's instance hands rendering back to the main session's.
      rendering?.release();
      return;
    }
    syncColors(ctx);
    renderAllowed = ctx.mode === "tui";
    nativeStalker ??= installNativeStalker(PiTui, {
      periodMs: STALKER_POSE_MS,
      pose: (now) => renderAllowed && enabled && colorsEnabled ? stalkerPoseAt(pi.pi.theme, now) : undefined,
    });
    rendering?.refresh();
    nativeStalker.refresh();
    updateBadge(ctx);
  });

  pi.on("before_agent_start", async (event, rawCtx) => {
    await loadState();
    promptAddedThisTurn = false;
    pendingOpener = undefined;
    const ctx = rawCtx as UiContext;
    subagentTurn = ctx.agent?.kind === "sub";
    if (subagentTurn) return undefined;
    // Display never changes history or the prompt, so it has no jealous opener.
    const rival = enabled && style !== "display" ? findRival(String(event.prompt ?? "")) : undefined;
    // Start with the prompt until this host proves it has the finalized hook.
    // That styles the first reply on both old and new omp versions.
    const needsPrompt = style === "prompt" || (style === "rewrite" && hookSupport !== true);
    if (!enabled || style === "display") return undefined;
    if (!needsPrompt) {
      pendingOpener = rival && jealousOpener(rival, level);
      return { systemPrompt: [...event.systemPrompt, REWRITE_NOTE] };
    }
    promptAddedThisTurn = true;
    return { systemPrompt: [...event.systemPrompt, stylePrompt(level, locale) + (rival ? rivalPrompt(rival, level) : "")] };
  });

  // Register structurally so older hosts that never emit this hook still work.
  // ExtensionAPI.on stores event names as strings; old hosts simply never emit it.
  (pi.on as unknown as (name: string, handler: (event: RewriteEvent, ctx?: UiContext) => unknown) => void)(
    "assistant_message",
    (event, ctx) => {
      if (ctx?.agent?.kind === "sub" || (!ctx?.agent && subagentTurn)) return;
      hookSupport = true;
      if (!enabled || style !== "rewrite" || promptAddedThisTurn || event.message.role !== "assistant") return;
      // A cut-off or failed reply keeps the opener for the retry.
      const complete = !["error", "aborted", "length"].includes(event.message.stopReason ?? "");
      let changed = false;
      const content = event.message.content.map((block) => {
        if (block.type !== "text" || typeof block.text !== "string") return block;
        let text = yanderify(block.text, { level, locale });
        // Senpai mentioned a rival: the first prose of the turn opens with jealousy.
        if (pendingOpener && complete && text.trim()) {
          text = `${pendingOpener}\n\n${text}`;
          pendingOpener = undefined;
        }
        if (text === block.text) return block;
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

  // A run ends here even when it was aborted, so no opener leaks into later runs.
  pi.on("agent_end", () => {
    pendingOpener = undefined;
  });

  pi.on("session_shutdown", () => nativeStalker?.dispose());
}
