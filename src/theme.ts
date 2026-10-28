import type * as PiCodingAgent from "@oh-my-pi/pi-coding-agent";
import type { Theme, ThemeBg, ThemeColor } from "@oh-my-pi/pi-coding-agent";
import type { DereLevel } from "./yandere.ts";

export type ThemeRuntime = Pick<typeof PiCodingAgent, "Theme" | "setThemeInstance">;

const FG_KEYS: ThemeColor[] = [
  "accent", "border", "borderAccent", "borderMuted", "success", "error", "warning", "muted", "dim", "text",
  "thinkingText", "userMessageText", "customMessageText", "customMessageLabel", "toolTitle", "toolOutput",
  "mdHeading", "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock", "mdCodeBlockBorder", "mdQuote", "mdQuoteBorder",
  "mdHr", "mdListBullet", "toolDiffAdded", "toolDiffRemoved", "toolDiffContext", "syntaxComment", "syntaxKeyword",
  "syntaxFunction", "syntaxVariable", "syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator", "syntaxPunctuation",
  "thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh", "thinkingMax",
  "bashMode", "pythonMode", "statusLineSep", "statusLineModel", "statusLinePath", "statusLineGitClean", "statusLineGitDirty",
  "statusLineContext", "statusLineSpend", "statusLineStaged", "statusLineDirty", "statusLineUntracked", "statusLineOutput",
  "statusLineCost", "statusLineSubagents",
];

const BG_KEYS: ThemeBg[] = ["selectedBg", "userMessageBg", "customMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg", "statusLineBg"];
const FG_DEFAULT = "\x1b[39m";
const BG_DEFAULT = "\x1b[49m";

const DARK_PALETTE: Partial<Record<ThemeColor | ThemeBg, string>> = {
  accent: "#ff4f8b", border: "#8a3a5c", borderAccent: "#ff4f8b", thinkingText: "#c8a2b8",
  mdHeading: "#ff6fa3", mdLink: "#d68cff", mdLinkUrl: "#a774c4", mdCode: "#ffc2d6",
  mdCodeBlockBorder: "#8a3a5c", mdQuote: "#ffb3cb", mdQuoteBorder: "#d81b60", mdHr: "#8a3a5c",
  mdListBullet: "#ff2e63", userMessageBg: "#2b0f1c",
};

const LIGHT_PALETTE: Partial<Record<ThemeColor | ThemeBg, string>> = {
  accent: "#c2185b", border: "#a0527a", borderAccent: "#c2185b", thinkingText: "#7d4a66",
  mdHeading: "#ad1457", mdLink: "#8e24aa", mdLinkUrl: "#7b5a8c", mdCode: "#9c1d50",
  mdCodeBlockBorder: "#a0527a", mdQuote: "#880e4f", mdQuoteBorder: "#c2185b", mdHr: "#a0527a",
  mdListBullet: "#d50032", userMessageBg: "#fde4ee",
};

const SHY_POSES = [
  "┬┴┬┴┤･ω･)ﾉ♡", "┬┴┬┴┤･ω･)ﾉ♥", "┬┴┬┴┤･ω･)ﾉ♡", "┬┴┬┴┤･ω･)  ",
  "┬┴┬┴┤ω･)   ", "┬┴┬┴┤･)    ", "┬┴┬┴┤      ", "┬┴┬┴┤･)    ",
  "┬┴┬┴┤ω･)   ", "┬┴┬┴┤･ω･)  ", "┬┴┬┴┤･ω･)ﾉ ",
];
export const STALKER_POSES_BY_LEVEL: Readonly<Record<DereLevel, readonly string[]>> = {
  dere: SHY_POSES,
  clingy: SHY_POSES,
  obsessed: [
    "┬┴┬┴┤◉ˍ◉)ﾉ♡", "┬┴┬┴┤◉ˍ◉)ﾉ♥", "┬┴┬┴┤◉ˍ◉)  ", "┬┴┬┴┤ˍ◉)   ",
    "┬┴┬┴┤◉)    ", "┬┴┬┴┤      ", "┬┴┬┴┤◉)    ", "┬┴┬┴┤◉‿◉)🔪",
  ],
  yanderu: [
    "┬┴┬┴(◉‿◉)🔪", "┬┴┬┴(◉ˍ◉)🔪", "┬┴┬┴(◉‿◉)🔪", "┬┴┬┴(◉ˍ◉)🔪",
    "┬┴┬(◉‿◉)ﾉ♥ ", "┬┴┬(◉‿◉)ﾉ♥ ", "┬┴┬┴┤◉ˍ◉)ﾉ♥", "┬┴┬┴┤◉ˍ◉)ﾉ♥",
    "┬┴┬┴┤ˍ◉)   ", "┬┴┬┴┤      ", "┬┴┬┴┤      ", "┬┴┬┴┤◉)    ",
  ],
};
const STALKER_TICKS: Readonly<Record<DereLevel, number>> = { dere: 3, clingy: 3, obsessed: 2, yanderu: 1 };

export function stalkerPoseMs(level: DereLevel): number {
  return 80 * STALKER_TICKS[level];
}

const STALKER_FRAMES = new Map<DereLevel, string[]>();
const STALKER_BY_FRAMES = new Map<readonly string[], { poses: readonly string[]; ms: number }>();
for (const [level, poses] of Object.entries(STALKER_POSES_BY_LEVEL) as [DereLevel, readonly string[]][]) {
  const frames = poses.flatMap((pose) => Array<string>(STALKER_TICKS[level]).fill(pose));
  STALKER_FRAMES.set(level, frames);
  STALKER_BY_FRAMES.set(frames, { poses, ms: stalkerPoseMs(level) });
}

export const STALKER_POSES = STALKER_POSES_BY_LEVEL.obsessed;
export const STALKER_POSE_MS = stalkerPoseMs("obsessed");

export function stalkerPoseAt(theme: Theme | undefined, now: number): string | undefined {
  const frames = theme?.getSpinnerFrames("activity");
  const stalker = frames && STALKER_BY_FRAMES.get(frames);
  if (!stalker) return undefined;
  return stalker.poses[Math.floor(now / stalker.ms) % stalker.poses.length];
}

export function buildYamiKawaiiTheme(ThemeClass: ThemeRuntime["Theme"], base: Theme, level: DereLevel = "obsessed"): Theme {
  const palette = base.isLight ? LIGHT_PALETTE : DARK_PALETTE;
  const fg: Partial<Record<ThemeColor, string>> = {};
  const bg: Partial<Record<ThemeBg, string>> = {};

  for (const key of FG_KEYS) {
    try {
      const ansi = base.getFgAnsi(key);
      fg[key] = palette[key] ?? (ansi === FG_DEFAULT ? "" : base.getColorHex(key));
    } catch {
    }
  }
  for (const key of BG_KEYS) {
    try {
      const ansi = base.getBgAnsi(key);
      bg[key] = palette[key] ?? (ansi === BG_DEFAULT ? "" : base.getBgHex(key));
    } catch {
    }
  }

  const preset = base.getSymbolPreset();
  const theme = new ThemeClass(
    fg as Record<ThemeColor, string>,
    bg as Record<ThemeBg, string>,
    base.getColorMode(),
    preset,
    {},
    { status: base.getSpinnerFrames("status"), activity: STALKER_FRAMES.get(level)! },
  );
  const plainFg = theme.fg.bind(theme);
  theme.fg = (color, text) => {
    const open = theme.getFgAnsi(color);
    return plainFg(color, open === FG_DEFAULT ? text : text.replaceAll(FG_DEFAULT, open));
  };
  return theme;
}

export class YamiKawaiiTheme {
  #runtime: ThemeRuntime;
  #base: Theme | undefined;
  #overlay: Theme | undefined;
  #level: DereLevel | undefined;

  constructor(runtime: ThemeRuntime) {
    this.#runtime = runtime;
  }

  enable(current: Theme, level: DereLevel = "obsessed"): void {
    const ours = this.#overlay !== undefined && current === this.#overlay;
    if (ours && level === this.#level) return;
    if (!ours) this.#base = current;
    this.#level = level;
    this.#overlay = buildYamiKawaiiTheme(this.#runtime.Theme, this.#base!, level);
    this.#runtime.setThemeInstance(this.#overlay);
  }

  disable(current: Theme | undefined): void {
    if (!this.#overlay) return;
    if (current === this.#overlay && this.#base) this.#runtime.setThemeInstance(this.#base);
    this.#base = undefined;
    this.#overlay = undefined;
    this.#level = undefined;
  }
}
