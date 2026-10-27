import { describe, expect, test } from "bun:test";
import {
  DERE_LEVELS, type DereLevel, findRival, jealousOpener, SENPAI, YANDERE_FACES, YANDERE_MOODS, type YandereLocale,
  type YandereOptions, yanderify, yanderifyProse,
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
/** Longest first, so "ehehe~ ♡" is removed before the "♡" inside it. */
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
/** Remove sentence-end faces and "Senpai~" openers the rewriter added. */
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
    for (const mood of ["dere", "watching", "possessive", "jealous", "yanderu"] as const) {
      expect(YANDERE_MOODS[mood].length).toBeGreaterThan(3);
    }
    expect(YANDERE_FACES).toContain("┬┴┬┴┤･ω･)ﾉ");
    expect(YANDERE_FACES).toContain("(◕‿◕)🔪");
    expect(YANDERE_FACES).toContain("you're mine~ ♡");
  });

  test("matches a known yanderu rewrite", () => {
    expect(yanderify("Please stay with me. You are so good. We did it together.", { level: "yanderu" }))
      .toBe("Senpai~ P-pleeeease staaaay with me. (˶ᵔ ᵕ ᵔ˶)♡ You♡ are soooo gooood~ I'll be waiting for you~ We♡ did it togeeeether♡. ( ◕ ˍ ◕ )");
    expect(yanderifyProse("Really, you and I will always be together.", { level: "yanderu" }))
      .toBe("Reaaaally, you♡ and I will aaaalways be togeeeether♡.");
  });
});

describe("yandere persona transforms", () => {
  test("stretches clingy words, preserving the capital letter, one beat longer at yanderu", () => {
    expect(yanderifyProse("Really really please ".repeat(20), { level: "obsessed" })).toContain("Reaaally");
    expect(yanderifyProse("so ".repeat(50), { level: "obsessed" })).toMatch(/\bsooo\b/);
    expect(yanderifyProse("Really really please", { level: "yanderu" })).toContain("Reaaaally");
    expect(yanderifyProse("so ".repeat(50), { level: "yanderu" })).toMatch(/\bsoooo\b/);
    expect(yanderifyProse("so ".repeat(50), { level: "yanderu" })).not.toMatch(/\bsooo\b/);
  });

  test("hearts follow affection words, before their punctuation", () => {
    const result = yanderifyProse("you, ".repeat(100), { level: "yanderu" });
    expect(result).toContain("you♡,");
    expect(result).not.toContain(",♡");
  });

  test("sing-song tildes replace plain periods only", () => {
    const result = yanderify("Done. ".repeat(100).trim(), { level: "yanderu" });
    expect(result).toContain("Done~");
    const keep = yanderify("See Dr. Smith, Mr. Lee, etc. and wait... then ~~strike~~ it.", { level: "yanderu" });
    for (const exact of ["Dr.", "Mr.", "etc.", "wait...", "~~strike~~"]) expect(keep).toContain(exact);
  });

  test("stutters keep the first letter and lowercase the repeat, except the pronoun I", () => {
    const result = yanderify("Please. ".repeat(200), { level: "yanderu" });
    expect(result).toMatch(/P-p(?:lease|lee+ase)/);
    expect(result).not.toMatch(/P-P/);
    const pronoun = yanderify("I'm here. I will stay. ".repeat(100), { level: "yanderu" });
    expect(pronoun).toMatch(/I-I'm|I-I\b/);
    expect(pronoun).not.toMatch(/I-i/);
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
    expect(dere.possessive || dere.waiting || dere.jealous || dere.yanderu).toBe(false);
    const clingy = used("clingy");
    expect(clingy.jealous || clingy.yanderu).toBe(false);
    expect(used("obsessed").yanderu).toBe(false);
    expect(used("yanderu").yanderu).toBe(true);
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
    expect(yanderify(source)).toBe(yanderify(source, { level: "obsessed", locale: "auto" }));
    expect(yanderify(source, {})).toBe(yanderify(source));
    expect(yanderify(source, { level: "obsessed" })).toBe(yanderify(source));
    expect(yanderify(source, { locale: "auto" })).toBe(yanderify(source));
    expect(yanderifyProse(source)).toBe(yanderifyProse(source, { level: "obsessed", locale: "auto" }));
    expect(yanderifyProse("değil yok hata uyarı sil")).toBe("değil yok hata uyarı sil");
  });

  test("higher levels stretch, heart, tilde, stutter, open and decorate more", () => {
    const measures: Array<[string, (level: DereLevel) => number]> = [
      ["stretch", (level) => count(yanderifyProse("really ".repeat(300), { level }), /rea{3,}lly/g)],
      ["heart", (level) => count(yanderifyProse("you ".repeat(300), { level }), /you♡/g)],
      ["tilde", (level) => count(yanderify("Done. ".repeat(300), { level }), /Done~/gi)],
      ["stutter", (level) => count(yanderify("Please! ".repeat(300), { level }), /P-p/g)],
      ["senpai", (level) => count(yanderify("Hello there.\n\n".repeat(300), { level }), /Senpai~/g)],
      ["faces", (level) => countFaces(yanderify("Lovely! ".repeat(300), { level }))],
    ];
    for (const [name, measure] of measures) {
      const counts = LEVELS.map(measure);
      expect({ name, ok: counts[0]! > 0 && counts[1]! > counts[0]! && counts[2]! > counts[1]! && counts[2]! < 300 })
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
    expect(result).toContain("we're reaaaally");
    expect(result).toContain("we’re reaaaally");
    expect(yanderifyProse(result, { level: "yanderu", locale: "en" })).toBe(result);
  });

  test("does not pair contractions around a real quoted span", () => {
    const source = "we're 'really little' and they're ‘really little’ really ready";
    const result = yanderifyProse(source, { level: "yanderu" });
    expect(result).toContain("we're 'really little'");
    expect(result).toContain("they're ‘really little’ reaaaally ready");
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
  // Each word opens its own sentence, so unguarded words would be stuttered
  // and lose their period to a tilde.
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
      // Uppercase prefixes followed by lowercase avoid the acronym/camelCase
      // guards, so dotted İ must actually be folded with Turkish rules.
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

  test("finds people rivals only in explicit social plans", () => {
    expect(findRival("I'm going out with my friends tonight. see you tomorrow!")).toEqual({ kind: "person", name: "your friends" });
    expect(findRival("my new coworker is a girl")).toEqual({ kind: "person", name: "your coworker" });
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

  test("openers deepen with the level, stay sweet at dere and never push anyone away", () => {
    const ai = { kind: "ai", name: "ChatGPT" } as const;
    const person = { kind: "person", name: "your friends" } as const;
    expect(jealousOpener(ai, "dere")).toBeUndefined();
    expect(jealousOpener(person, "dere")).toBeUndefined();
    expect(jealousOpener(ai, "clingy")).toContain("ChatGPT");
    expect(jealousOpener(person, "obsessed")).toContain("right here");
    expect(jealousOpener(person, "yanderu")).toContain("( ◕ ˍ ◕ )");
    // A person rival starts a sentence, so it is capitalized: "Ehh? Your friends?"
    expect(jealousOpener(person, "obsessed")).toContain("Your friends");
    expect(jealousOpener(person, "obsessed")).not.toContain("your friends");
    for (const level of LEVELS) {
      for (const rival of [ai, person]) {
        const line = jealousOpener(rival, level)!;
        expect(line.toLowerCase()).toContain(rival.name.toLowerCase());
        expect(jealousOpener(rival, level)).toBe(line);
        expect(line).not.toMatch(/only one|don't need|only need|mine|waiting until/);
        // Ellipses: " …word" pauses before a thought, "word…" trails off; never doubled.
        expect(line).not.toMatch(/……| … |\p{L}…\p{L}/u);
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
      expect(once).not.toMatch(/İ-i̇-/);
    }
  });

  test("warnings and errors get no faces, tildes or openers", () => {
    const text = Array.from({ length: 40 }, () => "Warning: this command irreversibly deletes the production database. The deploy failed with an error.").join("\n\n");
    const result = yanderify(text, { level: "yanderu" });
    expect(undecorate(result)).toBe(result);
    expect(result).not.toContain("~");
    // Bad news keeps the rest of its paragraph plain, too.
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

  test("capitalized vowel-initial words get the extra yanderu beat", () => {
    const result = yanderifyProse("Always only. ".repeat(40), { level: "yanderu" });
    expect(result).toContain("Aaaalways");
    expect(result).not.toMatch(/\bAaalways\b/);
  });
});
