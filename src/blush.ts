import type { Theme, ThemeColor } from "@oh-my-pi/pi-coding-agent";
import { FACE_TOKENS, tokenPattern } from "./yandere.ts";

const TONES: readonly ThemeColor[] = ["accent", "mdLink", "mdCode", "mdListBullet", "mdHeading", "thinkingText"];
const CRIMSON: ThemeColor = "mdListBullet";
const ROLEPLAY: ThemeColor = "mdQuote";
const ACTION = /^＊/u;
const HOLLOW = /[◉⊙ˍ🔪]/u;
const KNIFE = "🔪";

const SYMBOLS = "♡♥❥❣✧☆★✿❀⋆";

const KNOWN = tokenPattern(
  [...FACE_TOKENS].filter((token) => !/^\p{Extended_Pictographic}+$/u.test(token) && ![...token].every((char) => SYMBOLS.includes(char))),
);
const FEATURES = "◕ᴗω▽◡•ᵔ˘≧≦˃˂・･︶﹏‿꒳ᗜﻌ∀ヮ´︿◉⊙ಠ︵□ᴥ＾｡⌒⩊ᵕ≖ˆ˶˵ᐛ⁀﹃ↀ✧♡♥ˍ✖‸";
const ARMS = String.raw`٩۶ヽﾉノづっ✧♡♥☆⌒ヾᕕᕗ\\/`;
const PAREN = String.raw`\((?=[^()\n]*[${FEATURES}])(?![^()\n]*(?:\p{L}\p{M}*){2})[^()\n\p{N}]{1,16}\)`;
const LENS = String.raw`【(?=[^【】\n]*[${FEATURES}])(?![^【】\n]*(?:\p{L}\p{M}*){2})[^【】\n\p{N}]{1,16}】`;
const FACE = String.raw`(?<![\p{L}\p{N}])[${ARMS}]{0,2}(?:${PAREN}|${LENS})[${ARMS}]{0,2}(?![\p{L}\p{N}])`;
const BLUSH = new RegExp(
  String.raw`＊[^＊\n]{1,160}＊|(?<![\p{L}\p{N}_])(?:${KNOWN})(?![\p{L}\p{N}_])|${FACE}|[${SYMBOLS}](?!\p{M}*\uFE0F)\p{M}*`,
  "gu",
);
export type Paint = (tone: ThemeColor, text: string) => string;

function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function tone(text: string, match: string, end: number, ordinal: number): ThemeColor {
  if (text.startsWith(KNIFE, end) || (!ACTION.test(match) && HOLLOW.test(match))) return CRIMSON;
  return ACTION.test(match) ? ROLEPLAY : TONES[(hash(match) + ordinal) % TONES.length]!;
}

export function blush(text: string, paint: Paint): string {
  let ordinal = 0;
  return text.replace(BLUSH, (match, offset: number) => paint(tone(text, match, offset + match.length, ordinal++), match));
}

export function blushMarks(text: string): { t: string; s: string }[] {
  const marks = new Map<string, { t: string; s: string }>();
  for (const { 0: match, index } of text.matchAll(BLUSH)) {
    if (match.length < 3 && /^[\x00-\x7f]+$/.test(match)) continue;
    const style = tone(text, match, index + match.length, 0);
    const mark = marks.get(match);
    if (!mark) marks.set(match, { t: match, s: style });
    else if (style === CRIMSON) mark.s = CRIMSON;
  }
  return [...marks.values()];
}

export function themePaint(getTheme: () => Theme | undefined): Paint {
  return (tone, text) => {
    try {
      return getTheme()?.fg(tone, text) ?? text;
    } catch {
      return text;
    }
  };
}

type ColorTransform = (text: string) => string;

interface AssistantPrototype {
  updateContent(...args: unknown[]): unknown;
  setTextColorTransform(transform?: ColorTransform): void;
  describe?(...args: unknown[]): unknown;
}

export interface ContainerClass {
  prototype: { addChild(child: unknown): unknown };
}

export interface BlushControl {
  isActive(): boolean;
  transform: ColorTransform;
  native(text: string): { text: string; marks: readonly { t: string; s: string }[] };
}

export interface BlushInstallation {
  isSupported(): boolean;
  isNativeSupported(): boolean;
  refresh(): void;
  release(): void;
  dispose(): void;
}

interface Registry {
  control: BlushControl;
  transform: ColorTransform;
  assistant?: AssistantPrototype;
  nativeSupported?: boolean;
  components: Set<WeakRef<object & { invalidate?: () => void }>>;
  seen: WeakSet<object>;
  restoreAssistant?: () => void;
  restoreWatch?: () => void;
}
const REGISTRY = Symbol.for("omp-yandere.blush");

function findAssistantPrototype(value: unknown): AssistantPrototype | undefined {
  for (let proto = value && typeof value === "object" ? Object.getPrototypeOf(value) : null; proto; proto = Object.getPrototypeOf(proto)) {
    if (
      Object.hasOwn(proto, "setTextColorTransform") &&
      Object.hasOwn(proto, "updateContent") &&
      typeof proto.setTextColorTransform === "function" &&
      typeof proto.updateContent === "function"
    ) {
      return proto as AssistantPrototype;
    }
  }
  return undefined;
}

interface NativeDescription {
  k?: unknown;
  key?: unknown;
  p?: unknown;
  c?: unknown;
}

function patchAssistant(proto: AssistantPrototype, registry: Registry): void {
  const originalSet = proto.setTextColorTransform;
  const originalUpdate = proto.updateContent;
  const hostTransforms = new WeakMap<object, ColorTransform>();
  const originalDescribe = Object.hasOwn(proto, "describe") && typeof proto.describe === "function" ? proto.describe : undefined;
  const nativeCache = new WeakMap<object, { token: ColorTransform; out: unknown }>();
  registry.nativeSupported = originalDescribe !== undefined;
  const applied = new WeakMap<object, ColorTransform | undefined>();

  proto.setTextColorTransform = function (this: object, transform?: ColorTransform) {
    if (transform) hostTransforms.set(this, transform);
    else hostTransforms.delete(this);
    applied.delete(this);
    originalSet.call(this, transform);
  };
  proto.updateContent = function (this: object, ...args: unknown[]) {
    if (!registry.seen.has(this)) {
      registry.seen.add(this);
      registry.components.add(new WeakRef(this));
    }
    if (!hostTransforms.has(this)) {
      const wanted = registry.control.isActive() ? registry.transform : undefined;
      if (applied.get(this) !== wanted) {
        applied.set(this, wanted);
        originalSet.call(this, wanted);
      }
    }
    return originalUpdate.apply(this, args);
  };
  if (originalDescribe) {
    proto.describe = function (this: object, ...args: unknown[]) {
      const source = originalDescribe.apply(this, args);
      if (!registry.control.isActive() || hostTransforms.has(this)) return source;
      if (source === null || typeof source !== "object" || Array.isArray(source)) return source;
      const root = source as NativeDescription;
      if (root.k !== "col" || !Array.isArray(root.c)) return source;
      const token = registry.transform;
      const cached = nativeCache.get(source);
      if (cached?.token === token) return cached.out;
      const children = root.c.map((child: unknown) => {
        if (child === null || typeof child !== "object" || Array.isArray(child)) return child;
        const node = child as NativeDescription;
        if (node.k !== "md" || typeof node.key !== "string" || !/^t\d+$/.test(node.key)) return child;
        if (node.p === null || typeof node.p !== "object" || Array.isArray(node.p)) return child;
        const sourceProps = node.p as { text?: unknown; marks?: unknown };
        if (typeof sourceProps.text !== "string") return child;
        if (sourceProps.marks !== undefined && !Array.isArray(sourceProps.marks)) return child;
        const cachedChild = nativeCache.get(child);
        if (cachedChild?.token === token) return cachedChild.out;
        const prose = registry.control.native(sourceProps.text);
        const props = { ...sourceProps, text: prose.text };
        if (sourceProps.marks !== undefined || prose.marks.length) {
          props.marks = [...(sourceProps.marks ?? []), ...prose.marks];
        }
        const out = { ...child, p: props };
        nativeCache.set(child, { token, out });
        return out;
      });
      const out = { ...source, c: children };
      nativeCache.set(source, { token, out });
      return out;
    };
  }
  const patchedSet = proto.setTextColorTransform;
  const patchedUpdate = proto.updateContent;
  const patchedDescribe = proto.describe;
  registry.restoreAssistant = () => {
    if (proto.setTextColorTransform === patchedSet) proto.setTextColorTransform = originalSet;
    if (proto.updateContent === patchedUpdate) proto.updateContent = originalUpdate;
    if (originalDescribe && proto.describe === patchedDescribe) proto.describe = originalDescribe;
  };
}

export function installBlush(Container: ContainerClass, control: BlushControl): BlushInstallation {
  const containerProto = Container.prototype as ContainerClass["prototype"] & { [REGISTRY]?: Registry };
  const registry = (containerProto[REGISTRY] ??= {
    control,
    transform: (text: string) => control.transform(text),
    components: new Set(),
    seen: new WeakSet(),
  });
  const previous = registry.control;
  registry.control = control;
  const refresh = () => {
    registry.transform = (text) => registry.control.transform(text);
    for (const ref of registry.components) {
      const component = ref.deref();
      if (component) component.invalidate?.();
      else registry.components.delete(ref);
    }
  };
  if (!registry.assistant && !registry.restoreWatch) {
    const originalAdd = containerProto.addChild;
    const watch = function (this: object, child: unknown) {
      const assistant = findAssistantPrototype(this) ?? findAssistantPrototype(child);
      if (assistant) {
        registry.restoreWatch?.();
        registry.restoreWatch = undefined;
        registry.assistant = assistant;
        patchAssistant(assistant, registry);
      }
      return originalAdd.call(this, child);
    };
    registry.restoreWatch = () => {
      if (containerProto.addChild === watch) containerProto.addChild = originalAdd;
    };
    containerProto.addChild = watch;
  }
  refresh();
  return {
    isSupported: () => registry.assistant !== undefined,
    isNativeSupported: () => registry.nativeSupported === true,
    refresh,
    release: () => {
      if (registry.control !== control || previous === control) return;
      registry.control = previous;
      refresh();
    },
    dispose: () => {
      registry.control = { isActive: () => false, transform: (text) => text, native: (text) => ({ text, marks: [] }) };
      refresh();
      registry.restoreWatch?.();
      registry.restoreAssistant?.();
      delete containerProto[REGISTRY];
    },
  };
}
