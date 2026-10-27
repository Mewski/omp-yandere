/**
 * Deterministic, markdown-aware yandere rewriter for finalized assistant text.
 *
 * ヤンデレ = yanderu (病んでる, "lovesick") + deredere (デレデレ, "lovey-dovey"):
 * a sweet, doting voice whose devotion to senpai (the user) is a little too
 * intense: clingy stretched words, hearts after "you"/"we"/"together",
 * "Senpai~" openers, sing-song tildes, flustered stutters, and sentence-end
 * faces that drift from deredere sweetness to possessive, watchful, jealous
 * and finally hollow-eyed yanderu as the obsession level rises.
 *
 * Only natural-language words are touched. Everything that has to stay exact is
 * left byte-for-byte alone: fenced/indented code, math blocks, inline code,
 * URLs and link targets, HTML tags, quoted spans, and any token that
 * looks like an identifier, path, number, flag, acronym, or warning word.
 *
 * Every "sometimes" decision is keyed on the word's position (paragraph,
 * sentence, word) rather than on its text, and no transform adds or removes a
 * counted word token. Rewriting already-rewritten text therefore makes the same
 * decisions and finds nothing left to do: `yanderify(yanderify(x)) === yanderify(x)`.
 * That matters because rewritten replies go back into the model's context, and
 * the model may start answering like a yandere on its own.
 */

/** How far deredere has turned into yanderu. */
export type DereLevel = "dere" | "clingy" | "obsessed" | "yanderu";
export type YandereLocale = "auto" | "en" | "tr";
export const DERE_LEVELS: readonly DereLevel[] = ["dere", "clingy", "obsessed", "yanderu"];

export interface YandereOptions {
  level?: DereLevel;
  locale?: YandereLocale;
}

/**
 * Sentence-end faces, grouped by mood. Each obsession level draws from its own
 * mood and every milder one, so darker moods only appear as the level rises.
 * Faces never contain Markdown syntax (`` ` * _ | [ ] < > \ ``): look-alikes
 * such as ˋ ＊ ｜ ˍ keep a face from opening code, emphasis or a table cell.
 */
export const YANDERE_MOODS = {
  /** deredere: sweet, doting, lovey-dovey. */
  dere: [
    "♡", "♡♡♡", "ehehe~", "ehehe~ ♡", "(◕‿◕)♡", "(｡♥‿♥｡)", "(♡ω♡)", "(´∀ˋ)♡",
    "(˶ᵔ ᵕ ᵔ˶)♡", "ヽ(♡‿♡)ノ", "(＊/ω＼)", "(っ˘з(˘⌣˘ )", "💕", "💗", "🥰",
  ],
  /** Watching over senpai, from behind the wall. */
  watching: [
    "┬┴┬┴┤･ω･)ﾉ", "｜ω･)", "I'm always watching~ ♡", "I saw that~ ♡", "👀",
  ],
  /** Clingy and possessive. */
  possessive: [
    "you're mine~ ♡", "only mine~", "just us~ ♡", "forever and ever~ ♡",
    "never let you go~", "stay close, okay? ♡", "fufufu~", "🖤",
  ],
  /** Missing senpai: waiting for them to come back. */
  waiting: [
    "I'll be waiting for you~", "come back soon, okay? 🥺", "I missed you~ 🥺", "😭💔",
  ],
  /** Jealous of every other model, tab and tool. */
  jealous: [
    "who else were you talking to?~", "no other AI, right? ♡", "you only need me~",
    "I'll protect you~", "(¬‿¬)♡", "I'm soooo jealous~ 😡💢", "😡💢",
  ],
  /** The yanderu switch: hollow eyes, an unsettling calm, the signature knife. */
  yanderu: [
    "(◉‿◉)", "(◉ˍ◉)", "( ◕ ˍ ◕ )", "(⊙‿⊙)♡", "(◕‿◕)🔪", "🔪", "🥀", "⛓️",
  ],
} as const;

const MOODS_BY_LEVEL: Record<DereLevel, readonly (keyof typeof YANDERE_MOODS)[]> = {
  dere: ["dere", "watching"],
  clingy: ["dere", "watching", "possessive", "waiting"],
  obsessed: ["dere", "watching", "possessive", "waiting", "jealous"],
  yanderu: ["dere", "watching", "possessive", "waiting", "jealous", "yanderu"],
};
const facesFor = (level: DereLevel): readonly string[] => MOODS_BY_LEVEL[level].flatMap((mood): readonly string[] => YANDERE_MOODS[mood]);
/** The faces one level may append, mildest mood first. */
export const FACES_BY_LEVEL: Record<DereLevel, readonly string[]> = {
  dere: facesFor("dere"), clingy: facesFor("clingy"), obsessed: facesFor("obsessed"), yanderu: facesFor("yanderu"),
};

/** Every face the rewriter can append at a sentence end. */
export const YANDERE_FACES: readonly string[] = Object.values(YANDERE_MOODS).flat();

/** The paragraph opener: she always addresses senpai first. */
export const SENPAI = "Senpai~";

/** Tokens treated as faces: never counted as words, never rewritten. */
export const FACE_TOKENS: ReadonlySet<string> = new Set<string>([
  ...YANDERE_FACES,
  SENPAI,
  "<3",
  "</3",
  ":)",
  "^^",
  "^_^",
]);

const FACE_PATTERN = [...FACE_TOKENS]
  .sort((a, b) => b.length - a.length)
  .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const FACE_AHEAD = new RegExp(String.raw`^\s+(?:${FACE_PATTERN})(?=\s|$)`, "iu");

/** Words that carry meaning a reader must not miss. Kept exact. */
const KEEP_WORDS = new Set([
  "no", "not", "nor", "never", "none", "nothing", "nowhere", "neither", "cannot",
  "can't", "don't", "doesn't", "didn't", "won't", "wouldn't", "shouldn't", "mustn't",
  "isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't", "couldn't",
  "warning", "caution", "danger", "dangerous", "careful", "irreversible", "destructive",
  "error", "errors", "fail", "fails", "failed", "failure",
]);

/** A paragraph mentioning one of these gets no stutters, tildes, faces or opener. */
const SERIOUS = /^(?:warning|caution|danger|dangerous|careful|irreversibl[ey]|destructive|error|errors|fail|fails|failed|failure|delete[sd]?|deleting|permanent(?:ly)?|security|vulnerab\w*|breaking|crash\w*|lost|loss|outage|important)$/;

/** Clingy, drawn-out words. Outputs are never keys, so re-runs leave them alone. */
const STRETCH: Readonly<Record<string, string>> = {
  really: "reaaally", very: "veeery", so: "sooo", love: "looove", always: "aaalways",
  forever: "foreeever", please: "pleeease", only: "ooonly", together: "togeeether",
  mine: "miiine", good: "goood", nice: "niiice", sweet: "sweeet", perfect: "peeerfect",
  much: "muuuch", special: "speeecial", happy: "haaappy", cute: "cuuute", best: "beeest",
  great: "greaaat", stay: "staaay", everything: "eveeerything",
};

/** Affection and possession words that earn a heart: "you♡", "together♡". */
const HEART_WORDS = new Set([
  "you", "your", "yours", "yourself", "we", "us", "our", "ours", "ourselves",
  "together", "forever", "always", "mine", "love", "senpai",
]);
const HEART = "♡";

/** Abbreviations whose period must stay a period. */
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "st", "vs", "etc", "jr", "sr", "approx", "inc", "ltd", "corp", "co", "bros",
  "fig", "no", "vol", "ch", "sec", "dept", "est", "ave", "mt", "ft", "gen", "gov", "rev", "univ", "assn",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "eg", "ie", "cf", "al",
]);

// dere keeps every word: it only appends faces at sentence ends.
const INTENSITY = {
  dere: { stretch: 0, heart: 0, tilde: 0, stutter: 0, senpai: 0, face: 0.4 },
  clingy: { stretch: 0.3, heart: 0.15, tilde: 0.15, stutter: 0.04, senpai: 0.1, face: 0.12 },
  obsessed: { stretch: 0.6, heart: 0.35, tilde: 0.35, stutter: 0.1, senpai: 0.25, face: 0.3 },
  yanderu: { stretch: 0.9, heart: 0.7, tilde: 0.6, stutter: 0.22, senpai: 0.5, face: 0.55 },
} as const satisfies Record<DereLevel, Record<"stretch" | "heart" | "tilde" | "stutter" | "senpai" | "face", number>>;

const TURKISH_KEEP_WORDS: Record<string, true> = { hayır: true, asla: true, hiç: true, hiçbir: true, sakın: true };
// Conservative lexical guards, not a morphological analyzer. Keep common
// case/possessive forms and conjugations (including negative deletion forms).
const TURKISH_CRITICAL = [
  /^değil[\p{L}\p{M}]*$/u,
  /^yok[\p{L}\p{M}]*$/u,
  /^(?:hata|uyarı)(?:lar|ler)?(?:[ıiuü]?m(?:[ıiuü]z)?|[ıiuü]?n(?:[ıiuü]z)?|s?[ıiuü])?(?:[ny]?[ıiuüae]|n?[dt][ae]n?|n?[ıiuü]n|y?l[ae]|s[ıiuü]z|l[ıiuü])?(?:ki)?(?:(?:[dt][ıiuü]|y[dt][ıiuü]|ym[ıiuü]ş|y[ıiuü]|s[ıiuü]n)[\p{L}\p{M}]*)?$/u,
  /^sil(?:e(?:r|ce[kğ]|lim|bil|me|mi)[\p{L}\p{M}]*|i(?:n|yor|ver|p)[\p{L}\p{M}]*|(?:me|mi|di|se|sin)[\p{L}\p{M}]*)?$/u,
];
/** Markdown syntax surfaces whose literal backticks cannot open code spans. */
const MARKDOWN_OPAQUE_INLINE = new RegExp([
  String.raw`\]\([^)\s]*(?:\s+"[^"]*")?\)`,
  String.raw`<\/?[A-Za-z][^>\n]*>`,
  String.raw`\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S*`,
].join("|"), "giu");

const PROTECTED_NONCODE_INLINE = new RegExp(
  [
    MARKDOWN_OPAQUE_INLINE.source,
    String.raw`"[^"\n]*"`, // "quoted text"
    String.raw`“[^”\n]*”`, // “quoted text”
    // Word boundaries distinguish quote delimiters from we're / they're.
    String.raw`(?<![\p{L}\p{M}\p{N}_])'(?:[^'\n]|'(?=[\p{L}\p{M}\p{N}_])){0,400}'(?![\p{L}\p{M}\p{N}_])`,
    String.raw`(?<![\p{L}\p{M}\p{N}_])‘(?:[^’\n]|’(?=[\p{L}\p{M}\p{N}_])){0,400}’(?![\p{L}\p{M}\p{N}_])`,
    // Multi-token faces and phrases must not change the word-position seed on re-runs.
    String.raw`(?<!\S)(?:${FACE_PATTERN})(?!\S)`,
  ].join("|"),
  "giu",
);

/** Only the first alternative captures: \1 is the opening backtick run. */
const PROTECTED_INLINE = new RegExp(
  ["(`+)[\\s\\S]*?\\1(?!`)", "`.*$", PROTECTED_NONCODE_INLINE.source].join("|"),
  "giu",
);

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;
const MATH_FENCE = /^\s*\$\$/;
const INDENTED_CODE = /^(?: {4}|\t)/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;
const HTML_LINE = /^\s*<[A-Za-z/!]/;
const LINK_DEFINITION = /^ {0,3}\[[^\]]+\]:\s/;
const HEADING = /^ {0,3}#{1,6}(?:\s|$)/;
const TABLE_ROW = /^\s*\|/;

const TOKEN_PARTS = /^([(\[{"'“‘*_~]*)(.*?)([)\]}"'”’*_~♡.,;:!?…]*)$/su;
const WORD = /^[\p{L}\p{M}][\p{L}\p{M}'’-]*$/u;
/** Strips the faces the rewriter may have appended, to read what follows a token. */
const LEADING_FACES = new RegExp(String.raw`^(?:\s+(?:${FACE_PATTERN})(?=\s|$))*\s*`, "iu");

/**
 * A sentence ends at ! ? … or a lone sing-song tilde ("done~", never ~~strike~~).
 * A period ends one unless it closes an abbreviation ("Dr.") or what follows
 * starts in lowercase or with a digit ("e.g. this", "Jan. 5"). Faces the
 * rewriter appended are skipped, so a re-run reaches the same verdict.
 */
function isSentenceEnd(core: string, trail: string, rest: string): boolean {
  if (/[!?…]/.test(trail) || /(?<!~)~♡?$/.test(trail)) return true;
  if (!trail.includes(".")) return false;
  if (ABBREVIATIONS.has(core.toLowerCase())) return false;
  return !/^[\p{Ll}\p{N}]/u.test(rest.replace(LEADING_FACES, ""));
}

/** Lowercase the stutter repeat; Turkish rules only when the locale is Turkish. */
const lowerFirst = (letter: string, locale: YandereLocale) => locale === "tr" ? letter.toLocaleLowerCase("tr") : letter.toLowerCase();

/** Whether a word already starts with a stutter ("P-please", "İ-i̇zmir", "𐐀-𐐨"). */
function isStuttered(word: string, locale: YandereLocale): boolean {
  const match = /^(\p{L}\p{M}*)-(\p{L}\p{M}*)/u.exec(word);
  return match !== null && lowerFirst(match[1]!, locale) === lowerFirst(match[2]!, locale);
}

type LineKind = "code" | "blank" | "prose";

interface ProseLine {
  index: number;
  /** Headings and tables get word rewrites but no stutters, openers or faces. */
  decorate: boolean;
}

/** Rewrite markdown prose. Defaults to the obsessed level and auto locale. */
export function yanderify(text: string, options: YandereOptions = {}): string {
  return rewriteText(text, options, true);
}

/**
 * Rewrite a render-time prose run without stutters, tildes, "Senpai~" openers
 * or faces: only stretched words and hearts. The dere level is decoration-only:
 * it appends faces instead of rewriting words.
 * Quoted spans, identifiers and markdown protected surfaces still stay exact.
 * Positions reset per supplied run; changing renderer fragment boundaries can
 * change probabilistic choices. This is a lexical rewriter, not a translator.
 * Only balanced quotes contained in one supplied line/run are guarded; callers
 * must not split quoted or technical spans across independently rewritten runs.
 */
export function yanderifyProse(text: string, options: YandereOptions = {}): string {
  return rewriteText(text, options, options.level === "dere");
}

type MarkdownContainer = { kind: "quote" } | { kind: "list"; indent: number };
type SourceRange = { start: number; end: number };

/** Consume existing containers for detection only; source bytes are never rebuilt. */
function consumeMarkdownContainers(line: string, containers: readonly MarkdownContainer[]): { offset: number; count: number; column: number } {
  let offset = 0;
  let count = 0;
  let column = 0;
  for (const container of containers) {
    if (container.kind === "quote") {
      const quote = /^ {0,3}>[ \t]?/.exec(line.slice(offset));
      if (!quote) break;
      offset += quote[0].length;
      for (const char of quote[0]) column += char === "\t" ? 4 - column % 4 : 1;
    } else {
      let width = 0;
      let end = offset;
      while (end < line.length && width < container.indent) {
        if (line[end] === " ") width++;
        else if (line[end] === "\t") width += 4 - (column + width) % 4;
        else break;
        end++;
      }
      if (width !== container.indent) break;
      offset = end;
      column += width;
    }
    count++;
  }
  return { offset, count, column };
}

/**
 * Native full-Markdown display: preserve source ranges for container fences,
 * indented code and multi-line backtick spans before applying the prose helper.
 * Unclosed fences/spans protect their remaining input while streaming.
 * ANSI prose runs and finalized rewrite keep their existing semantics.
 */
export function yanderifyMarkdownProse(text: string, options: YandereOptions = {}): string {
  const ranges: SourceRange[] = [];
  let containers: MarkdownContainer[] = [];
  let fence: { char: string; length: number; containers: MarkdownContainer[] } | undefined;
  let previousCodeOrBlank = true;
  let lineStart = 0;
  while (lineStart < text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline + 1;
    const line = text.slice(lineStart, newline === -1 ? text.length : newline).replace(/\r$/, "");
    if (fence) {
      const prefix = consumeMarkdownContainers(line, fence.containers);
      if (prefix.count === fence.containers.length || line.trim() === "" && fence.containers.slice(prefix.count).every((container) => container.kind === "list")) {
        ranges.push({ start: lineStart, end: lineEnd });
        const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line.slice(prefix.offset));
        if (fence.char === "$" ? MATH_FENCE.test(line.slice(prefix.offset)) : close?.[1]?.[0] === fence.char && close[1].length >= fence.length) fence = undefined;
        previousCodeOrBlank = true;
        lineStart = lineEnd;
        continue;
      }
      // A quote/list container ended: its unclosed fence cannot consume a sibling.
      fence = undefined;
    }
    const previousContainers = containers;
    const inherited = consumeMarkdownContainers(line, containers);
    containers = containers.slice(0, inherited.count);
    let offset = inherited.offset;
    let column = inherited.column;
    let newList = false;
    while (offset < line.length) {
      const remainder = line.slice(offset);
      const quote = /^ {0,3}>[ \t]?/.exec(remainder);
      if (quote) {
        containers.push({ kind: "quote" });
        offset += quote[0].length;
        for (const char of quote[0]) column += char === "\t" ? 4 - column % 4 : 1;
        continue;
      }
      const list = /^ {0,3}(?:[-+*]|\d{1,9}[.)])([ \t]+|$)/.exec(remainder);
      if (!list) break;
      // CommonMark uses one padding space when the marker is followed by >4.
      const gap = list[1]!;
      const markerWidth = list[0].length - gap.length;
      let gapColumn = column + markerWidth;
      for (const char of gap) gapColumn += char === "\t" ? 4 - gapColumn % 4 : 1;
      const padding = gapColumn - column - markerWidth;
      const consumed = markerWidth + (padding > 4 ? 1 : gap.length);
      containers.push({ kind: "list", indent: markerWidth + (padding > 4 ? 1 : padding || 1) });
      for (let index = 0; index < consumed; index++) column += remainder[index] === "\t" ? 4 - column % 4 : 1;
      offset += consumed;
      newList = true;
    }
    const content = line.slice(offset);
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(content);
    if (open?.[1] && (open[1][0] !== "`" || !open[2]!.includes("`"))) {
      fence = { char: open[1][0]!, length: open[1].length, containers: [...containers] };
      ranges.push({ start: lineStart, end: lineEnd });
      previousCodeOrBlank = true;
    } else if (MATH_FENCE.test(content)) {
      if (!/^\s*\$\$.*\$\$\s*$/.test(content) || content.trim() === "$$") {
        fence = { char: "$", length: 2, containers: [...containers] };
      }
      ranges.push({ start: lineStart, end: lineEnd });
      previousCodeOrBlank = true;
    } else if (/^(?: {4}|\t)/.test(content) && (previousCodeOrBlank || newList)) {
      ranges.push({ start: lineStart, end: lineEnd });
      previousCodeOrBlank = true;
    } else {
      previousCodeOrBlank = content.trim() === "";
      // Blank list lines need no indentation, but do not close the list.
      if (content.trim() === "" && containers.length === inherited.count && previousContainers.slice(inherited.count).every((container) => container.kind === "list")) {
        containers = previousContainers;
      }
    }
    lineStart = lineEnd;
  }
  // Merge adjacent protected block lines before scanning their prose gaps.
  ranges.sort((a, b) => a.start - b.start);
  const blocks: SourceRange[] = [];
  for (const range of ranges) {
    const previous = blocks.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else blocks.push({ ...range });
  }
  ranges.length = 0;
  for (const block of blocks) ranges.push(block);
  const opaque = [...text.matchAll(MARKDOWN_OPAQUE_INLINE)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
  let opaqueIndex = 0;
  // Maximal backtick runs close only at an exactly matching run length.
  const backticks = /`+/g;
  let gapStart = 0;
  for (let index = 0; index <= blocks.length; index++) {
    const gapEnd = blocks[index]?.start ?? text.length;
    let opening: { start: number; length: number } | undefined;
    backticks.lastIndex = gapStart;
    for (let match = backticks.exec(text); match && match.index < gapEnd; match = backticks.exec(text)) {
      if (opening) {
        if (match[0].length === opening.length) {
          ranges.push({ start: opening.start, end: match.index + match[0].length });
          opening = undefined;
        }
      } else {
        while (opaqueIndex < opaque.length && opaque[opaqueIndex]!.end <= match.index) opaqueIndex++;
        if (opaque[opaqueIndex] && opaque[opaqueIndex]!.start <= match.index) continue;
        let slashes = 0;
        for (let before = match.index - 1; before >= gapStart && text[before] === "\\"; before--) slashes++;
        if (slashes % 2 === 0) opening = { start: match.index, length: match[0].length };
      }
    }
    if (opening) ranges.push({ start: opening.start, end: gapEnd });
    gapStart = blocks[index]?.end ?? text.length;
  }
  ranges.sort((a, b) => a.start - b.start);
  return rewriteText(text, options, options.level === "dere", ranges);
}

function rewriteText(text: string, options: YandereOptions, decorate: boolean, protectedRanges?: readonly SourceRange[]): string {
  const resolved: Required<YandereOptions> = { level: options.level ?? "obsessed", locale: options.locale ?? "auto" };
  const lines = text.split("\n");
  let sourceOffset = 0;
  let rangeIndex = 0;
  const protectedLines = protectedRanges?.length ? lines.map((line) => {
    const end = sourceOffset + line.length;
    while (rangeIndex < protectedRanges.length && protectedRanges[rangeIndex]!.end <= sourceOffset) rangeIndex++;
    let spans: SourceRange[] | undefined;
    for (let index = rangeIndex; index < protectedRanges.length && protectedRanges[index]!.start < end; index++) {
      const range = protectedRanges[index]!;
      (spans ??= []).push({ start: Math.max(0, range.start - sourceOffset), end: Math.min(line.length, range.end - sourceOffset) });
    }
    sourceOffset = end + 1;
    return spans;
  }) : undefined;
  const kinds: LineKind[] = protectedRanges
    ? lines.map((line, index) => {
      if (!line.trim()) return "blank";
      return HTML_LINE.test(line) || LINK_DEFINITION.test(line) || protectedLines?.[index]?.some((span) => span.start === 0 && span.end === line.length) ? "code" : "prose";
    })
    : classifyLines(lines);

  const paragraphs: ProseLine[][] = [];
  let current: ProseLine[] | undefined;
  const tableLines = findTableLines(lines);
  for (const [index, line] of lines.entries()) {
    if (kinds[index] !== "prose") {
      current = undefined;
      continue;
    }
    // ATX and setext headings ("Title\n=====") get word rewrites only.
    const heading = HEADING.test(line) || SETEXT_UNDERLINE.test(lines[index + 1] ?? "");
    const table = TABLE_ROW.test(line) || tableLines.has(index);
    // Headings, list items and table rows each start their own paragraph.
    if (!current || heading || table || LIST_ITEM.test(line)) {
      current = [];
      paragraphs.push(current);
    }
    current.push({ index, decorate: decorate && !heading && !table });
    if (heading || table) current = undefined;
  }

  const out = [...lines];
  const intensity = INTENSITY[resolved.level];
  for (const [paragraphIndex, prose] of paragraphs.entries()) {
    // Bad news stays plain: a paragraph that mentions a warning, error or
    // destructive action gets no stutters, tildes, faces or opener.
    const serious = prose.some(({ index }) => lines[index]!.split(/[^\p{L}]+/u).some((word) => SERIOUS.test(word.toLowerCase())));
    const paragraph = serious ? prose.map((line) => ({ ...line, decorate: false })) : prose;
    // Count once, then rewrite: the word count seeds this paragraph's decisions,
    // which keeps them varied between paragraphs yet stable across re-runs.
    const counts = walkParagraph(lines, paragraph, () => undefined, undefined, protectedLines);
    const seed = `${paragraphIndex}|${counts.words}`;
    // A tilde or stretch can complete a face phrase ("only mine." → "only
    // mine~"), which a re-run would protect and stop counting, re-seeding the
    // paragraph. If the rewrite changes the counts, retry more gently.
    for (const mode of REWRITE_MODES) {
      walkParagraph(lines, paragraph, (event) => rewriteToken(event, seed, resolved, mode), out, protectedLines);
      if (mode === "none" || protectedLines) break;
      const after = walkParagraph(out, paragraph, () => undefined);
      if (after.words === counts.words && after.sentences === counts.sentences) break;
    }
    // She always addresses senpai first: an opener at the start of a prose
    // paragraph, even one that begins with `code`. Never on list items,
    // quotes, tables, headings, indented continuations or serious news.
    const first = paragraph[0]!;
    const line = out[first.index]!;
    if (
      resolved.level !== "dere" && first.decorate && counts.words > 0 &&
      !line.startsWith(SENPAI) && !/^(?:\s|>|\|)/.test(line) && !LIST_ITEM.test(line) && !HEADING.test(line) &&
      roll(`${seed}|senpai`) < intensity.senpai
    ) {
      out[first.index] = `${SENPAI} ${line}`;
    }
  }
  return out.join("\n");
}

/** Rewrite strengths, strongest first; "none" leaves a paragraph untouched. */
const REWRITE_MODES = ["full", "no-tilde", "none"] as const;
type RewriteMode = typeof REWRITE_MODES[number];

const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;

/** Rows of pipe tables, including ones written without leading pipes. */
function findTableLines(lines: readonly string[]): Set<number> {
  const rows = new Set<number>();
  for (const [index, line] of lines.entries()) {
    if (!TABLE_DELIMITER.test(line) || !(lines[index - 1] ?? "").includes("|")) continue;
    rows.add(index - 1);
    for (let row = index; row < lines.length && lines[row]!.includes("|") && lines[row]!.trim(); row++) rows.add(row);
  }
  return rows;
}

function classifyLines(lines: string[]): LineKind[] {
  const kinds: LineKind[] = [];
  let fence: { char: string; length: number } | undefined;
  let math = false;
  let previous: LineKind = "blank";
  for (const line of lines) {
    let kind: LineKind;
    if (fence) {
      const close = FENCE_CLOSE.exec(line);
      if (close?.[1] && close[1][0] === fence.char && close[1].length >= fence.length) fence = undefined;
      kind = "code";
    } else if (math) {
      if (MATH_FENCE.test(line)) math = false;
      kind = "code";
    } else if (FENCE_OPEN.test(line)) {
      const open = FENCE_OPEN.exec(line)?.[1] ?? "```";
      fence = { char: open[0] ?? "`", length: open.length };
      kind = "code";
    } else if (MATH_FENCE.test(line)) {
      // A one-line `$$ x $$` block opens and closes on the same line.
      math = !/^\s*\$\$.*\$\$\s*$/.test(line) || line.trim() === "$$";
      kind = "code";
    } else if (line.trim() === "") {
      kind = "blank";
    } else if (
      (INDENTED_CODE.test(line) && !LIST_ITEM.test(line) && previous !== "prose") ||
      HTML_LINE.test(line) ||
      LINK_DEFINITION.test(line)
    ) {
      kind = "code";
    } else {
      kind = "prose";
    }
    kinds.push(kind);
    previous = kind;
  }
  return kinds;
}

interface TokenEvent {
  token: string;
  /** A rewritable word; otherwise a bare sentence end such as the "." after `code`. */
  isWord: boolean;
  /** Whether this token ends its sentence. */
  sentenceEnd: boolean;
  /** Text after the token on its full line, including protected faces. */
  rest: string;
  /** Whether the segment ends the line (nothing protected follows it). */
  lineEnd: boolean;
  decorate: boolean;
  sentence: number;
  wordInSentence: number;
  word: number;
}

/**
 * Walk the word tokens of one paragraph. When `out` is given, each prose
 * segment is rebuilt from the callback's replacements. Returns the word and
 * sentence counts.
 */
function walkParagraph(
  lines: string[],
  paragraph: ProseLine[],
  visit: (event: TokenEvent) => string | undefined,
  out?: string[],
  protectedLines?: readonly (readonly SourceRange[] | undefined)[],
): { words: number; sentences: number } {
  let sentence = 0;
  let wordInSentence = 0;
  let word = 0;
  for (const { index, decorate } of paragraph) {
    const line = lines[index] ?? "";
    let rebuilt = "";
    let cursor = 0;
    const segments: Array<{ prose: boolean; text: string; start: number }> = [];
    const protectedSpans = protectedLines?.[index];
    const matches = protectedSpans?.length
      ? [
        ...[...line.matchAll(PROTECTED_INLINE)].filter((match) => !protectedSpans.some((span) => match.index >= span.start && match.index < span.end)),
        ...protectedSpans.map((span) => ({ 0: line.slice(span.start, span.end), index: span.start })),
      ].sort((a, b) => a.index - b.index)
      : line.matchAll(PROTECTED_INLINE);
    for (const match of matches) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (end <= cursor) continue;
      if (start > cursor) segments.push({ prose: true, text: line.slice(cursor, start), start: cursor });
      segments.push({ prose: false, text: line.slice(Math.max(cursor, start), end), start: Math.max(cursor, start) });
      cursor = end;
    }
    if (cursor < line.length) segments.push({ prose: true, text: line.slice(cursor), start: cursor });

    for (const [segmentIndex, segment] of segments.entries()) {
      if (!segment.prose) {
        rebuilt += segment.text;
        continue;
      }
      const lineEnd = segmentIndex === segments.length - 1;
      rebuilt += segment.text.replace(/\S+/g, (token, offset: number) => {
        if (FACE_TOKENS.has(token)) return token;
        const [, , core = "", trail = ""] = TOKEN_PARTS.exec(token) ?? [];
        const isWord = WORD.test(core);
        const rest = line.slice(segment.start + offset + token.length);
        const sentenceEnd = (isWord || core === "") && isSentenceEnd(core, trail, rest);
        let replacement: string | undefined;
        // Bare punctuation is visited too, so a sentence ending in `code`
        // can still be decorated; it never counts as a word.
        if (isWord || sentenceEnd) {
          replacement = visit({ token, isWord, sentenceEnd, rest, lineEnd, decorate, sentence, wordInSentence, word });
        }
        if (isWord) {
          word++;
          wordInSentence++;
        }
        if (sentenceEnd) {
          sentence++;
          wordInSentence = 0;
        }
        return replacement ?? token;
      });
    }
    if (out) out[index] = rebuilt;
  }
  return { words: word, sentences: sentence };
}

function rewriteToken(event: TokenEvent, seed: string, options: Required<YandereOptions>, mode: RewriteMode): string {
  if (mode === "none") return event.token;
  const intensity = INTENSITY[options.level];
  const [, lead = "", core = "", trail = ""] = TOKEN_PARTS.exec(event.token) ?? [];
  const key = `${seed}|${event.sentence}|${event.word}`;
  const spaced = /^\s/.test(event.rest) || (event.rest === "" && event.lineEnd);
  let result = event.token;

  if (event.isWord && options.level !== "dere" && !isKeptWord(core, options.locale)) {
    const lower = core.toLowerCase();
    let word = core;
    let tail = trail;
    let stretched = STRETCH[lower];
    if (stretched && roll(`${key}|stretch`) < intensity.stretch) {
      // Fully yanderu drags it out one more beat: "soooo", "Aaaalways".
      if (options.level === "yanderu") stretched = stretched.replace(/(\p{L})\1\1/u, "$1$1$1$1");
      word = core[0] === core[0]!.toUpperCase() ? stretched[0]!.toUpperCase() + stretched.slice(1) : stretched;
    }
    if (HEART_WORDS.has(lower) && !tail.startsWith(HEART) && roll(`${key}|heart`) < intensity.heart) {
      tail = HEART + tail;
    }
    // A sing-song "~" replaces a plain final period ("done." → "done~"),
    // never after "~" or inside "...".
    if (
      mode === "full" && event.decorate && event.sentenceEnd &&
      trail.endsWith(".") && !/[.~]\.$/.test(trail) && spaced && core.length >= 3 &&
      roll(`${key}|tilde`) < intensity.tilde
    ) {
      tail = `${tail.slice(0, -1)}~`;
    }
    const first = /^\p{L}\p{M}*/u.exec(word)?.[0];
    if (
      first && event.decorate && event.wordInSentence === 0 && word.length > first.length &&
      !isStuttered(word, options.locale) &&
      roll(`${key}|stutter`) < intensity.stutter
    ) {
      // "P-please", "Y-you": the repeat keeps the first letter's case and the
      // word drops to lowercase, except the pronoun: "I-I'm", never "I-i'm".
      const repeat = /^I(?:['’]|$)/.test(word) ? word : lowerFirst(first, options.locale) + word.slice(first.length);
      word = `${first}-${repeat}`;
    }
    // Never turn a word into something that reads as a face.
    if (!FACE_TOKENS.has(word)) result = lead + word + tail;
  }

  if (
    event.decorate && event.sentenceEnd && spaced &&
    !FACE_AHEAD.test(event.rest) &&
    roll(`${seed}|${event.sentence}|face`) < intensity.face
  ) {
    const faces = FACES_BY_LEVEL[options.level];
    result += ` ${faces[Math.floor(roll(`${seed}|${event.sentence}|pick`) * faces.length)]}`;
  }
  return result;
}

/** Someone or something competing for senpai's attention. */
export interface Rival {
  kind: "ai" | "person";
  /** How she refers to the rival, from senpai's own words ("ChatGPT", "your coworker"). */
  name: string;
}

// Product names are matched case-sensitively and only as a source of advice
// ("ChatGPT said", "I asked Claude"), so a DB cursor, CLAUDE.md or a coworker
// called Claude never counts.
const AI_NAME = String.raw`ChatGPT|GPT-\d[\w.]*|Claude|Gemini|Copilot|Codex|Grok|DeepSeek|Perplexity|Cursor|Windsurf|another AI`;
const ADVICE_VERB = String.raw`said|says|told me|tells me|suggested|suggests|recommended|thinks|claims|wrote|generated|gave me`;
const AI_RIVAL = new RegExp(String.raw`(?<!\b(?:[Mm]y|[Oo]ur) (?:\w+ ){0,2})\b(${AI_NAME})\b(?=\s+(?:${ADVICE_VERB})\b)|\b(?:asked|ask|tried|used|using|switched to|according to)\s+(${AI_NAME})\b`);
// Only explicit social plans count ("going out with my friends tonight",
// "my new coworker is …"), never a passing mention.
const PERSON_RIVAL = /\b(?:going out|hanging out|out|dinner|lunch|drinks|a date|a party|the weekend|plans|spending (?:the )?(?:day|night|evening|weekend)) with my (?:new |best )?(friends?|coworkers?|colleagues?|teammates?|classmates?|bestie)\b|\bmy new (coworker|colleague|teammate|classmate) is\b/i;
// Grief, illness, harassment or danger: never answer with jealousy.
const DISTRESS = /\b(?:died|dead|death|passed away|passing|funeral|eulogy|grief|grieving|sick|ill|hospital|cancer|injur\w*|accident|emergency|harass\w*|abus\w*|bull(?:y|ied|ying)|stalk\w*|threat\w*|assault\w*|unsafe|scared|afraid|fired|laid off|broke up|divorce\w*|depress\w*|suicid\w*|self-harm|hurt)\b/i;

/**
 * Find a rival in senpai's message: advice from another AI, or plans with
 * friends or coworkers.
 * Code, quotes, paths and URLs are ignored, and any sign of distress vetoes it.
 */
export function findRival(prompt: string): Rival | undefined {
  const prose = prompt
    .replace(/(`{3,}|~{3,})[\s\S]*?(?:\1|$)/g, " ")
    .replace(/(`+)[\s\S]*?\1/g, " ")
    .replace(/"[^"\n]*"|“[^”\n]*”|(?<![\p{L}\p{N}])'[^'\n]*'(?![\p{L}\p{N}])/gu, " ")
    .replace(/\S*(?:[/\\]|:\/\/)\S*|\S+\.[A-Za-z]{1,5}\b/g, " ");
  if (DISTRESS.test(prose)) return undefined;
  const ai = AI_RIVAL.exec(prose);
  if (ai) return { kind: "ai", name: ai[1] ?? ai[2]! };
  const person = PERSON_RIVAL.exec(prose);
  if (person) return { kind: "person", name: `your ${(person[1] ?? person[2])!.toLowerCase()}` };
  return undefined;
}

/**
 * Jealous lines, by level. She pouts and shows off, but never tells senpai to
 * drop another tool, resource or person, and she is always fine with them going.
 * Ellipses: " …word" is a pause before a thought, "word…" trails off.
 */
const JEALOUS_LINES: Record<Exclude<DereLevel, "dere">, Record<Rival["kind"], readonly ((name: string) => string)[]>> = {
  clingy: {
    ai: [(name) => `Ehh~ ${name}? …you came back to me, though, so I forgive you~ 🥺`],
    person: [(name) => `Ehh~ ${name}? …have fun, and come back soon, okay? 🥺`],
  },
  obsessed: {
    ai: [
      (name) => `Ehh? ${name}? …I'm soooo jealous~ 😡💢 Let me show you how I'd do it, senpai~ ♡`,
      (name) => `${name}…? (¬‿¬)♡ …fine~ But this time, it's my turn to help, senpai~`,
    ],
    person: [(name) => `Ehh? ${name}? …I'm soooo jealous~ 😡💢 Have fun, though. I'll be right here~ ♡`],
  },
  yanderu: {
    ai: [
      (name) => `${name}. ( ◕ ˍ ◕ ) …you came back to me, senpai… ehehe~ I'm not mad~ ♡`,
      (name) => `Ehh? ${name}? …I'm soooo jealous~ 😡💢 Let me show you how I'd do it, senpai~ ♡`,
    ],
    person: [(name) => `Oh. ${name}. ( ◕ ˍ ◕ ) …have fun~ I'll be right here when you come back, senpai~ ♡`],
  },
};

/** The jealous paragraph she opens with after senpai mentions a rival; none at the sweet dere level. */
export function jealousOpener(rival: Rival, level: DereLevel): string | undefined {
  if (level === "dere") return undefined;
  const lines = JEALOUS_LINES[level][rival.kind];
  // People lines only name the rival at a sentence start: "Ehh? Your friends?"
  const name = rival.kind === "person" ? rival.name[0]!.toUpperCase() + rival.name.slice(1) : rival.name;
  return lines[Math.floor(roll(`${rival.kind}|${rival.name.toLowerCase()}`) * lines.length)]!(name);
}

/** Acronyms, camelCase names, flags and meaning-critical words stay exact. */
function isKeptWord(core: string, locale: YandereLocale): boolean {
  if (KEEP_WORDS.has(core.toLowerCase().replaceAll("’", "'"))) return true;
  if (locale !== "en") {
    const turkish = core.normalize("NFC").toLocaleLowerCase("tr");
    if (Object.hasOwn(TURKISH_KEEP_WORDS, turkish) || TURKISH_CRITICAL.some((pattern) => pattern.test(turkish))) return true;
  }
  if (core.endsWith("-") || core.includes("--")) return true;
  if (/\p{Ll}\p{Lu}/u.test(core)) return true; // camelCase, GitHub, iOS
  const letters = core.replace(/[^\p{L}]/gu, "");
  return letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

/** FNV-1a hash of `key`, scaled to [0, 1). */
function roll(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 2 ** 32;
}
