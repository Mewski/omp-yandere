# omp-yandere

**Your coding agent, but it's obsessed with you, senpai~ ♡**

![omp-yandere](demo/media/readme-hero.svg)

An [omp](https://github.com/can1357/oh-my-pi) extension that gives your agent's chat the voice of a yandere: sweet, devoted and a little too possessive. Only the prose changes. Code, paths, URLs, numbers and warnings stay byte-for-byte exact.

Inspired by [omp-uwu](https://github.com/NaC-L/omp-uwu).

## Install

```sh
omp plugin install omp-yandere
```

Restart omp afterwards. Settings live in `~/.omp/agent/omp-yandere.json`.

![A prompt mentioning ChatGPT, the plain reply streaming, then the yandere rewrite landing](demo/media/demo.gif)

## What she does

- Opens paragraphs with `Senpai~`
- Adds hearts after affection words: `you♡`, `together♡`
- Stretches clingy words: `reaaally`, `pleeease`, `foreeever`
- Turns plain periods into sing-song tildes (`done~`) and adds flustered stutters (`P-please`)
- Ends sentences with faces whose mood darkens with the level, from `(◕‿◕)♡` through `┬┴┬┴┤･ω･)ﾉ` and `I get soooo jealous~ 😡💢` to `( ◕ ˍ ◕ )`. Spoken lines like `You're mine~ ♡` only close a paragraph, at most one each
- Gets jealous when you mention a rival:
  - When another AI (ChatGPT, Claude, Copilot) gave you advice, she pouts and offers to show you how she'd do it.
  - When you have plans with friends or coworkers, she pouts and promises to wait. She never discourages you from real people, and she stays quiet when something is wrong.

The rewrite is deterministic and idempotent. Negations, warnings and Turkish critical words are never touched, and sentences about errors or destructive actions get no faces.

![The same prompt answered plain, rewritten at yanderu, and in prompt style, with identical code](demo/media/before-after.png)

## Levels

| Level | Behavior |
|---|---|
| `dere` | Sweet only: words unchanged, faces at sentence ends |
| `clingy` | Light: rare stretches, hearts and tildes |
| `obsessed` | Default |
| `yanderu` | Everything, plus hollow eyes and the knife `(◕‿◕)🔪` |

![Persona marks per 100 words at each level, measured on demo/transcripts/corpus.md](demo/media/obsession-levels.svg)

## Styles

| Style | How |
|---|---|
| `rewrite` | Default. Restyles each finished reply. Uses the prompt for the first turn, until omp shows it supports the rewrite hook |
| `prompt` | The model plays the persona itself |
| `display` | Experimental. Restyles only what the TUI draws; history is untouched |

![Where each style applies](demo/media/style-map.svg)

## Commands

| Command | Action |
|---|---|
| `/yandere` | Settings dashboard |
| `/yandere on` · `off` | Toggle |
| `/yandere rewrite` · `prompt` · `display` | Style |
| `/yandere level dere\|clingy\|obsessed\|yanderu` | Obsession level |
| `/yandere locale auto\|en\|tr` | Critical words to protect |
| `/yandere colors [on\|off]` | Yami-kawaii palette and the stalker |
| `/yandere preview <text>` | Try the current settings |

![The /yandere dashboard edited with the keyboard](demo/media/dashboard.gif)

## Colors

`/yandere colors on` tints chat in pink, plum and crimson and colors faces and hearts at render time; no escape codes enter history. While omp works, a stalker peeks at you from behind the wall. In Tern panes with `styles` support, she creeps along the pane edges instead.

![The stalker spinner beside the turn timer](demo/media/stalker.gif)

## Development

```sh
bun install
bun run check
bun test
omp --no-extensions -e ./src/index.ts
```

<details>
<summary>Regenerating the demo media</summary>

```sh
mkdir -p /tmp/omp-demo && cp ~/.omp/agent/agent.db* /tmp/omp-demo/
demo/record.sh                           # real replies → demo/transcripts
COLORTERM=truecolor bun demo/capture.ts  # real TUI frames → demo/captures
uv run --with pillow python demo/render.py
bun demo/readme-assets.ts                # SVG panels; the level chart is measured
uv run --with pillow python -m unittest discover -s demo -p test_render.py
```

</details>

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for more details.
