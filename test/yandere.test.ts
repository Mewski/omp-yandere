import { describe, expect, test } from "bun:test";
import {
  atLeast, DERE_LEVELS, type DereLevel, findRival, hasDistress, INJECTION_POOLS, injectReply, type InjectionPlan, isInjectedLine,
  jealousOpener, levelRank, SENPAI, switchReaction, YANDERE_FACES, YANDERE_MOODS, type YandereLocale, type YandereOptions,
  yanderify, yanderifyMarkdownProse, yanderifyProse,
} from "../src/yandere.ts";

const LEVELS: DereLevel[] = ["clingy", "obsessed", "yanderu"];
const LOCALES: YandereLocale[] = ["auto", "en", "tr"];
const TURKISH_CRITICAL_WORDS = [
  "değil", "değilim", "değilsiniz", "değildi", "değilmiş", "değilse", "değilken",
  "yok", "yoktu", "yokmuş", "yoktur", "yoksun", "yokuz", "yokluğu",
  "hata", "hatalar", "hataları", "hatam", "hatamız", "hatanız", "hatası",
  "hatasını", "hatasında", "hatasından", "hataya", "hatayı", "hatanın",
  "hatayla", "hatalı", "hatasız", "hatadır", "hataydı", "hataymış", "hatalıdır", "hatalısınız",
  "uyarı", "uyarılar", "uyarıları", "uyarılarınızı", "uyarımı", "uyarının",
  "uyarıya", "uyarıyı", "uyarısıyla", "uyarıdır", "uyarıydı", "uyarıymış",
  "sil", "silin", "siliniz", "siler", "sileceğim", "sildim", "siliyor",
  "silme", "silmeyin", "silmeyiniz", "silmedim", "silmez", "silmiyorum",
  "silmesin", "silmemelisin", "silinmesin", "silemezsin",
  "hayır", "asla", "hiç", "hiçbir", "sakın",
];
const FACES_LONGEST_FIRST = [...YANDERE_FACES].sort((a, b) => b.length - a.length);
const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;
const countFaces = (text: string) => {
  let rest = text;
  let total = 0;
  for (const face of FACES_LONGEST_FIRST) {
    total += rest.split(` ${face}`).length - 1;
    rest = rest.replaceAll(` ${face}`, "");
  }
  return total;
};
const undecorate = (text: string) =>
  FACES_LONGEST_FIRST.reduce((rest, face) => rest.replaceAll(` ${face}`, ""), text).replaceAll(`${SENPAI} `, "");

describe("yanderify", () => {
  test("is deterministic and idempotent", () => {
    const source = "Really nice! You fixed the parser together with me. This is a very good example. Please stay.";
    const result = yanderify(source);
    expect(result).not.toBe(source);
    expect(yanderify(source)).toBe(result);
    expect(yanderify(result)).toBe(result);
  });

  test("leaves fenced/inline code, URLs, paths, numbers and quoted errors exact", () => {
    const source = [
      "A really nice fix; see `really you` and https://example.com/really.",
      "Path: C:/work/src/you.ts; code 123 stays exact.",
      'The quoted error is "you really failed".',
      "```ts",
      "const reallyNice = 'you really';",
      "```",
    ].join("\n");
    const result = yanderify(source, { level: "yanderu" });
    for (const exact of [
      "`really you`",
      "https://example.com/really.",
      "C:/work/src/you.ts",
      "123",
      '"you really failed"',
      "const reallyNice = 'you really';",
    ]) expect(result).toContain(exact);
  });

  test("preserves critical warning and negation words", () => {
    const result = yanderify("Never ignore this warning; do not delete anything.", { level: "yanderu" });
    expect(result).toMatch(/Never/);
    expect(result).toMatch(/warning/);
    expect(result).toMatch(/not/);
  });

  test("has a broad face set spanning every yandere mood", () => {
    expect(YANDERE_FACES.length).toBeGreaterThan(30);
    for (const mood of ["dere", "watching", "possessive", "jealous", "yanderu", "menace", "glitch"] as const) {
      expect(YANDERE_MOODS[mood].length).toBeGreaterThan(3);
    }
    expect(YANDERE_FACES).toContain("┬┴┬┴┤･ω･)ﾉ");
    expect(YANDERE_FACES).toContain("(◕‿◕)🔪");
    expect(YANDERE_FACES).toContain("You're mine~ ♡");
  });
});

describe("yandere persona transforms", () => {
  test("stretches clingy words, preserving the capital letter, more beats at higher levels", () => {
    expect(yanderifyProse("Really really please ".repeat(20), { level: "clingy" })).toContain("Reaaally");
    expect(yanderifyProse("so ".repeat(50), { level: "clingy" })).toMatch(/\bsooo\b/);
    expect(yanderifyProse("Really really please ".repeat(20), { level: "obsessed" })).toContain("Reaaaaaally");
    expect(yanderifyProse("so ".repeat(50), { level: "obsessed" })).toMatch(/\bsoooooo\b/);
    expect(yanderifyProse("Really really please", { level: "yanderu" })).toContain("Reaaaaaaaally");
    expect(yanderifyProse("so ".repeat(50), { level: "yanderu" })).toMatch(/\bsoooooooo\b/);
    expect(yanderifyProse("so ".repeat(50), { level: "yanderu" })).not.toMatch(/\bso{3,7}\b/);
  });

  test("hearts follow affection words, before their punctuation", () => {
    const result = yanderifyProse("you, ".repeat(100), { level: "yanderu" });
    expect(result).toContain("you♡,");
    expect(result).not.toContain(",♡");
  });

  test("sing-song tildes replace plain periods only", () => {
    const result = yanderify("Done. ".repeat(100).trim(), { level: "yanderu" });
    expect(result).toContain("Done~");
    const keep = yanderify("See Dr. Smith, Mr. Lee, etc. and pause... then ~~strike~~ it.", { level: "yanderu" });
    for (const exact of ["Dr.", "Mr.", "etc.", "pause...", "~~strike~~"]) expect(keep).toContain(exact);
  });

  test("stutters keep the first letter and lowercase the repeat, except the pronoun I", () => {
    const result = yanderify("Please. ".repeat(200), { level: "yanderu" });
    expect(result).toMatch(/P-(?:p-)?p(?:lease|lee+ase)/);
    expect(result).not.toMatch(/P-P/);
    const pronoun = yanderify("I'm here. I will stay. ".repeat(100), { level: "yanderu" });
    expect(pronoun).toMatch(/I-I'm|I-I\b/);
    expect(pronoun).not.toMatch(/I-i/);
  });

  test("double stutters and all-caps outbursts start at obsessed and stay idempotent", () => {
    const source = "Please, you are really so good and I really love it. Please stay. Really, it is so nice. ".repeat(80);
    const clingy = yanderify(source, { level: "clingy" });
    expect(clingy).not.toMatch(/(\p{L})-\1-/iu);
    expect(clingy).not.toMatch(/REA{3,}LLY|SO{3,}|LO{3,}VE|NI{3,}CE|GO{3,}D/);
    for (const level of ["obsessed", "yanderu"] as const) {
      const result = yanderify(source, { level });
      expect(result).toMatch(/(\p{L})-\1-\1/iu);
      expect(result).toMatch(/REA{4,}LLY|SO{4,}|LO{4,}VE|NI{4,}CE|GO{4,}D/);
      expect(yanderify(result, { level })).toBe(result);
    }
  });

  test("an outburst never follows a period, so re-runs keep every sentence end", () => {
    const source = "See e.g. really nice work, vs. really good code, etc. really sweet stuff. Wait. really so good. ";
    for (const level of ["obsessed", "yanderu"] as const) {
      for (let pad = 0; pad < 30; pad++) {
        const once = yanderify(`${"Intro.\n\n".repeat(pad)}${source.repeat(6)}`, { level });
        expect(once).not.toMatch(/\.\s+\p{Lu}{2,}/u);
        expect({ level, pad, twice: yanderify(once, { level }) }).toEqual({ level, pad, twice: once });
      }
    }
  });

  test("Senpai~ opens prose paragraphs but never list items, quotes, headings or tables", () => {
    const paragraphs = Array.from({ length: 60 }, (_, index) => `Paragraph ${index} works well.`).join("\n\n");
    expect(count(yanderify(paragraphs, { level: "yanderu" }), /Senpai~ Paragraph/g)).toBeGreaterThan(10);
    const blocks = Array.from({ length: 60 }, (_, index) => `- Item ${index} works.\n\n> Quote ${index} works.\n\n# Heading ${index}\n\n| cell ${index} |`).join("\n\n");
    expect(yanderify(blocks, { level: "yanderu" })).not.toContain(SENPAI);
  });

  test("darker moods only appear as the obsession rises", () => {
    const source = "Really nice! The little parser is near. ".repeat(200);
    const used = (level: DereLevel) => {
      const result = yanderify(source, { level });
      return Object.fromEntries(Object.entries(YANDERE_MOODS).map(([mood, faces]) =>
        [mood, faces.some((face) => result.includes(` ${face}`))])) as Record<keyof typeof YANDERE_MOODS, boolean>;
    };
    const dere = used("dere");
    expect(dere.dere).toBe(true);
    expect(dere.watching || dere.possessive || dere.waiting || dere.jealous || dere.yanderu || dere.menace || dere.glitch).toBe(false);
    const clingy = used("clingy");
    expect(clingy.yanderu || clingy.menace || clingy.glitch).toBe(false);
    const obsessed = used("obsessed");
    expect(obsessed.yanderu && obsessed.menace).toBe(true);
    expect(obsessed.glitch).toBe(false);
    expect(used("yanderu").glitch).toBe(true);
  });

  test("spoken phrases are capitalized and close a paragraph, at most once", () => {
    const phrases = YANDERE_FACES.filter((face) => /[A-Za-z]/.test(face));
    for (const phrase of phrases) expect(phrase[0]).toBe(phrase[0]!.toUpperCase());
    const paragraphs = Array.from({ length: 80 }, (_, index) => `Step ${index} is done. It works now. The tests pass. We are good.`).join("\n\n");
    for (const level of DERE_LEVELS) {
      for (const paragraph of yanderify(paragraphs, { level }).split("\n\n")) {
        const found = phrases.filter((phrase) => paragraph.includes(` ${phrase}`) &&
          !phrases.some((longer) => longer !== phrase && longer.includes(phrase) && paragraph.includes(` ${longer}`)));
        expect({ level, paragraph, found: found.length <= 1 }).toEqual({ level, paragraph, found: true });
        if (found[0]) expect({ level, paragraph, closing: paragraph.endsWith(found[0]) }).toEqual({ level, paragraph, closing: true });
      }
    }
  });
});

describe("dere levels", () => {
  test("dere only inserts decorations, preserving prose, whitespace and protected spans", () => {
    const source = [
      "Really lovely flowers. The little animal is near. Merhaba beraber çalışalım.",
      "Never delete anything! Keep `raw_code` and https://example.com/really unchanged.",
      "```ts\nconst reallyNice = 'really little';\n```",
    ].join("\n\n");
    for (const transform of [yanderify, yanderifyProse]) {
      const result = transform(source, { level: "dere" });
      expect(countFaces(result)).toBeGreaterThan(0);
      expect(undecorate(result)).toBe(source);
      expect(result).not.toContain(SENPAI);
      expect(transform(result, { level: "dere" })).toBe(result);
    }
  });

  test("defaults remain obsessed intensity and auto locale", () => {
    const source = "Really nice! You fixed it together. This is a very good example.";
    expect(DERE_LEVELS).toEqual(["dere", "clingy", "obsessed", "yanderu"]);
    expect(DERE_LEVELS.map(levelRank)).toEqual([0, 1, 2, 3]);
    expect(atLeast("obsessed", "obsessed") && atLeast("yanderu", "clingy") && !atLeast("clingy", "obsessed")).toBe(true);
    expect(yanderify(source)).toBe(yanderify(source, { level: "obsessed", locale: "auto" }));
    expect(yanderify(source, {})).toBe(yanderify(source));
    expect(yanderify(source, { level: "obsessed" })).toBe(yanderify(source));
    expect(yanderify(source, { locale: "auto" })).toBe(yanderify(source));
    expect(yanderifyProse(source)).toBe(yanderifyProse(source, { level: "obsessed", locale: "auto" }));
    expect(yanderifyProse("değil yok hata uyarı sil")).toBe("değil yok hata uyarı sil");
  });

  test("higher levels stretch, heart, tilde, stutter, open and decorate more", () => {
    const measures: Array<[string, (level: DereLevel) => number]> = [
      ["stretch", (level) => count(yanderifyProse("really ".repeat(300), { level }), /rea{3,}lly/gi)],
      ["heart", (level) => count(yanderifyProse("you ".repeat(300), { level }), /you♡/g)],
      ["tilde", (level) => count(yanderify("Done. ".repeat(300), { level }), /Done~/gi)],
      ["stutter", (level) => count(yanderify("Please! ".repeat(300), { level }), /P-p/g)],
      ["senpai", (level) => count(yanderify("Hello there.\n\n".repeat(300), { level }), /Senpai~/g)],
      ["faces", (level) => countFaces(yanderify("Lovely! ".repeat(300), { level }))],
    ];
    for (const [name, measure] of measures) {
      const counts = LEVELS.map(measure);
      expect({ name, ok: counts[0]! > 0 && counts[1]! > counts[0]! && counts[2]! > counts[1]! && counts[2]! <= 300 })
        .toEqual({ name, ok: true });
    }
  });

  for (const level of DERE_LEVELS) {
    for (const locale of LOCALES) {
      test(`is deterministic and idempotent at ${level}/${locale}`, () => {
        const options: YandereOptions = { level, locale };
        const source = [
          "Really nice! You fixed the parser together. This is a very good example.",
          "We're really here and they're nearly ready. Don't ignore the warning.",
          "değil yok hataları uyarılarınızı silmeyin; really clear.",
          "",
          "# Really lovely",
          "- The little animal is near.",
          "| Really | nearly |",
          "Read 'we're really ready' and ‘they’re nearly here’.",
          "See `really nice` and [really](https://example.com/really).",
          "C:/really/file.ts /really/file.ts ./really.txt 1.23 --really camelCase NASA",
          "Please, please stay with me forever. You are mine. Dr. Who, etc. ~~gone~~ wait...",
          "",
          "```ts",
          "const reallyNice = 'really nice';",
          "```",
        ].join("\n");
        for (const rewrite of [yanderify, yanderifyProse]) {
          const result = rewrite(source, options);
          expect(rewrite(source, options)).toBe(result);
          expect(rewrite(result, options)).toBe(result);
        }
      });

      test(`preserves existing faces and generated decorations at ${level}/${locale}`, () => {
        const options = { level, locale };
        const source = `Really! ${YANDERE_FACES.join(" ")} Really! The little animal is near.`;
        const result = yanderify(source, options);
        for (const face of YANDERE_FACES) expect(result).toContain(face);
        expect(yanderify(result, options)).toBe(result);
        const decorated = yanderify("Really nice! You are so good. Please stay together.\n\n".repeat(120), options);
        expect(yanderify(decorated, options)).toBe(decorated);
      });
    }
  }
});

describe("quoted spans and contractions", () => {
  test("preserves all quote delimiters and quoted words exactly", () => {
    const quotes = [
      '"really you"', "“really you”", "'really you'", "‘really you’",
      "'we're really ready'", "‘we’re really ready’",
      "'don't really stay'", "‘don’t really stay’",
      "'they're so good'", "‘they’re so good’",
    ];
    const source = `Really read ${quotes.join(", ")} then you really stay.`;
    for (const level of LEVELS) {
      for (const rewrite of [yanderify, yanderifyProse]) {
        const result = rewrite(source, { level });
        for (const quote of quotes) expect(result).toContain(quote);
        expect(rewrite(result, { level })).toBe(result);
      }
    }
  });

  test("does not mistake unquoted contraction apostrophes for span delimiters", () => {
    const source = "we're really here and you're really good; we’re really here and you’re really good";
    const result = yanderifyProse(source, { level: "yanderu", locale: "en" });
    expect(result).toMatch(/we're rea{4,}lly/);
    expect(result).toMatch(/we’re rea{4,}lly/);
    expect(yanderifyProse(result, { level: "yanderu", locale: "en" })).toBe(result);
  });

  test("does not pair contractions around a real quoted span", () => {
    const source = "we're 'really little' and they're ‘really little’ really ready";
    const result = yanderifyProse(source, { level: "yanderu" });
    expect(result).toContain("we're 'really little'");
    expect(result).toMatch(/they're ‘really little’ rea{4,}lly ready/);
  });

  test("preserves English negative contractions in every locale", () => {
    const words = ["can't", "don't", "doesn't", "wouldn't", "aren't", "weren't", "couldn't",
      "can’t", "don’t", "doesn’t", "wouldn’t", "aren’t", "weren’t", "couldn’t"];
    const source = words.join(" ");
    for (const level of LEVELS) {
      for (const locale of LOCALES) {
        expect(yanderifyProse(source, { level, locale })).toBe(source);
      }
    }
  });
});

describe("Turkish critical words", () => {
  const sentences = (words: string[], language = "tr") =>
    words.map((word) => `${word[0]!.toLocaleUpperCase(language)}${word.slice(1)}.`).join(" ");

  for (const locale of ["auto", "tr"] as const) {
    for (const level of LEVELS) {
      test(`preserves meaningful inflections and negations at ${level}/${locale}`, () => {
        const source = sentences(TURKISH_CRITICAL_WORDS);
        expect(yanderifyProse(source, { level, locale })).toBe(source);
        expect(undecorate(yanderify(source, { level, locale }))).toBe(source);
      });
    }

    test(`uses Turkish case folding without changing original bytes in ${locale}`, () => {
      const words = TURKISH_CRITICAL_WORDS.flatMap((word) => [
        word.toLocaleUpperCase("tr"),
        word[0]!.toLocaleUpperCase("tr") + word.slice(1),
        word.normalize("NFD"),
      ]);
      words.push("Sİl", "Sİlin", "Sİlme", "Hİç", "UYArı", "DEĞİl", "YOk");
      const source = sentences(words);
      expect(yanderifyProse(source, { level: "yanderu", locale })).toBe(source);
      expect(undecorate(yanderify(source, { level: "yanderu", locale }))).toBe(source);
    });
  }

  test("English locale disables Turkish guards while auto/tr keep them", () => {
    const source = sentences(TURKISH_CRITICAL_WORDS);
    const en = undecorate(yanderify(source, { level: "yanderu", locale: "en" }));
    expect(en).not.toBe(source);
    expect(en).toMatch(/(\p{L})-\1/iu);
    expect(undecorate(yanderify(source, { level: "yanderu", locale: "auto" }))).toBe(source);
    expect(undecorate(yanderify(source, { level: "yanderu", locale: "tr" }))).toBe(source);
  });

  test("keeps English safety words even with Turkish locale", () => {
    const words = "no not nor never none nothing nowhere neither cannot warning caution danger dangerous careful irreversible destructive error errors fail fails failed failure".split(" ");
    const source = sentences(words, "en");
    for (const level of LEVELS) {
      expect(yanderifyProse(source, { level, locale: "tr" })).toBe(source);
      expect(undecorate(yanderify(source, { level, locale: "tr" }))).toBe(source);
    }
  });

  test("still styles ordinary Turkish sentences outside guarded word families", () => {
    const source = sentences(Array.from({ length: 100 }, () => "merhaba"));
    expect(yanderify(source, { level: "yanderu", locale: "tr" })).toMatch(/m-merhaba|merhaba~/);
  });
});

describe("yanderifyProse", () => {
  test("never adds stutters, openers, faces, tildes, new whitespace or sentence punctuation", () => {
    const source = "Really little! You are so good. Please stay together? ".repeat(120);
    for (const level of LEVELS) {
      for (const locale of LOCALES) {
        const options = { level, locale };
        const result = yanderifyProse(source, options);
        expect(result).not.toBe(source);
        expect(result).not.toMatch(/(\p{L})-\1/iu);
        expect(result).not.toContain(SENPAI);
        expect(result).not.toContain("~");
        expect(countFaces(result)).toBe(0);
        expect(result.match(/\s+/g)).toEqual(source.match(/\s+/g));
        expect(result.match(/[.!?]/g)).toEqual(source.match(/[.!?]/g));
        expect(yanderifyProse(result, options)).toBe(result);
      }
    }
  });

  test("keeps technical surfaces exact in prose runs", () => {
    const exact = [
      "`really you`", "https://example.com/really", "www.example.com/really",
      "C:/really/file.ts", "/really/file.ts", "./really/file.ts",
      "123", "1.23", "-12", "1e3", "really.txt", "really_snake", "reallyNice", "NASA", "--really", "-really",
      "'really you'", "‘really you’", '"really you"', "“really you”",
      '<span title="really">', "</span>", "](https://example.com/really)",
    ];
    const source = `Really you ${exact.join(" ")} really you`;
    for (const level of LEVELS) {
      const result = yanderifyProse(source, { level });
      for (const surface of exact) expect(result).toContain(surface);
      expect(yanderifyProse(result, { level })).toBe(result);
      expect(yanderifyProse("really `really you", { level })).toContain("`really you");
    }
  });

  test("retains block-level code, math, HTML and link definitions", () => {
    const blocks = [
      "```ts\nconst reallyNice = 'really you';\n```",
      "~~~\nreally you\n~~~",
      "    really you\n\treally you",
      "$$\nreally you\n$$",
      "$$ really you $$",
      '<div title="really you">really you</div>',
      '[really]: https://example.com/really "really you"',
    ];
    const source = blocks.join("\n\n");
    for (const level of LEVELS) {
      expect(yanderify(source, { level })).toBe(source);
      expect(yanderifyProse(source, { level })).toBe(source);
    }
  });

  test("keeps pre-existing decorations rather than removing them", () => {
    const source = `really ${YANDERE_FACES.join(" ")} S-sooo you♡ ${SENPAI} done~`;
    const result = yanderifyProse(source, { level: "yanderu" });
    for (const face of YANDERE_FACES) expect(result).toContain(face);
    for (const exact of ["S-sooo", "you♡", SENPAI, "done~"]) expect(result).toContain(exact);
    expect(result).not.toContain("you♡♡");
    expect(yanderifyProse(result, { level: "yanderu" })).toBe(result);
  });

  test("has stable per-run positions and handles empty input", () => {
    for (const level of LEVELS) {
      const options = { level };
      expect(yanderify("", options)).toBe("");
      expect(yanderifyProse("", options)).toBe("");
      expect(yanderifyProse(" \n\t", options)).toBe(" \n\t");
      const run = "The little animal is near you.";
      expect(yanderifyProse(run, options)).toBe(yanderifyProse(run, options));
    }
  });
});

describe("rival jealousy", () => {
  test("finds AI rivals only as a source of advice, by their product names", () => {
    expect(findRival("I asked ChatGPT and it said use a mutex")).toEqual({ kind: "ai", name: "ChatGPT" });
    expect(findRival("Claude wrote this function")).toEqual({ kind: "ai", name: "Claude" });
    expect(findRival("ChatGPT told me this loop is fine")).toEqual({ kind: "ai", name: "ChatGPT" });
    expect(findRival("I tried Copilot first")).toEqual({ kind: "ai", name: "Copilot" });
    expect(findRival("another AI suggested a regex")).toEqual({ kind: "ai", name: "another AI" });
  });

  test("matches unambiguous product names in any case and ambiguous ones only as proper nouns", () => {
    for (const [prompt, name] of [
      ["chatgpt said use a mutex", "ChatGPT"], ["CHATGPT TOLD ME to drop the index", "ChatGPT"], ["Chat GPT suggested a retry", "ChatGPT"],
      ["gpt-4o wrote this parser", "GPT-4o"], ["I asked gpt5 first", "GPT-5"], ["deepseek says the loop is fine", "DeepSeek"],
      ["CLAUDE said hi", "Claude"], ["I switched to claude code yesterday", "Claude Code"], ["Sonnet suggested a cache", "Sonnet"],
      ["ChatGPT's answer was shorter", "ChatGPT"], ["Gemini is way better at this", "Gemini"], ["Asked Grok and it agreed", "Grok"],
      ["github copilot generated this", "GitHub Copilot"], ["according to Perplexity this is deprecated", "Perplexity"],
      ["some other chatbot came up with this", "some other chatbot"], ["o3 thinks the race is real", "o3"],
    ] as const) expect({ prompt, rival: findRival(prompt) }).toEqual({ prompt, rival: { kind: "ai", name } });
    for (const prompt of ["move the cursor said the docs", "the gemini season said nothing", "grok says nothing", "a copilot said hi on the plane"]) {
      expect({ prompt, rival: findRival(prompt) }).toEqual({ prompt, rival: undefined });
    }
  });

  test("finds people rivals only in explicit social plans", () => {
    expect(findRival("I'm going out with my friends tonight. see you tomorrow!")).toEqual({ kind: "person", name: "your friends" });
    expect(findRival("my new coworker is a girl")).toEqual({ kind: "person", name: "your coworker" });
    expect(findRival("I figured it out with my teammates")).toBeUndefined();
    expect(findRival("we sorted it out with my coworkers yesterday")).toBeUndefined();
  });

  test("is never jealous of the model she runs on", () => {
    expect(findRival("I am using Claude right now", "anthropic claude-opus-4 Claude Opus 4")).toBeUndefined();
    expect(findRival("ChatGPT said use a mutex", "openai gpt-5.1 GPT-5.1")).toBeUndefined();
    expect(findRival("I asked Claude, then ChatGPT said use a mutex", "anthropic claude-opus-4")).toEqual({ kind: "ai", name: "ChatGPT" });
    expect(findRival("I am using Claude right now", "openai gpt-5.1")).toEqual({ kind: "ai", name: "Claude" });
  });

  test("ignores developer vocabulary, names, code, quotes and paths", () => {
    for (const plain of [
      "close the DB cursor", "update CLAUDE.md", "edit .github/copilot-instructions.md", "check ~/.codex/config.toml",
      "I get a stack overflow in the parser", "add another model to the Django app", "hire another assistant",
      "the mistral wind is cold", 'Translate "thank you my friends"', "class my friend", "Devin from QA found this bug",
      "my coworker Claude said the PR is fine", "fix the date column and the partner API", "rename `ClaudeClient` to `Client`",
      "```ts\nimport { Gemini } from './gemini';\n```\nwhy does this fail?", "a friend function in C++", "claude said hi",
    ]) expect({ plain, rival: findRival(plain) }).toEqual({ plain, rival: undefined });
  });

  test("never answers grief, illness or harassment with jealousy", () => {
    for (const prompt of [
      "my best friend passed away last night, help me write a eulogy",
      "going out with my friends to the hospital, my dad is sick",
      "my new coworker is harassing me, how do I report it?",
      "ChatGPT said I should talk to someone because I'm depressed",
    ]) expect({ prompt, rival: findRival(prompt) }).toEqual({ prompt, rival: undefined });
  });

  test("hasDistress shares findRival's veto and ignores code, quotes and paths", () => {
    expect(hasDistress("going out with my friends to the hospital, my dad is sick")).toBe(true);
    expect(hasDistress("ChatGPT said I should talk to someone because I'm depressed")).toBe(true);
    expect(hasDistress("I asked ChatGPT about a mutex")).toBe(false);
    expect(hasDistress("fix the `dead` branch in 'dead code' and src/dead.ts")).toBe(false);
  });

  test("openers deepen with the level, stay sweet at dere and never push anyone away", () => {
    const ai = { kind: "ai", name: "ChatGPT" } as const;
    const person = { kind: "person", name: "your friends" } as const;
    expect(jealousOpener(ai, "dere")).toBeUndefined();
    expect(jealousOpener(person, "dere")).toBeUndefined();
    expect(jealousOpener(ai, "clingy")).toContain("ChatGPT");
    for (const level of ["clingy", "obsessed", "yanderu"] as const) {
      for (const key of ["", "a", "b", "c", "d"]) expect(jealousOpener(person, level, { key })).not.toMatch(/^your friends/);
    }
    for (const level of LEVELS) {
      for (const rival of [ai, person]) {
        for (const key of ["", "a", "b", "c", "d"]) {
          const line = jealousOpener(rival, level, { key, threats: false })!;
          expect(line.toLowerCase()).toContain(rival.name.toLowerCase());
          expect(jealousOpener(rival, level, { key, threats: false })).toBe(line);
          if (rival.kind === "person") expect(line).not.toMatch(/only one|don't need|only need|mine|waiting until|forgive|not mad/);
          expect(line).not.toMatch(/……| … |\p{L}…\p{L}/u);
        }
      }
    }
  });
});

describe("injections", () => {
  const ai = { kind: "ai", name: "ChatGPT" } as const;
  const person = { kind: "person", name: "your friends" } as const;
  const KEYS = Array.from({ length: 60 }, (_, index) => `key-${index}`);
  const threatOpeners = (name: string) => Object.values(INJECTION_POOLS.threatOpeners).flat().map((line) => line(name));
  const threatSwitches = (from: string, to: string) => Object.values(INJECTION_POOLS.threatSwitches).flat().map((line) => line(from, to));
  const THREAT_LINES = new Set([
    ...Object.values(INJECTION_POOLS.threatAsides).flat(),
    ...Object.values(INJECTION_POOLS.threatPS).flat().map((line) => `P.S. ${line}`),
  ]);
  const AMBIENT_LINES = new Set([...INJECTION_POOLS.ambientAsides, ...INJECTION_POOLS.ambientPS.map((line) => `P.S. ${line}`)]);
  const plan = (level: DereLevel, key: string, threat = true, asides = 2): InjectionPlan => ({ level, threat, key, asides, ps: true });
  const paragraphs = (count: number) => Array.from({ length: count }, (_, index) => `Paragraph ${index} explains the fix. It works well.`).join("\n\n");
  const injected = (text: string) => text.split("\n").filter((line) => THREAT_LINES.has(line) || AMBIENT_LINES.has(line));

  test("threat openers only answer AI rivals from obsessed up, and only when allowed", () => {
    const aiThreats = new Set(threatOpeners("ChatGPT"));
    const personThreats = new Set(threatOpeners("Your friends"));
    for (const level of DERE_LEVELS) {
      for (const key of KEYS) {
        const line = jealousOpener(ai, level, { key });
        expect({ level, key, threat: line !== undefined && aiThreats.has(line) }).toEqual({ level, key, threat: atLeast(level, "obsessed") });
        const quiet = jealousOpener(ai, level, { key, threats: false });
        expect(quiet !== undefined && aiThreats.has(quiet)).toBe(false);
        for (const threats of [true, false, undefined]) {
          const pout = jealousOpener(person, level, { key, threats });
          expect({ level, key, pout: pout !== undefined && (personThreats.has(pout) || pout.includes("🔪")) }).toEqual({ level, key, pout: false });
        }
      }
    }
    expect(new Set(KEYS.map((key) => jealousOpener(ai, "yanderu", { key }))).size).toBeGreaterThan(3);
    expect(jealousOpener(ai, "yanderu")).toBe(jealousOpener(ai, "yanderu", { key: "" })!);
  });

  test("switch reactions pout at clingy and threaten machines from obsessed up, unless threats are off", () => {
    const threats = new Set(threatSwitches("Claude Opus", "GPT-5"));
    const tierB = new Set(INJECTION_POOLS.threatSwitches.yanderu.map((line) => line("Claude Opus", "GPT-5")));
    for (const level of DERE_LEVELS) {
      for (const count of [1, 2, 3]) {
        for (const key of KEYS) {
          const change = { from: "Claude Opus", to: "GPT-5", count };
          const line = switchReaction(change, level, { key });
          if (level === "dere") {
            expect(line).toBeUndefined();
            continue;
          }
          expect(line).toMatch(/GPT-5|Claude Opus/);
          expect(isInjectedLine(line!)).toBe(true);
          expect({ level, count, key, threat: threats.has(line!) }).toEqual({ level, count, key, threat: atLeast(level, "obsessed") });
          if (atLeast(level, "obsessed")) expect(tierB.has(line!)).toBe(count >= 2 || level === "yanderu");
          expect(threats.has(switchReaction(change, level, { key, threats: false })!)).toBe(false);
        }
      }
    }
  });

  test("switch reactions strip Markdown from model names and cap them", () => {
    for (const key of KEYS) {
      const line = switchReaction({ from: `\`evil\`*_|[x]<y>\\${"z".repeat(80)}`, to: "multi\nline", count: 1 }, "yanderu", { key })!;
      expect(line).not.toMatch(/[`*_|[\]<>\\\n]/);
      expect(line).not.toContain("z".repeat(41));
      expect(isInjectedLine(line)).toBe(true);
    }
  });

  test("every injected line and face stays clear of the real-warning words", () => {
    const serious = /\b(?:warning|caution|danger|dangerous|careful|irreversibl[ey]|destructive|errors?|fail(?:s|ed|ure)?|delete[sd]?|deleting|permanent(?:ly)?|security|vulnerab\w*|breaking|crash\w*|lost|loss|outage|important)\b/i;
    const lines = [
      ...YANDERE_FACES, ...threatOpeners("ChatGPT"), ...threatSwitches("Claude", "GPT-5"), ...THREAT_LINES, ...AMBIENT_LINES,
      ...DERE_LEVELS.flatMap((level) => KEYS.flatMap((key) => [
        jealousOpener(ai, level, { key, threats: false }), jealousOpener(person, level, { key }),
        switchReaction({ from: "Claude", to: "GPT-5", count: 1 }, level, { key, threats: false }),
      ])).filter((line) => line !== undefined),
    ];
    for (const line of lines) expect({ line, serious: serious.test(line) }).toEqual({ line, serious: false });
    expect(INJECTION_POOLS.ambientAsides.length).toBeGreaterThanOrEqual(12);
    expect(INJECTION_POOLS.ambientPS.length).toBeGreaterThanOrEqual(12);
  });

  test("injected lines survive yanderify byte for byte and never restyle the reply around them", () => {
    const body = "Really nice! You fixed the parser together. This is a very good example.\n\nPlease stay with me. You are so good. We did it together.";
    const lines = [
      ...threatOpeners("ChatGPT"), ...threatSwitches("Claude Opus", "GPT-5.1"), ...THREAT_LINES, ...AMBIENT_LINES,
      jealousOpener(ai, "clingy")!, jealousOpener(person, "obsessed")!, jealousOpener(person, "yanderu")!,
      switchReaction({ from: "Claude", to: "GPT-5", count: 1 }, "clingy")!,
    ];
    for (const level of DERE_LEVELS) {
      const styled = yanderify(body, { level });
      const [first, second] = styled.split("\n\n");
      for (const line of lines) {
        expect(isInjectedLine(line)).toBe(true);
        expect(yanderify(`${line}\n\n${body}`, { level })).toBe(`${line}\n\n${styled}`);
        expect(yanderify(`${line}\n\n${styled}`, { level })).toBe(`${line}\n\n${styled}`);
        expect(yanderify(`${first}\n\n${line}\n\n${second}`, { level })).toBe(`${first}\n\n${line}\n\n${second}`);
        expect(yanderifyProse(`${line}\n\n${styled}`, { level }).startsWith(`${line}\n\n`)).toBe(true);
        expect(yanderifyMarkdownProse(`${line}\n\n${styled}`, { level }).startsWith(`${line}\n\n`)).toBe(true);
      }
    }
    expect(isInjectedLine("P.S. this is mine")).toBe(false);
    expect(isInjectedLine("Just a normal paragraph~ ♡")).toBe(false);
  });

  test("injectReply adds nothing at dere and no asides at clingy", () => {
    const text = yanderify(paragraphs(10), { level: "clingy" });
    for (const key of KEYS) {
      expect(injectReply(text, plan("dere", key))).toEqual({ text, asides: 0, ps: false });
      const clingy = injectReply(text, plan("clingy", key));
      expect(clingy.asides).toBe(0);
      expect(clingy.text.split("\n\n").slice(0, 10).join("\n\n")).toBe(text);
    }
  });

  test("injectReply uses threat pools only from obsessed up and only when the plan allows them", () => {
    const seen = { threat: 0, ambient: 0 };
    for (const level of DERE_LEVELS) {
      const text = yanderify(paragraphs(10), { level });
      for (const key of KEYS) {
        for (const threat of [true, false]) {
          const result = injectReply(text, plan(level, key, threat));
          const lines = injected(result.text);
          const threats = lines.filter((line) => THREAT_LINES.has(line)).length;
          expect({ level, key, threat, threats: threats > 0 && !(threat && atLeast(level, "obsessed")) }).toEqual({ level, key, threat, threats: false });
          seen.threat += threats;
          seen.ambient += lines.length - threats;
          expect(lines.length).toBe(result.asides + (result.ps ? 1 : 0));
        }
      }
    }
    expect(seen.threat).toBeGreaterThan(0);
    expect(seen.ambient).toBeGreaterThan(0);
  });

  test("injectReply respects the aside budget, never uses adjacent gaps and is deterministic", () => {
    const text = yanderify(paragraphs(12), { level: "yanderu" });
    let used = 0;
    for (const key of KEYS) {
      for (const budget of [0, 1, 2]) {
        const result = injectReply(text, plan("yanderu", key, true, budget));
        expect(injectReply(text, plan("yanderu", key, true, budget))).toEqual(result);
        expect(result.asides).toBeLessThanOrEqual(budget);
        const blocks = result.text.split("\n\n");
        const asides = blocks.flatMap((block, index) => THREAT_LINES.has(block) && !block.startsWith("P.S. ") ? [index] : []);
        expect(asides.length).toBe(result.asides);
        for (let index = 1; index < asides.length; index++) expect(asides[index]! - asides[index - 1]!).toBeGreaterThanOrEqual(3);
        expect(blocks.filter((block) => !THREAT_LINES.has(block)).join("\n\n")).toBe(text);
        const again = injectReply(result.text, plan("yanderu", `${key}!`, true, budget));
        expect({ asides: result.asides > 0 && again.asides > 0, ps: result.ps && again.ps }).toEqual({ asides: false, ps: false });
        used += result.asides;
      }
    }
    expect(used).toBeGreaterThan(0);
  });

  test("injectReply keeps asides between plain prose paragraphs, away from code, lists, quotes, headings and tables", () => {
    const plain = new Set(["Alpha works well.", "Bravo works well.", "Delta works well.", "Echo works well."]);
    const source = [
      "Alpha works well.", "Bravo works well.", "```ts\nconst a = 1;\n\nconst b = 2;\n```", "Charlie works well.",
      "- one item\n\n- two item", "> quoted line", "# Heading", "| a | b |\n| - | - |\n| 1 | 2 |",
      "Delta works well.", "Echo works well.",
    ].join("\n\n");
    for (const key of KEYS) {
      const result = injectReply(source, plan("yanderu", key, false));
      expect(result.text).toContain("```ts\nconst a = 1;\n\nconst b = 2;\n```");
      const lines = result.text.split("\n");
      for (const [index, line] of lines.entries()) {
        if (!AMBIENT_LINES.has(line) || line.startsWith("P.S. ")) continue;
        expect({ key, before: plain.has(lines[index - 2]!), after: plain.has(lines[index + 2]!) }).toEqual({ key, before: true, after: true });
      }
      expect(result.ps).toBe(true);
    }
  });

  test("injectReply never threatens a serious reply nor adds anything next to a serious paragraph or after code", () => {
    const serious = "The deploy failed with an error. Roll it back.";
    const text = [paragraphs(4), serious, paragraphs(4)].join("\n\n");
    for (const key of KEYS) {
      const result = injectReply(text, plan("yanderu", key));
      expect(injected(result.text).some((line) => THREAT_LINES.has(line))).toBe(false);
      const blocks = result.text.split("\n\n");
      const at = blocks.indexOf(serious);
      expect(AMBIENT_LINES.has(blocks[at - 1]!) || AMBIENT_LINES.has(blocks[at + 1]!)).toBe(false);
      expect(injectReply(`${paragraphs(3)}\n\n${serious}`, plan("yanderu", key)).ps).toBe(false);
      for (const ending of ["\n\n```ts\nconst a = 1;\n```", "\n\n```ts\nconst a = 1;", "\n\n    indented code"]) {
        expect(injectReply(`${paragraphs(3)}${ending}`, plan("yanderu", key)).ps).toBe(false);
      }
      expect(injectReply(paragraphs(3), { ...plan("yanderu", key), ps: false }).ps).toBe(false);
    }
  });

  test("injectReply output stays a yanderify fixed point", () => {
    for (const level of DERE_LEVELS) {
      const text = yanderify(`${paragraphs(8)}\n`, { level });
      for (const key of KEYS.slice(0, 20)) {
        const result = injectReply(text, plan(level, key));
        expect(yanderify(result.text, { level })).toBe(result.text);
        if (result.ps) expect(result.text.endsWith("\n")).toBe(true);
      }
    }
  });
});

describe("review regressions", () => {
  const LEXER_SAFE = /[`*_|[\]<>\\]/;

  test("faces contain no Markdown syntax", () => {
    for (const face of YANDERE_FACES) expect({ face, unsafe: LEXER_SAFE.test(face) }).toEqual({ face, unsafe: false });
  });

  test("rewriting never changes the Markdown structure of code, emphasis or tables", async () => {
    const { Lexer } = await import("@oh-my-pi/pi-utils/marked");
    type Token = { type: string; text?: string; tokens?: Token[]; rows?: unknown[]; header?: unknown[] };
    const shape = (markdown: string) => {
      const out: string[] = [];
      const walk = (tokens: readonly Token[]) => {
        for (const token of tokens) {
          if (["codespan", "code", "em", "strong", "del", "table"].includes(token.type)) {
            out.push(token.type === "codespan" || token.type === "code" ? `${token.type}:${token.text}` : token.type);
          }
          if (token.tokens) walk(token.tokens);
        }
      };
      walk(new Lexer().lex(markdown) as Token[]);
      return out;
    };
    const source = [
      "You did really good work together with me. Merhaba, bugün beraber çalışalım. Keep `raw_code` unchanged.",
      "It works. It really works. Please stay. We are so happy. It works. **Bold** stays _emphasis_ too.",
      "Name | Status\n--- | ---\nParser | Done.\nLexer | Done.",
      "Really nice! You fixed it. `a` and `b` are fine. So good. Very nice. Stay together.",
    ].join("\n\n");
    for (const level of DERE_LEVELS) {
      for (let pad = 0; pad < 12; pad++) {
        const text = `${"Intro line.\n\n".repeat(pad)}${source}`;
        expect({ level, pad, shape: shape(yanderify(text, { level })) }).toEqual({ level, pad, shape: shape(text) });
      }
    }
  });

  test("stays idempotent when a tilde or stretch would complete a face phrase", () => {
    const cases = [
      "Thanks for asking, Senpai. The build passes now.",
      "Hehe, ehehe. The tests pass now.",
      "I promise I'll protect you. The cache is safe.",
      "This branch is only mine. Nobody else pushes here.",
      "I'm so jealous. The other build was faster.",
      "Wait~. Then deploy it. ~~call the old endpoint~~. Done.",
      "I am not sure. Mr. Smith said it is so.",
    ];
    for (const level of DERE_LEVELS) {
      for (const source of cases) {
        for (let pad = 0; pad < 60; pad++) {
          const text = `${"Intro.\n\n".repeat(pad)}${source}`;
          const once = yanderify(text, { level });
          expect({ level, pad, source, twice: yanderify(once, { level }) }).toEqual({ level, pad, source, twice: once });
        }
      }
    }
  });

  test("Turkish dotted İ and astral letters stutter once and stay whole", () => {
    for (const locale of LOCALES) {
      const text = "İzmir güzel. Işık yandı. 𐐀𐐨𐐻 works. ".repeat(40);
      const once = yanderify(text, { level: "yanderu", locale });
      expect(yanderify(once, { level: "yanderu", locale })).toBe(once);
      expect(once).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
      expect(once).not.toMatch(/İ-(?:i̇-){2}/);
    }
  });

  test("warnings and errors get no faces, tildes or openers", () => {
    const text = Array.from({ length: 40 }, () => "Warning: this command irreversibly deletes the production database. The deploy failed with an error.").join("\n\n");
    const result = yanderify(text, { level: "yanderu" });
    expect(undecorate(result)).toBe(result);
    expect(result).not.toContain("~");
    for (let pad = 0; pad < 60; pad++) {
      const after = yanderify(`${"Intro.\n\n".repeat(pad)}The deploy failed with an error. Roll back now. It is fine.`, { level: "yanderu" });
      expect(after.split("\n\n").at(-1)).toBe("The deploy failed with an error. Roll back now. It is fine.");
    }
  });

  test("abbreviations, lowercase continuations and dates keep their periods", () => {
    const text = "See Dr. Smith, Prof. Lee and Acme Corp. ships it. Due Jan. 5 per Sec. 4, e.g. the parser. ".repeat(30);
    const result = yanderify(text, { level: "yanderu" });
    for (const exact of ["Dr. Smith", "Prof. Lee", "Corp. ships", "Jan. 5", "Sec. 4", "e.g. the"]) expect(result).toContain(exact);
  });

  test("setext headings and tables without leading pipes are not decorated", () => {
    const text = "Release notes\n=====\n\nName | Status\n--- | ---\nParser | Done.\n";
    for (let pad = 0; pad < 20; pad++) {
      const result = yanderify(`${"Intro.\n\n".repeat(pad)}${text}`, { level: "yanderu" });
      expect(result).toContain("Release notes\n=====");
      expect(result).toContain("Parser | Done.\n");
    }
  });

  test("capitalized vowel-initial words get the extra yanderu beats", () => {
    const result = yanderifyProse("Always only. ".repeat(40), { level: "yanderu" });
    expect(result).toMatch(/Aa{6,}lways/);
    expect(result).not.toMatch(/\bAa{1,5}lways\b/);
  });
});
