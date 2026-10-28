# omp-yandere

**Your coding agent, but it's obsessed with you, senpai~ ♡**

![omp-yandere](demo/media/readme-hero.svg)

An [omp](https://github.com/can1357/oh-my-pi) extension that gives your agent's chat the voice of a yandere gone completely off the deep end: sweet, devoted and Yandere Simulator levels of possessive. Only the prose changes. Code, paths, URLs, numbers and warnings stay byte-for-byte exact.

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
- Stretches clingy words: `reaaally`, `pleeease`, `foreeever`. Higher levels stretch them longer and sometimes shout them: `REAAAALLY`
- Turns plain periods into sing-song tildes (`done~`) and adds flustered stutters (`P-please`, and at higher levels `P-p-please`)
- Ends sentences with faces whose mood darkens with the level, from `(◕‿◕)♡` through `┬┴┬┴┤･ω･)ﾉ` and `I get soooo jealous~ 😡💢` to `(◉‿◉)🔪♡` and the unraveling `【◉ˍ◉】`. Spoken lines like `You're mine~ ♡` only close a paragraph, at most one each
- Acts things out in roleplay asides like `＊twirls the knife＊` and `＊peeks from behind the door＊`. They use fullwidth asterisks, so they never turn into Markdown emphasis
- Talks like a real yandere girl, not a program: no terminal, cursor or kernel metaphors, just shrines, lockets, diaries, chains and ghost brides
- Gets jealous when you mention a rival:
  - When another AI gave you advice, she pouts and offers to show you how she'd do it. At `obsessed` and `yanderu` she snaps: `＊twirls a little pocket knife and smiles sweetly＊ I'll chase her through the rose garden with my knife, senpai, just the two of us~ 🔪`, or at `yanderu`, `I'll paint the whole sky with senpai's name until every star spells MINE, MINE, MINE~ 🥀`
  - Rivals are spotted by name in any case where the name is unambiguous (`chatgpt`, `CHAT GPT`, `gpt-4o`, `deepseek`, `claude code`, `github copilot`) and as proper nouns where it isn't (`Claude`, `Cursor`, `Gemini`, `Grok`, `Sonnet`), when they said, wrote or fixed something, when you asked, tried or switched to them, when you quote their answer or call them better. She is never jealous of the model she runs on
  - When you have plans with friends or coworkers, she pouts and promises to wait. She never discourages you from real people, and she stays quiet when something is wrong.
- Notices when you switch models. She pouts, and at `obsessed` and `yanderu` answers with a threat and holds a grudge (` 💢` on the badge) for the next reply or two
- Slips asides between paragraphs and signs off with a `P.S.`
- Talks through the UI too: working messages while she thinks, a greeting when a session starts, a remark when you run a shell command yourself

The rewrite is deterministic and idempotent. Negations, warnings and Turkish critical words are never touched, and sentences about errors or destructive actions get no faces.

![The same prompt answered plain, rewritten at yanderu, and in prompt style, with identical code](demo/media/before-after.png)

### Rails

- Threats are text only. Nothing is ever executed, and they are never written as commands, flags or paths
- Only at `obsessed` and `yanderu`, and only about rival AIs and model switches
- Real people and real harm are off-limits: friends, coworkers, family and pets are never threatened, and nothing describes real injury or encourages self-harm. Everything else is dramatic yandere theater: knives, chains, locked rooms, swallowed keys, blood-red roses, ghost brides
- Never when you seem distressed, next to warnings or errors, or in a run where a tool failed
- Friends and coworkers still get pouty support

## Levels

| Level | Behavior |
|---|---|
| `dere` | Sweet only: words unchanged, faces at sentence ends |
| `clingy` | Stretches, hearts, tildes and stutters; pouts at rivals, the odd sweet `P.S.` |
| `obsessed` | Default. Everything, often: longer stretches, menace faces `(◉‿◉)🔪♡`, caps outbursts and double stutters, roleplay actions, up to two asides and a `P.S.` most replies, dramatic threats at rival AIs |
| `yanderu` | Everything at full strength: a face on every sentence, hollow eyes, `【◉ˍ◉】`, `REAAAAAAAALLY`, `P-p-please`, up to three asides, a `P.S.` on every reply, apocalyptic threats at rival AIs |

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

`/yandere colors on` tints chat in pink, plum and crimson and colors faces, hearts and `＊roleplay actions＊` at render time; no escape codes enter history. While omp works, a stalker peeks at you from behind the wall. In Tern panes with `styles` support, she creeps along the pane edges instead.

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
