import { describe, expect, test } from "bun:test";
import { DERE_LEVELS } from "../src/yandere.ts";
import { buildHero, buildObsessionChart, buildStyleMap, CORPUS, MEDIA, measureLevel, technicalSpans } from "./readme-assets";

const panels = [
  ["readme-hero.svg", buildHero, 300],
  ["obsession-levels.svg", buildObsessionChart, 470],
  ["style-map.svg", buildStyleMap, 340],
] as const;

describe("README artwork", () => {
  for (const [name, build, height] of panels) {
    test(`${name} is deterministic, accessible, self-contained and current`, async () => {
      const svg = build();
      expect(build()).toBe(svg);
      expect(svg).toContain(`viewBox="0 0 960 ${height}"`);
      expect(svg).toContain('role="img" aria-labelledby="title desc"');
      expect(svg).toMatch(/<title id="title">[^<]+<\/title>/);
      expect(svg).toMatch(/<desc id="desc">[^<]+<\/desc>/);
      expect(svg).not.toMatch(/<script|<foreignObject|<image|(?:href|src)=|@import|@font-face/i);
      expect(await Bun.file(new URL(name, MEDIA)).text()).toBe(svg);
    });
  }

  test("hero keeps the senpai tagline", () => {
    expect(buildHero()).toContain("Your coding agent, but it's obsessed with you, senpai~ ♡");
  });

  test("the obsession chart is measured from the real rewriter, rising with the level", () => {
    const measures = DERE_LEVELS.map((level) => measureLevel(level));
    expect(technicalSpans(CORPUS).length).toBeGreaterThan(5);
    for (const m of measures) expect(m.exact).toBe(true);
    // dere only decorates sentence ends; every other mark needs a stronger level.
    expect(measures[0]!.marks).toEqual({ ...measures[0]!.marks, senpai: 0, hearts: 0, stretches: 0, tildes: 0, stutters: 0 });
    for (let index = 1; index < measures.length; index++) {
      expect(measures[index]!.perHundred).toBeGreaterThan(measures[index - 1]!.perHundred);
    }
    const svg = buildObsessionChart(measures);
    for (const m of measures) {
      expect(svg).toContain(`>${m.perHundred}</text>`);
      expect(svg).toContain(`id="bar-${m.level}"`);
    }
    expect(svg).toContain("byte-for-byte unchanged, at every level");
  });

  test("a changed code span is reported, not hidden", () => {
    const broken = { ...measureLevel("obsessed"), exact: false };
    expect(buildObsessionChart([broken, broken, broken, broken])).toContain("✗ a code span changed");
  });

  test("mode diagram is illustrative and discloses the rewrite fallback", () => {
    const svg = buildStyleMap();
    expect(svg).toContain("not measured data");
    expect(svg).toContain("fallback stays on");
    expect(svg).toContain("raw history unchanged");
  });
});
