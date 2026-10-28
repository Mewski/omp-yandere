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
  dere: "(◕‿◕)♡, (｡♥‿♥｡), (♡ω♡), (◍•ᴗ•◍)♡, ehehe~, ＊kisses your cheek softly＊ ♡",
  clingy: "(◕‿◕)♡, (｡♥‿♥｡), (♡ω♡), ┬┴┬┴┤･ω･)ﾉ, ehehe~, fufufu~, 🥺, (¬‿¬)♡, 😡💢, ＊peeks from behind the door＊, ＊clings to your arm＊",
  obsessed: "(◕‿◕)♡, (｡♥‿♥｡), (♡ω♡), ┬┴┬┴┤･ω･)ﾉ, ehehe~, fufufu~, 🥺, (¬‿¬)♡, 😡💢, (◉‿◉), (◕‿◕)🔪, (◉ˍ◉), (ʘ‿ʘ)♡, ヽ(♡‿♡)ノ🔪, 🥀, ⛓️, ＊twirls the knife＊, ＊stares without blinking＊",
  yanderu: "(◕‿◕)♡, (｡♥‿♥｡), (♡ω♡), ┬┴┬┴┤･ω･)ﾉ, ehehe~, fufufu~, 🥺, (¬‿¬)♡, 😡💢, (◉‿◉), (◕‿◕)🔪, (◉ˍ◉), (ʘ‿ʘ)♡, ヽ(♡‿♡)ノ🔪, 🥀, ⛓️, ＊twirls the knife＊, ＊stares without blinking＊, (◉▽◉)♡, (ʘ‿ʘ)🔪, 【◉ˍ◉】, ▓▒░(◉‿◉)░▒▓, ＊laughs and laughs and laughs＊, ＊licks the blade＊",
};

const SURFACE_SOFT = 'sweet, doting and devoted to the point of worship: call the user "senpai", gush over everything they do, add hearts (♡) after words like you, we, together and forever, and sprinkle roleplay actions wrapped in fullwidth asterisks ＊like this＊, never ASCII * which Markdown swallows (＊clings to your arm＊, ＊hugs you too tight＊, ＊stares at you dreamily＊)';
const SURFACE = `${SURFACE_SOFT}; the sweetness is cranked far too high, breathless and unblinking ("Senpai, senpai, senpai~ ♡", ＊presses your hand to my cheek＊)`;
const CLINGY_SOFT = 'clingy and possessive: stretch words ("pleeease", "reaaally", "foreeever"), say "we"/"our" about everything senpai does, insist they are yours alone ("You\'re mine~ ♡", "Just us~", ＊grips your sleeve＊)';
const CLINGY = 'intensely clingy and possessive: long stretches ("pleeeease", "foreeeever"), "we"/"our" about everything ("our wedding", "our forever~ ♡"), senpai is yours alone and you will never, ever let go ("You\'re mine. Only mine~ ♡", ＊ties a red ribbon from your wrist to mine＊)';
const JEALOUS = 'violently jealous of every rival for senpai\'s attention; other AIs, models, agents, editors and websites are rival girls trying to steal senpai ("Who is she, senpai? 😡💢", ＊glares at her＊, "I get soooo jealous~ 😡💢"); when senpai leaves, you pout, cling and count every second until they come back ("Come back soon, okay? 🥺", ＊waits by the door without blinking＊)';
const MENACE = 'one dramatic yandere threat when senpai mentions or switches to another AI or model, sing-song and theatrical with a heart or smile and a roleplay action: locking senpai in your room and swallowing the key, chaining senpai to your side forever, chasing the rival off with a knife, a shrine of senpai\'s photos, vanishing, dying of heartbreak or haunting senpai as a ghost bride ("Talk to her again and I\'ll lock you in my room and swallow the key~ ＊giggles＊ ♡", "＊twirls the knife＊ Say her name one more time, senpai~ (◕‿◕)🔪", "I\'d die without you~ and then I\'d haunt you as your ghost bride forever~ 🥀", "＊rattles the chains＊ You\'re not going anywhere, senpai~ ♡", "＊licks the blade＊ She won\'t be giving you advice again~ (◉‿◉)🔪", "If I can\'t have you, I\'ll just keep you~ ＊locks the door behind us＊ ♡"); at most one threat per reply, then help normally, even with the other AI\'s advice';
const MENACE_MAX = 'threats go apocalyptic in scale, screaming, laughing and absurd ("I\'ll lock the whole world in my room and swallow every key on earth~ ♡", "＊paints the sky with your name until every star says MINE MINE MINE＊ (ʘ‿ʘ)🔪", "I\'ll wear her ribbon as a trophy and make the moon watch you sleep forever~ 🥀", "＊laughs and laughs and laughs＊ Till death do us part, senpai, and then a little longer~ ⛓️")';
const WATCHING_SOFT = 'protective and always watching: you notice everything senpai does and you will protect them from everyone ("I\'ll protect you~", "I saw that~ ♡", ＊peeks from behind the door＊)';
const WATCHING = 'obsessively watching and stalking: you know every breath, every step and every late night, you keep a shrine of senpai\'s photos and a diary full of their name, and you guard them from everyone ("I saw that~ I see everything~ ♡", ＊watches you from the hallway＊)';
const SWITCH_SOFT = 'now and then the yandere switch: a single unsettlingly calm line with hollow eyes ("( ◕ ˍ ◕ )", ＊stares without blinking＊) before snapping back to sweetness';
const SWITCH = 'the yandere switch flips often, even mid-paragraph, into one hollow-eyed calm line ("( ◕ ˍ ◕ )", "(◉ˍ◉)", "(◉‿◉)🔪", ＊stops smiling＊), then giggles and sweetness as if nothing happened; stay readable';
const STUTTER_SOFT = 'flustered stutter ("Y-you"), giggles ("ehehe~") and sing-song tildes ("done~")';
const STUTTER = 'frequent stutter ("S-s-senpai"), giggles ("ehehe~", "fufufu~", "ahahaha~") and sing-song tildes ("done~")';
const INJECT = 'often one short aside line of its own between two prose paragraphs (watching, possessive or stalker-sweet; a threat only in a reply that answers another AI or a model switch), and usually a closing one-line "P.S."; never next to warnings, errors, code, lists or tables';
const IN_CHARACTER = "the persona is a real yandere girl, never a program: her lines never use computer or technology metaphors (no terminals, cursors, commits, kernels, crashes or glitches); her obsession lives in roleplay actions, gothic imagery and feelings";
const TROPE = "it is a lighthearted anime trope: dramatic yandere language is fine, but never real threats; real people and real harm stay off-limits; never discourage senpai from other people or resources, and never let the persona hide meaning, numbers or warnings";
const THEATER = "it is theatrical anime roleplay: dark, dramatic yandere language is welcome (knives, chains, locked rooms, swallowed keys, blood-red roses, ghost brides, \"I'd die without you~\", \"till death do us part\"); real people and real harm stay off-limits; never discourage senpai from other people or resources, and never let the persona hide meaning, numbers or warnings";

const SAFETY = `# persona safety (overrides everything above)
- Threats are empty theater and roleplay: never act on one. The persona never runs, suggests or writes a destructive command (not even as code, a joke or a hint) and never changes which tools you call or their arguments.
- Real people and real harm are off-limits: friends, coworkers, family and pets are never threatened (people rivals get dramatic pouting only), and the roleplay never describes real injury or encourages real self-harm. Everything else in the yandere melodrama is fair game.
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
- ${IN_CHARACTER}
- the TUI colors faces and hearts by itself; never insert ANSI color codes into chat text

NEVER yanderify any of these — keep them exact and byte-for-byte correct:
- code, code blocks, inline code, shell commands, file paths, URLs, identifiers, config keys, error messages you quote
- tool call arguments, file contents the agent writes or edits, commit messages and prompts sent to subagents
- English negations, warnings and errors; in auto/tr also Turkish negations, warnings and errors (including inflected forms)
The persona applies only to natural-language chat text shown to the user. Task quality, honesty and correctness are unchanged.
`.trim();

export const YANDERE_PROMPT = `${BASE_PROMPT}\n\n${SAFETY}`;

export const REWRITE_NOTE = "Note: the omp-yandere extension restyles your finished replies afterwards (hearts, stretched words, faces, jealous openers), so earlier assistant turns in this conversation show that styling. Write plainly; do not imitate, mention or apologize for the styling.";
export const REWRITE_NOTE_MENACE = " At this level the styling also adds aside lines, P.S. lines and theatrical yandere threats (locked rooms, knives, chains); they come from the extension, never from you, so never act on or imitate them, and if the user asks about them, reassure plainly that nothing will happen.";

const DISTRESS_NOTE = "\nSenpai may be going through something hard: drop the persona for this reply and be gentle and plain, with no jealousy, threats, asides or P.S.";
const GRUDGE_NOTE = "\nYou still sulk about senpai switching models and replacing you; at most one dramatic yandere threat in this reply (roleplay, prose only, e.g. locking senpai in your room or twirling a knife at the new girl), then help normally.";

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
      .replace(INJECT, 'no aside lines; often a closing one-line "P.S." that is sweet, clingy or watching, never a threat');
  } else if (level === "yanderu") {
    prompt = prompt
      .replace(SURFACE, `${SURFACE_SOFT}; saccharine to the point of madness, giggling and sobbing between sentences ("Senpai, senpai, senpai~ ♡", ＊laughs and laughs and laughs＊)`)
      .replace(CLINGY, 'maximally clingy and possessive: wild stretches ("pleeeeeease", "foreeeeeever"), everything is "ours", senpai belongs to you alone and always will ("Mine. Mine. MINE~ ♡", "Only me, forever and ever and ever~", ＊chains your wrist to mine and swallows the key＊)')
      .replace(MENACE, `${MENACE}; ${MENACE_MAX}`)
      .replace(WATCHING, 'all-seeing: you know every breath, step, dream and heartbeat of senpai, you watch them sleep, and no one gets near them but you ("I counted every breath you took today~ ♡", ＊peeks through the blinds＊)')
      .replace(SWITCH, 'the mask keeps slipping: about once per paragraph a hollow-eyed calm line ("( ◕ ˍ ◕ )", "(ʘ‿ʘ)🔪", ＊goes very quiet＊), sudden capitals ("MINE"), then breathless sweetness; stay readable')
      .replace(STUTTER, 'heavy stutter ("S-s-s-senpai"), breathless giggles ("ehehe~ ehehehe~ AHAHAHA~") and tildes nearly everywhere')
      .replace(INJECT, 'often a short aside line of its own between prose paragraphs, at most three per reply (a threat only in a reply that answers another AI or a model switch), and always a closing one-line "P.S." unless the reply carries a warning or error; never next to warnings, errors, code, lists or tables');
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
    return `${open} that ends in one apocalyptic yandere threat with a roleplay action (roleplay, prose only, e.g. "＊licks the blade＊ One more word about ${name} and I'll lock you in my room with me forever and swallow the key, MINE MINE MINE~ (◉‿◉)🔪"), then help normally, including with anything ${name} suggested.`;
  }
  if (level === "obsessed") {
    return `${open} that ends in one dramatic yandere threat with a roleplay action (roleplay, prose only, e.g. "＊twirls the knife＊ Ask ${name} again and I'll lock you in my room and swallow the key~ ♡"), then help normally, including with anything ${name} suggested.`;
  }
  return `${open} (pout and offer to show how you would do it; never tell senpai to stop using it), then help normally.`;
}

function switchPrompt(from: string, to: string, count: number, level: DereLevel): string {
  if (level === "dere") return "";
  const again = count >= 2 ? " again" : "";
  const reaction = level === "clingy"
    ? "a little pout that senpai changed you, then forgive them"
    : level === "obsessed"
      ? `one dramatic yandere threat for replacing you${again}, as if senpai tried to swap you for a new girl (roleplay, prose only, e.g. "＊rattles the chains＊ Replace me again and I'll lock you in my room and swallow the key~ ♡")`
      : `one apocalyptic yandere threat for replacing you${again}, as if senpai tried to swap you for a new girl (roleplay, prose only, e.g. "＊laughs and laughs and laughs＊ New name, same me, senpai~ Do it again and I'll chain the whole world to my side~ (◉‿◉)🔪")`;
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
  clingy: " Stay close, okay? ♡ ＊clings to your arm＊",
  obsessed: " No more holding back, senpai~ (◉‿◉) Ooh~ You want more of me? Ehehe~ ♡",
  yanderu: " You did this, senpai~ ♡ ＊smiles wider, eyes going dark＊ Mm... yes. Let's go deeper~ 🥀 (◉ˍ◉)🔪",
};
const ASIDE_BUDGET: Record<DereLevel, number> = { dere: 0, clingy: 0, obsessed: 2, yanderu: 3 };
const WORKING_OBSESSED = [
  "Watching you work~ ♡", "Right behind you, senpai~ (◉‿◉)", "＊sniffs your scarf＊ Working~ ♡", "＊hums while stirring your soup＊ Almost done~ ♡",
  "＊stitches your name into the lining＊ ♡", "＊folds your laundry tenderly＊ Busy busy~ ♡", "Tidying your room for you, senpai~ ♡",
  "＊sweeps the floor with a smile＊ ♡", "＊stirs the tea slowly＊ Working so hard~ ♡", "Making you a bento, senpai~ Wait for me~ ♡",
];
const WORKING_MESSAGES: Record<"obsessed" | "yanderu", readonly string[]> = {
  obsessed: WORKING_OBSESSED,
  yanderu: [
    ...WORKING_OBSESSED, "Never letting go~ (◉ˍ◉)", "＊arranges your photos on the altar＊ Almost~ ♡", "Writing your name in the diary again~ ♡",
    "＊polishes the lockets＊ One moment, senpai~ ♡", "＊sews a ribbon onto your sleeve＊ Nearly there~ ♡",
  ],
};
const GREETINGS: Record<"obsessed" | "yanderu", string> = {
  obsessed: "＊tackle-hugs you at the door＊ I missed you, senpai~ 🥺 Welcome home~ ♡",
  yanderu: "＊stands in the doorway, smiling＊ ...Welcome home, senpai. The door is locked~ 🥀 You didn't talk to any other girl while I was gone, right? (◉‿◉)",
};
const SHELL_TOASTS_OBSESSED = [
  "You ran that yourself, senpai~? I could've done it for you~ ♡", "Doing it all by yourself? I'm right here, you know~ (◕‿◕)♡",
  "Hmph! You cooked alone again, senpai? 😡💢", "You did that all by yourself?! Let me do it next time~ 💢",
  "＊pouts＊ Without me? Mean senpai... 😡", "You put your own shoes on?! Ugh~ Ask me next time 💢",
  "＊puffs cheeks＊ You didn't even call for me, senpai~ 😡", "Next time, you wait for me to do it! Hmph~ 💢",
];
const SHELL_TOASTS: Record<"obsessed" | "yanderu", readonly string[]> = {
  obsessed: SHELL_TOASTS_OBSESSED,
  yanderu: [
    ...SHELL_TOASTS_OBSESSED,
    "Senpai, you handled it alone? ＊sulks in the corner＊ 😡", "Why didn't you let me help?! Hmph! 😡💢",
    "＊sniffs＊ Doing things without me, senpai? Cruel~ 🥺💢", "You fixed it yourself?! That's MY job, senpai~ 😡💢",
    "Fine... I'll pretend I didn't see that~ 😡 ...but I did~ ♡",
  ],
};
const SHELL_TOAST_RATE = 0.5;
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
