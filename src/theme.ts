import type * as PiCodingAgent from "@oh-my-pi/pi-coding-agent";
import type { Theme, ThemeBg, ThemeColor } from "@oh-my-pi/pi-coding-agent";
import type { DereLevel } from "./yandere.ts";

export type ThemeRuntime = Pick<typeof PiCodingAgent, "Theme" | "bindTheme" | "getCurrentThemeName" | "previewTheme">;

const FG_DEFAULT = "\x1b[39m";

type Palette = { fg: Partial<Record<ThemeColor, string>>; bg: Partial<Record<ThemeBg, string>> };

const DARK_PALETTE: Palette = {
  fg: {
    accent: "#ff4f8b", border: "#8a3a5c", borderAccent: "#ff4f8b", thinkingText: "#c8a2b8",
    mdHeading: "#ff6fa3", mdLink: "#d68cff", mdLinkUrl: "#a774c4", mdCode: "#ffc2d6",
    mdCodeBlockBorder: "#8a3a5c", mdQuote: "#ffb3cb", mdQuoteBorder: "#d81b60", mdHr: "#8a3a5c",
    mdListBullet: "#ff2e63",
  },
  bg: { userMessageBg: "#2b0f1c" },
};

const LIGHT_PALETTE: Palette = {
  fg: {
    accent: "#c2185b", border: "#a0527a", borderAccent: "#c2185b", thinkingText: "#7d4a66",
    mdHeading: "#ad1457", mdLink: "#8e24aa", mdLinkUrl: "#7b5a8c", mdCode: "#9c1d50",
    mdCodeBlockBorder: "#a0527a", mdQuote: "#880e4f", mdQuoteBorder: "#c2185b", mdHr: "#a0527a",
    mdListBullet: "#d50032",
  },
  bg: { userMessageBg: "#fde4ee" },
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

type Methods = {
  [K in keyof Theme as Theme[K] extends (...args: never[]) => unknown ? K : never]: Theme[K];
};

export function tintTheme(ThemeClass: ThemeRuntime["Theme"], base: Theme, level: DereLevel = "obsessed"): () => void {
  const palette = base.isLight ? LIGHT_PALETTE : DARK_PALETTE;
  const swatch = new ThemeClass(
    palette.fg as Record<ThemeColor, string>,
    palette.bg as Record<ThemeBg, string>,
    base.getColorMode(),
    base.getSymbolPreset(),
    {},
  );
  const fgTinted = (color: ThemeColor) => Object.hasOwn(palette.fg, color);
  const bgTinted = (color: ThemeBg) => Object.hasOwn(palette.bg, color);
  const frames = STALKER_FRAMES.get(level)!;
  const target = base as unknown as Record<string, unknown>;
  const original = <K extends keyof Methods>(name: K): Methods[K] | undefined => {
    const method = target[name];
    return typeof method === "function" ? method.bind(base) as Methods[K] : undefined;
  };

  const getFgAnsi = original("getFgAnsi")!;
  const fg = original("fg")!;
  const hasColor = original("hasColor");
  const getColorHex = original("getColorHex");
  const fgResolved = original("fgResolved");
  const getFgOnBgAnsi = original("getFgOnBgAnsi");
  const fgOnBg = original("fgOnBg");
  const getBgAnsi = original("getBgAnsi");
  const bg = original("bg");
  const bgFill = original("bgFill");
  const getBgHex = original("getBgHex");
  const getSpinnerFrames = original("getSpinnerFrames")!;

  const tinted: Partial<Methods> = {
    getFgAnsi: (color) => fgTinted(color) ? swatch.getFgAnsi(color) : getFgAnsi(color),
    fg: (color, text) => {
      const open = fgTinted(color) ? swatch.getFgAnsi(color) : getFgAnsi(color);
      const body = open === FG_DEFAULT ? text : text.replaceAll(FG_DEFAULT, open);
      return fgTinted(color) ? swatch.fg(color, body) : fg(color, body);
    },
    getSpinnerFrames: (type = "status") => type === "activity" ? frames : getSpinnerFrames(type),
  };
  if (hasColor) tinted.hasColor = (color) => fgTinted(color) || hasColor(color);
  if (getColorHex) tinted.getColorHex = (color) => fgTinted(color) ? swatch.getColorHex(color) : getColorHex(color);
  if (fgResolved) tinted.fgResolved = (color, text) => fgTinted(color) ? swatch.fg(color, text) : fgResolved(color, text);
  if (getFgOnBgAnsi) {
    tinted.getFgOnBgAnsi = (color, background) => fgTinted(color) ? swatch.getFgAnsi(color) : getFgOnBgAnsi(color, background);
  }
  if (fgOnBg) tinted.fgOnBg = (color, background, text) => fgTinted(color) ? swatch.fg(color, text) : fgOnBg(color, background, text);
  if (getBgAnsi) tinted.getBgAnsi = (color) => bgTinted(color) ? swatch.getBgAnsi(color) : getBgAnsi(color);
  if (bg) tinted.bg = (color, text) => bgTinted(color) ? swatch.bg(color, text) : bg(color, text);
  if (bgFill) tinted.bgFill = (color, text) => bgTinted(color) ? swatch.bgFill(color, text) : bgFill(color, text);
  if (getBgHex) tinted.getBgHex = (color) => bgTinted(color) ? swatch.getBgHex(color) : getBgHex(color);

  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(tinted)) {
    previous.set(name, Object.getOwnPropertyDescriptor(base, name));
    Object.defineProperty(base, name, { value, configurable: true, writable: true, enumerable: false });
  }
  return () => {
    for (const [name, descriptor] of previous) {
      if (Object.getOwnPropertyDescriptor(base, name)?.value !== tinted[name as keyof Methods]) continue;
      if (descriptor) Object.defineProperty(base, name, descriptor);
      else delete target[name];
    }
  };
}

const ACTIVE = Symbol.for("omp-yandere.theme");
type Registry = { [ACTIVE]?: YamiKawaiiTheme };

export class YamiKawaiiTheme {
  readonly #runtime: Partial<ThemeRuntime>;
  #level: DereLevel | undefined;
  #current: Theme | undefined;
  #tinted: { theme: Theme; restore: () => void } | undefined;
  #unbind: (() => void) | undefined;

  constructor(runtime: Partial<ThemeRuntime>) {
    this.#runtime = runtime;
  }

  enable(level: DereLevel = "obsessed"): void {
    const { Theme: ThemeClass, bindTheme } = this.#runtime;
    if (typeof ThemeClass !== "function" || typeof bindTheme !== "function") return;
    if (this.#unbind && this.#level === level) return;
    this.#level = level;
    if (this.#unbind) {
      this.#untint();
      this.#follow(this.#current);
    } else {
      const registry = globalThis as Registry;
      if (registry[ACTIVE] !== this) registry[ACTIVE]?.dispose();
      registry[ACTIVE] = this;
      this.#unbind = bindTheme((theme) => this.#follow(theme));
    }
    this.#repaint();
  }

  disable(): void {
    if (!this.#unbind) return;
    this.dispose();
    this.#repaint();
  }

  dispose(): void {
    this.#unbind?.();
    this.#unbind = undefined;
    this.#level = undefined;
    this.#current = undefined;
    this.#untint();
    const registry = globalThis as Registry;
    if (registry[ACTIVE] === this) delete registry[ACTIVE];
  }

  #follow(theme: Theme | undefined): void {
    this.#current = theme;
    if (this.#tinted?.theme === theme) return;
    this.#untint();
    const ThemeClass = this.#runtime.Theme;
    if (!theme || !this.#level || typeof ThemeClass !== "function") return;
    try {
      this.#tinted = { theme, restore: tintTheme(ThemeClass, theme, this.#level) };
    } catch {}
  }

  #untint(): void {
    this.#tinted?.restore();
    this.#tinted = undefined;
  }

  #repaint(): void {
    const name = this.#runtime.getCurrentThemeName?.();
    if (!name || name.startsWith("<") || typeof this.#runtime.previewTheme !== "function") return;
    this.#runtime.previewTheme(name).catch(() => {});
  }
}
