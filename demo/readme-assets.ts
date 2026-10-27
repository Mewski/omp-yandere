// Rebuild the README artwork with: bun demo/readme-assets.ts
// Writes demo/media/. The obsession chart is measured here, at generation time,
// by running the real rewriter over demo/transcripts/corpus.md; nothing in it is
// a reported or hand-typed number.
import { readFileSync } from "node:fs";
import { DERE_LEVELS, type DereLevel, SENPAI, YANDERE_FACES, yanderify } from "../src/yandere.ts";

export const PALETTE = {
  background: "#0d0609",
  text: "#fbe9f1",
  pink: "#ff4f8b",
  blush: "#ff9eb8",
  lavender: "#d68cff",
  crimson: "#d81b60",
  muted: "#b892a6",
  plum: "#2b0f1c",
} as const;

export const CORPUS = readFileSync(new URL("transcripts/corpus.md", import.meta.url), "utf8");
export const MEDIA = new URL("media/", import.meta.url);

export type Marks = { faces: number; senpai: number; hearts: number; stretches: number; tildes: number; stutters: number };
export type LevelMeasure = { level: DereLevel; words: number; marks: Marks; perHundred: number; exact: boolean };

const FACES_LONGEST_FIRST = [...YANDERE_FACES].sort((a, b) => b.length - a.length);
const WORDS = /\S+/g;

/** Inline code spans and fenced blocks of the input: these must survive byte-for-byte. */
export function technicalSpans(text: string): string[] {
  return [...text.matchAll(/```[\s\S]*?```|`[^`\n]+`/g)].map((match) => match[0]);
}

/**
 * Rewrite the corpus at one level and classify every change. Added faces and
 * openers are counted and removed first; what remains has the same tokens as
 * the input, so each changed token is compared with its original.
 */
export function measureLevel(level: DereLevel, corpus = CORPUS): LevelMeasure {
  const output = yanderify(corpus, { level });
  const marks: Marks = { faces: 0, senpai: 0, hearts: 0, stretches: 0, tildes: 0, stutters: 0 };
  let rest = output;
  for (const face of FACES_LONGEST_FIRST) {
    marks.faces += rest.split(` ${face}`).length - 1;
    rest = rest.replaceAll(` ${face}`, "");
  }
  marks.senpai = rest.split(`${SENPAI} `).length - 1;
  rest = rest.replaceAll(`${SENPAI} `, "");
  const before = corpus.match(WORDS) ?? [];
  const after = rest.match(WORDS) ?? [];
  if (before.length !== after.length) throw new Error(`token count changed at ${level}: ${before.length} → ${after.length}`);
  for (const [index, original] of before.entries()) {
    const styled = after[index]!;
    if (styled === original) continue;
    for (const mark of tokenMarks(original, styled)) marks[mark]++;
  }
  const words = before.filter((token) => /\p{L}/u.test(token)).length;
  const total = Object.values(marks).reduce((sum, count) => sum + count, 0);
  return {
    level, words, marks,
    perHundred: Number((total * 100 / words).toFixed(1)),
    exact: technicalSpans(corpus).every((span) => output.includes(span)),
  };
}

/**
 * The word marks one rewritten token carries. Stretches compare lowercased
 * forms, so caps outbursts (`REAAAALLY`) count as stretches; any number of
 * stutter beats (`P-please`, `P-p-please`) counts as one stutter.
 */
export function tokenMarks(original: string, styled: string): Array<"hearts" | "stretches" | "tildes" | "stutters"> {
  const marks: Array<"hearts" | "stretches" | "tildes" | "stutters"> = [];
  if (styled.includes("♡") && !original.includes("♡")) marks.push("hearts");
  if (/(\p{L})\1\1/u.test(styled.toLowerCase()) && !/(\p{L})\1\1/u.test(original.toLowerCase())) marks.push("stretches");
  if (/~$/.test(styled) && /\.$/.test(original)) marks.push("tildes");
  if (/^\W*(\p{L})(?:-\1)+/iu.test(styled) && !/^\W*(\p{L})-\1/iu.test(original)) marks.push("stutters");
  return marks;
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function dither(id: string, color: string): string {
  const pixels = BAYER4.flatMap((row, y) => row.flatMap((threshold, x) =>
    threshold < 8 ? [`<rect x="${x * 2}" y="${y * 2}" width="2" height="2"/>`] : []));
  return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><g fill="${color}" shape-rendering="crispEdges">${pixels.join("")}</g></pattern>`;
}

function heart(x: number, y: number, size: number, color: string): string {
  return `<path d="M1 0H3V1H4V0H6V1H7V3H6V4H5V5H4V6H3V5H2V4H1V3H0V1H1Z" transform="translate(${x} ${y}) scale(${size})" fill="${color}" shape-rendering="crispEdges"/>`;
}

function escape(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function svg(height: number, title: string, description: string, definitions: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${height}" viewBox="0 0 960 ${height}" role="img" aria-labelledby="title desc" style="width:100%;height:auto;max-width:960px">
  <title id="title">${escape(title)}</title>
  <desc id="desc">${escape(description)}</desc>
  <defs>${definitions}</defs>
  <style>
    text { fill: ${PALETTE.text}; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .mono { font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace; font-variant-numeric: tabular-nums; }
    .eyebrow { font-size: 16px; letter-spacing: 2px; fill: ${PALETTE.pink}; }
    .muted { fill: ${PALETTE.muted}; }
    .pink { fill: ${PALETTE.pink}; }
    .blush { fill: ${PALETTE.blush}; }
    .lavender { fill: ${PALETTE.lavender}; }
    .rule { stroke: ${PALETTE.text}; stroke-opacity: .16; fill: none; }
    .grid { stroke: ${PALETTE.text}; stroke-opacity: .09; stroke-dasharray: 2 6; fill: none; }
  </style>
  <rect width="960" height="${height}" rx="8" fill="${PALETTE.background}"/>
${body}
</svg>
`;
}

/** An original pixel girl peeking out from behind a brick wall, with a heart. */
function peeker(): string {
  const px = (x: number, y: number, w: number, h: number, fill: string) =>
    `<rect x="${740 + x * 6}" y="${92 + y * 6}" width="${w * 6}" height="${h * 6}" fill="${fill}"/>`;
  const bricks = Array.from({ length: 6 }, (_, row) =>
    `<path d="M${740} ${92 + row * 24 + 0.5}H${788}M${740 + (row % 2 ? 12 : 24)} ${92 + row * 24}V${92 + row * 24 + 24}" stroke="${PALETTE.background}" stroke-width="2"/>`).join("");
  return `<g shape-rendering="crispEdges" aria-hidden="true">
    ${px(9, 2, 10, 2, PALETTE.crimson)}${px(8, 4, 12, 2, PALETTE.crimson)}${px(8, 6, 2, 8, PALETTE.crimson)}
    ${px(10, 6, 9, 9, "#ffd9e6")}${px(10, 6, 9, 2, PALETTE.crimson)}${px(18, 6, 2, 6, PALETTE.crimson)}
    ${px(11, 9, 2, 3, PALETTE.background)}${px(15, 9, 2, 3, PALETTE.background)}
    ${px(11, 9, 1, 1, PALETTE.pink)}${px(15, 9, 1, 1, PALETTE.pink)}
    ${px(10, 12, 2, 1, PALETTE.blush)}${px(16, 12, 2, 1, PALETTE.blush)}${px(13, 13, 2, 1, PALETTE.crimson)}
    ${px(19, 10, 2, 2, "#ffd9e6")}
    <rect x="740" y="92" width="48" height="144" fill="url(#brick-dither)"/>
    <rect x="740" y="92" width="48" height="144" fill="none" stroke="${PALETTE.muted}" stroke-opacity=".5"/>
    ${bricks}
    ${heart(880, 104, 4, PALETTE.pink)}
    ${heart(862, 150, 2, PALETTE.blush)}
    ${heart(900, 176, 2, PALETTE.lavender)}
  </g>`;
}

export function buildHero(): string {
  return svg(300, "omp-yandere — Your coding agent, but it's obsessed with you, senpai~ ♡",
    "A crimson omp-yandere title on dark plum, with an original pixel girl peeking out from behind a dithered brick wall and three pixel hearts. Devoted chat for omp.",
    dither("brick-dither", "#5a2a3f"), `  <path class="rule" d="M40 78.5H920M40 242.5H920"/>
  <path d="M40 78.5H112" stroke="${PALETTE.pink}"/>
  <text class="mono eyebrow" x="40" y="53">DEVOTED CHAT / EXACT CODE</text>
  <text x="36" y="170" font-size="96" font-weight="650" letter-spacing="-5">omp<tspan class="pink">-yandere</tspan></text>
  <text x="40" y="216" font-size="26" letter-spacing="-.5">Your coding agent, but it's obsessed with you, senpai~ ♡</text>
  <text class="mono muted" x="40" y="274" font-size="17">ヤンデレ · yanderu 病んでる + deredere デレデレ · always watching your diffs</text>
  <g aria-hidden="true"><path class="grid" d="M700 98.5H920M700 230.5H920"/></g>
  ${peeker()}`);
}

export function buildObsessionChart(measures = DERE_LEVELS.map((level) => measureLevel(level))): string {
  const x = 250;
  const top = 150;
  const step = 62;
  // The footer sits below the last bar's caption, so the panel grows with the ladder.
  const bottom = top + measures.length * step + 7;
  const width = 560;
  const max = Math.max(...measures.map((m) => m.perHundred), 1);
  const scale = Math.ceil(max / 10) * 10;
  const words = measures[0]!.words;
  const rows = measures.map((m, index) => {
    const y = top + index * step;
    const barWidth = Number((width * m.perHundred / scale).toFixed(1));
    const { faces, senpai, hearts, stretches, tildes, stutters } = m.marks;
    return `  <text class="mono ${index === measures.length - 1 ? "pink" : ""}" x="40" y="${y + 20}" font-size="22">${m.level}</text>
  <rect id="bar-${m.level}" x="${x}" y="${y}" width="${barWidth}" height="26" fill="${PALETTE.plum}"/>
  <rect x="${x}" y="${y}" width="${barWidth}" height="26" fill="url(#bar-dither)"/>
  <text class="mono" x="${x + barWidth + 12}" y="${y + 20}" font-size="20">${m.perHundred}</text>
  <text class="mono muted" x="${x}" y="${y + 46}" font-size="14">${faces} faces · ${senpai} senpai · ${hearts} hearts · ${stretches} stretches · ${tildes} tildes · ${stutters} stutters</text>`;
  }).join("\n");
  const exact = measures.every((m) => m.exact);
  return svg(bottom + 65, "Obsession levels — persona marks per 100 words, measured on demo/transcripts/corpus.md",
    `Measured at generation time by running yanderify over demo/transcripts/corpus.md (${words} words) at each level. Marks per 100 words: ${measures.map((m) => `${m.level} ${m.perHundred}`).join(", ")}. Code spans and fenced blocks preserved byte-for-byte at every level: ${exact ? "yes" : "no"}.`,
    dither("bar-dither", PALETTE.pink), `  <text class="mono eyebrow" x="40" y="36">MEASURED / DEMO/CORPUS.MD · ${words} WORDS</text>
  <text x="40" y="75" font-size="32" font-weight="600" letter-spacing="-1">How obsessed is she?</text>
  <g aria-hidden="true">${heart(897, 41, 3, PALETTE.pink)}</g>
  <path class="rule" d="M40 98.5H920"/>
  <text class="mono muted" x="40" y="128" font-size="15" letter-spacing="1">LEVEL</text>
  <text class="mono muted" x="${x}" y="128" font-size="15" letter-spacing="1">PERSONA MARKS PER 100 WORDS</text>
${rows}
  <path class="rule" d="M40 ${bottom + 0.5}H920"/>
  <text class="mono ${exact ? "blush" : "pink"}" x="40" y="${bottom + 31}" font-size="18">${exact ? "✓ every code span and fenced block byte-for-byte unchanged, at every level" : "✗ a code span changed"}</text>
  <text class="muted" x="40" y="${bottom + 54}" font-size="14">Deterministic: re-running bun demo/readme-assets.ts reproduces these numbers exactly.</text>`);
}

export function buildStyleMap(): string {
  return svg(340, "Where the obsession lives — illustrative style mode flow",
    "An illustrative diagram, not measured data. Prompt: before generation, the model plays the persona. Rewrite: after streaming, the styled text is saved to history. Display: TUI render only, raw history is unchanged. Rewrite uses prompt style until the awaited assistant_message hook is observed; if absent, prompt fallback stays on.",
    "", `  <text class="mono eyebrow" x="40" y="32">THREE STYLES / ONE DEVOTED VOICE</text>
  <text x="40" y="69" font-size="31" font-weight="600" letter-spacing="-1">Where the obsession lives</text>
  <g aria-hidden="true">${heart(897, 36, 3, PALETTE.lavender)}</g>
  <path class="rule" d="M40 86.5H920M40 277.5H920"/>
  <text class="mono muted" x="52" y="114" font-size="15" letter-spacing="1">MODE</text>
  <text class="mono muted" x="244" y="114" font-size="15" letter-spacing="1">WHEN</text>
  <text class="mono muted" x="548" y="114" font-size="15" letter-spacing="1">EFFECT</text>
  <path class="grid" d="M40 176.5H920M40 226.5H920"/>
  <rect x="40" y="132" width="3" height="30" fill="${PALETTE.pink}"/>
  <rect x="40" y="182" width="3" height="30" fill="${PALETTE.lavender}"/>
  <rect x="40" y="232" width="3" height="30" fill="${PALETTE.blush}"/>
  <text class="mono pink" x="52" y="155" font-size="23">prompt</text>
  <text x="244" y="155" font-size="22">before generation</text>
  <text x="548" y="155" font-size="22">model plays the persona</text>
  <text class="mono lavender" x="52" y="205" font-size="23">rewrite</text>
  <text x="244" y="205" font-size="22">after streaming</text>
  <text x="548" y="205" font-size="22">styled text saved to history</text>
  <text class="mono blush" x="52" y="255" font-size="23">display</text>
  <text x="244" y="255" font-size="22">TUI render only</text>
  <text x="548" y="255" font-size="22">raw history unchanged</text>
  <g fill="none" stroke="${PALETTE.muted}" aria-hidden="true">
    <path d="M181 148H219M213 143L219 148L213 153M488 148H526M520 143L526 148L520 153"/>
    <path d="M181 198H219M213 193L219 198L213 203M488 198H526M520 193L526 198L520 203"/>
    <path d="M181 248H219M213 243L219 248L213 253M488 248H526M520 243L526 248L520 253"/>
  </g>
  <text class="mono muted" x="40" y="302" font-size="15">Illustrative mode flow · not measured data.</text>
  <text class="muted" x="40" y="325" font-size="15">Rewrite uses prompt style until its awaited hook is observed; if absent, fallback stays on.</text>`);
}

if (import.meta.main) {
  await Promise.all([
    ["readme-hero.svg", buildHero()],
    ["obsession-levels.svg", buildObsessionChart()],
    ["style-map.svg", buildStyleMap()],
  ].map(([name, content]) => Bun.write(new URL(name!, MEDIA), content!)));
  for (const m of DERE_LEVELS.map((level) => measureLevel(level))) console.log(m.level, m.perHundred, JSON.stringify(m.marks), m.exact);
}
