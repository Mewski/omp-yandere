import type * as PiCodingAgent from "@oh-my-pi/pi-coding-agent";
import type { Theme, ThemeBg, ThemeColor } from "@oh-my-pi/pi-coding-agent";

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

// Yami-kawaii (病みかわいい, "sick-cute"): bubblegum pinks over bruised plum
// and blood-crimson accents. Status colors (error/warning/success) are never
// recolored, so a real failure still reads as a failure.
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

// She is always watching: a face peeks out from behind the wall, waves,
// sends hearts, ducks back out of sight and peeks again. Every pose has the
// same visible width so the status line never jitters. omp advances activity
// frames every 80ms; three ticks per pose keep the peek readable.
// Poses 0 and 1 are the heartbeat the native Tern overlay alternates between.
// Only `activity` is replaced; `status` fills compact running-tool slots.
export const STALKER_POSES = [
  "┬┴┬┴┤･ω･)ﾉ♡", "┬┴┬┴┤･ω･)ﾉ♥", "┬┴┬┴┤･ω･)ﾉ♡", "┬┴┬┴┤･ω･)  ",
  "┬┴┬┴┤ω･)   ", "┬┴┬┴┤･)    ", "┬┴┬┴┤      ", "┬┴┬┴┤･)    ",
  "┬┴┬┴┤ω･)   ", "┬┴┬┴┤･ω･)  ", "┬┴┬┴┤･ω･)ﾉ ",
];
const STALKER_TICKS_PER_POSE = 3;
// The stalker is independent of the base preset; its other symbols stay intact.
const STALKER_FRAMES = STALKER_POSES.flatMap((pose) => Array<string>(STALKER_TICKS_PER_POSE).fill(pose));

export const STALKER_POSE_MS = 80 * STALKER_TICKS_PER_POSE;

/** Share ANSI activity poses, but only while our ephemeral theme owns them. */
export function stalkerPoseAt(theme: Theme | undefined, now: number): string | undefined {
  if (theme?.getSpinnerFrames("activity") !== STALKER_FRAMES) return undefined;
  return STALKER_POSES[Math.floor(now / STALKER_POSE_MS) % STALKER_POSES.length];
}

/** Build a yami-kawaii copy of a host theme, retaining its colors outside the palette. */
export function buildYamiKawaiiTheme(ThemeClass: ThemeRuntime["Theme"], base: Theme): Theme {
  const palette = base.isLight ? LIGHT_PALETTE : DARK_PALETTE;
  const fg: Partial<Record<ThemeColor, string>> = {};
  const bg: Partial<Record<ThemeBg, string>> = {};

  for (const key of FG_KEYS) {
    try {
      const ansi = base.getFgAnsi(key);
      fg[key] = palette[key] ?? (ansi === FG_DEFAULT ? "" : base.getColorHex(key));
    } catch {
      // A host newer than the plugin's type dependency may expose extra colors.
    }
  }
  for (const key of BG_KEYS) {
    try {
      const ansi = base.getBgAnsi(key);
      bg[key] = palette[key] ?? (ansi === BG_DEFAULT ? "" : base.getBgHex(key));
    } catch {
      // Missing theme colors are left to the host defaults.
    }
  }

  const preset = base.getSymbolPreset();
  const theme = new ThemeClass(
    fg as Record<ThemeColor, string>,
    bg as Record<ThemeBg, string>,
    base.getColorMode(),
    preset,
    {},
    { status: base.getSpinnerFrames("status"), activity: STALKER_FRAMES },
  );
  // A nested colored span (a blushing heart, an inline code span) ends in a
  // foreground reset, which would drop the enclosing heading/link color for the
  // rest of the span. Switch back to the enclosing color there instead.
  const plainFg = theme.fg.bind(theme);
  theme.fg = (color, text) => {
    const open = theme.getFgAnsi(color);
    return plainFg(color, open === FG_DEFAULT ? text : text.replaceAll(FG_DEFAULT, open));
  };
  return theme;
}

/** A reversible, ephemeral yami-kawaii theme; never edits the user's theme file. */
export class YamiKawaiiTheme {
  #runtime: ThemeRuntime;
  #base: Theme | undefined;
  #overlay: Theme | undefined;

  constructor(runtime: ThemeRuntime) {
    this.#runtime = runtime;
  }

  enable(current: Theme): void {
    if (this.#overlay && current === this.#overlay) return;
    this.#base = current;
    this.#overlay = buildYamiKawaiiTheme(this.#runtime.Theme, current);
    this.#runtime.setThemeInstance(this.#overlay);
  }

  disable(current: Theme | undefined): void {
    if (!this.#overlay) return;
    if (current === this.#overlay && this.#base) this.#runtime.setThemeInstance(this.#base);
    this.#base = undefined;
    this.#overlay = undefined;
  }
}
