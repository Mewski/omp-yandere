"""Render the README media.

Inputs:
  transcripts/prompt.txt        the user prompt                                 (record.sh)
  transcripts/plain.txt         omp's reply without the extension               (record.sh)
  transcripts/prompt-style.txt  omp's reply with the extension's persona prompt (record.sh)
  transcripts/rewrite.txt       plain.txt after the extension's rewrite hooks   (rewrite.ts)
  transcripts/meta.json         the model and the rewrite level                 (rewrite.ts)
  captures/chat.json            saved ANSI frames of the real chat TUI          (capture.ts)
  captures/dashboard.json       saved ANSI frames of the real `/yandere status` card
  captures/stalker.json         saved ANSI frames of the real status-line brand

Outputs, in media/:
  demo.gif          the saved chat frames in an editorial presentation
  before-after.png  the three replies side by side
  dashboard.gif     the `/yandere status` dashboard being edited with the keyboard
  stalker.gif       the peeking stalker beside omp's turn timer

Usage:
  COLORTERM=truecolor bun demo/capture.ts
  uv run --with pillow python demo/render.py [--font path/to/mono.ttf]
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
TRANSCRIPTS = HERE / "transcripts"
CAPTURES = HERE / "captures"
MEDIA = HERE / "media"
HOME = Path.home()

# Editorial chrome only; explicit colours in the saved ANSI cells stay untouched.
# Yami-kawaii: bubblegum pink and crimson over bruised plum.
BG = "#0d0609"
PANEL_BG = "#150a10"
PINK_BG = "#22101a"
BORDER = "#3a2230"
PINK_BORDER = "#7a2e4a"
CODE_BG = "#0d0609"
FG = "#fbe9f1"
DIM = "#b892a6"
CODE = "#ffc2d6"
KEYWORD = "#d68cff"
NUMBER = "#ff6fa3"
ACCENT = "#ff4f8b"
PROMPT = "#ff9eb8"
TERM_BG = PANEL_BG
TERM_FG = FG

# Only persona spans get the accent colour: kaomoji (parentheses holding a face
# feature, with optional arms), hearts, emoji and the "Senpai~"/"ehehe~" calls.
# Ordinary words that merely end in "~" keep the prose colour.
FACE_FEATURES = "◕◉⊙ω･ᵔᵕ¬‿♡♥∀▽εˍ"
PERSONA = re.compile(
    r"[^\s()]{0,2}\((?=[^()]*[" + FACE_FEATURES + r"])[^()\n]{1,16}\)[^\s()]{0,2}"
    r"|[♡♥]+|(?:[\U0001F000-\U0001FFFF\u26d3\u2764]\ufe0f?)+|Senpai~|…*ehehe~|fufufu~|\|ω･\)|┬┴┬┴┤･ω･\)ﾉ"
)
JS_KEYWORDS = {"let", "const", "var", "for", "while", "if", "return", "function"}

FONT_SIZE = 17
LINE_H = 26
PAD = 24
MARGIN = 36
HEADER_H = 184
COLS = 52

WIN_FONTS = (Path("C:/Windows/Fonts"), HOME / ".local/share/fonts/windows11", Path("/usr/share/fonts/windows11"))


def find_font(*names: str) -> str | None:
    for name in names:
        candidates = [d / name for d in WIN_FONTS] + [Path(name)]
        for path in candidates:
            if path.exists():
                return str(path)
    return None


@dataclass
class Tok:
    text: str
    color: str
    code_block: bool = False


def default_font() -> str:
    found = find_font(
        "consola.ttf",
        "CascadiaMono.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/liberation-mono-fonts/LiberationMono-Regular.ttf",
        "/System/Library/Fonts/Menlo.ttc",
    )
    if not found:
        raise SystemExit("no monospace font found; pass --font")
    return found


def is_zero_width(ch: str) -> bool:
    return unicodedata.category(ch) in ("Mn", "Me", "Cf") or "\ufe00" <= ch <= "\ufe0f"


def is_emoji(ch: str) -> bool:
    return ord(ch) >= 0x1F000 or ch in "⛓⚡✨"


def cell_width(text: str) -> int:
    return sum(0 if is_zero_width(ch) else 2 if unicodedata.east_asian_width(ch) in "WF" else 1 for ch in text)


def prose_tokens(line: str, base: str = FG) -> list[Tok]:
    """Split a prose line into word/space tokens; `inline code` is coloured, backticks dropped."""
    toks: list[Tok] = []
    for i, part in enumerate(line.split("`")):
        if i % 2 == 1:
            toks.extend(Tok(piece, CODE) for piece in re.findall(r"\S+|\s+", part))
            continue
        cursor = 0
        for match in [*PERSONA.finditer(part), None]:
            start, end = (match.start(), match.end()) if match else (len(part), len(part))
            toks.extend(Tok(piece, base) for piece in re.findall(r"\S+|\s+", part[cursor:start]))
            toks.extend(Tok(piece, ACCENT) for piece in re.findall(r"\S+|\s+", part[start:end]))
            cursor = end
    return toks


def js_tokens(line: str) -> list[Tok]:
    toks: list[Tok] = []
    for piece in re.findall(r"[A-Za-z_]\w*|\d+|\s+|.", line):
        color = KEYWORD if piece in JS_KEYWORDS else NUMBER if piece.isdigit() else FG
        toks.append(Tok(piece, color, code_block=True))
    return toks


def words(toks: list[Tok]) -> list[list[Tok]]:
    """Group tokens into wrap units: whitespace alone, or adjacent non-space tokens glued
    together so `NaN` + `,` never wraps between the code and its punctuation."""
    groups: list[list[Tok]] = []
    for tok in toks:
        if tok.text.strip() and groups and groups[-1][-1].text.strip():
            groups[-1].append(tok)
        else:
            groups.append([tok])
    return groups


def wrap(toks: list[Tok], cols: int) -> list[list[Tok]]:
    """Greedy word wrap by terminal cells; code-block lines are never wrapped."""
    if toks and toks[0].code_block:
        return [toks]
    lines: list[list[Tok]] = [[]]
    width = 0
    for group in words(toks):
        size = sum(cell_width(t.text) for t in group)
        blank = not group[0].text.strip()
        if width + size > cols and not blank:
            lines.append([])
            width = 0
        if not lines[-1] and blank:
            continue  # no leading spaces on wrapped lines
        lines[-1].extend(group)
        width += size
    return lines


def markdown_lines(text: str, cols: int) -> list[list[Tok]]:
    out: list[list[Tok]] = []
    fenced = False
    for raw in text.strip("\n").splitlines():
        if raw.startswith("```"):
            fenced = not fenced
            continue
        if fenced:
            out.append(js_tokens(raw) or [Tok("", FG, code_block=True)])
        elif not raw.strip():
            out.append([])
        else:
            out.extend(wrap(prose_tokens(raw), cols))
    return out


def prompt_lines(text: str, cols: int) -> list[list[Tok]]:
    toks = [Tok("> ", PROMPT)] + prose_tokens(" ".join(text.split()), DIM)
    return wrap(toks, cols)


class Canvas:
    def __init__(self, font_path: str):
        self.font = ImageFont.truetype(font_path, FONT_SIZE)
        self.small = ImageFont.truetype(font_path, 12)
        heading_path = (
            find_font(
                "segoeuib.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            )
            or font_path
        )
        self.heading = ImageFont.truetype(heading_path, 34)
        # Glyph fallbacks in order: symbols, CJK/halfwidth kana, syllabics, then anything mono.
        self.fallbacks = [
            ImageFont.truetype(p, FONT_SIZE)
            for p in filter(
                None,
                (
                    find_font("seguisym.ttf"),
                    find_font("msgothic.ttc", "YuGothR.ttc"),
                    find_font("/usr/share/fonts/google-noto-sans-cjk-fonts/NotoSansCJK-Regular.ttc"),
                    find_font("gadugi.ttf"),
                    find_font("/usr/share/fonts/google-noto-vf/NotoSansMono[wght].ttf"),
                ),
            )
        ]
        emoji_path = find_font("seguiemj.ttf")
        self.emoji = ImageFont.truetype(emoji_path, FONT_SIZE - 2) if emoji_path else None
        self.char_w = self.font.getlength("M")
        self.glyph_fonts: dict[str, ImageFont.FreeTypeFont] = {}

    def font_for(self, ch: str) -> ImageFont.FreeTypeFont:
        if ch not in self.glyph_fonts:
            if self.emoji and is_emoji(ch):
                self.glyph_fonts[ch] = self.emoji
            else:
                self.glyph_fonts[ch] = next(
                    (font for font in (self.font, *self.fallbacks) if has_glyph(font, ch)), self.font
                )
        return self.glyph_fonts[ch]

    def width_for(self, cols: int) -> int:
        return int(cols * self.char_w + 2 * PAD + 0.999)

    def text(self, d: ImageDraw.ImageDraw, x: float, y: float, text: str, fill: str, cell: bool = False) -> float:
        """Draw text with per-glyph font fallback, centred on y. With `cell`, every
        glyph advances by whole terminal cells so ANSI grids stay aligned."""
        for ch in grapheme_runs(text):
            base = ch[0]
            font = self.font_for(base)
            span = (2 if unicodedata.east_asian_width(base) in "WF" else 1) * self.char_w
            d.text((x, y), ch, font=font, fill=fill, anchor="lm", embedded_color=font is self.emoji)
            x += span if cell or font is not self.font else font.getlength(ch)
        return x

    def editorial(
        self, width: int, height: int, eyebrow: str, headlines: tuple[str, ...], note: str
    ) -> tuple[Image.Image, ImageDraw.ImageDraw]:
        img = Image.new("RGB", (width, height), BG)
        d = ImageDraw.Draw(img)
        d.line((MARGIN, 24, width - MARGIN, 24), fill=BORDER)
        pixel_heart(d, MARGIN, 38, ACCENT)
        d.text((MARGIN + 28, 38), eyebrow, font=self.small, fill=KEYWORD, anchor="lt")
        for i, line in enumerate(headlines):
            d.text((MARGIN, 66 + i * 42), line, font=self.heading, fill=FG, anchor="lt")
        d.text((MARGIN, HEADER_H - 28), note, font=self.small, fill=DIM, anchor="lt")
        dither(d, width - MARGIN - 64, 38, 64, 16)
        return img, d

    def draw_lines(self, d: ImageDraw.ImageDraw, lines: list[list[Tok]], x0: int, y0: int, width: int) -> int:
        """Draw lines. Returns the y after the last line."""
        y = y0
        for line in lines:
            if line and line[0].code_block:
                d.rectangle([x0 - 8, y - 2, x0 + width - 2 * PAD + 8, y + LINE_H - 2], fill=CODE_BG)
            x = x0
            for tok in line:
                x = self.text(d, x, y + LINE_H / 2, tok.text, tok.color, cell=True)
            y += LINE_H
        return y


@cache
def notdef(font: ImageFont.FreeTypeFont) -> bytes:
    return bytes(font.getmask("\U000f0000"))


def has_glyph(font: ImageFont.FreeTypeFont, ch: str) -> bool:
    """A missing glyph renders as the font's .notdef box."""
    return ch.isspace() or bytes(font.getmask(ch)) != notdef(font)


def grapheme_runs(text: str) -> list[str]:
    """Base characters with their combining marks / variation selectors attached."""
    runs: list[str] = []
    for ch in text:
        if runs and is_zero_width(ch):
            runs[-1] += ch
        else:
            runs.append(ch)
    return runs


def pixel_heart(d: ImageDraw.ImageDraw, x: int, y: int, color: str) -> None:
    for row, bits in enumerate(("0110110", "1111111", "1111111", "0111110", "0011100", "0001000")):
        for col, bit in enumerate(bits):
            if bit == "1":
                d.rectangle((x + col * 2, y + row * 2, x + col * 2 + 1, y + row * 2 + 1), fill=color)


def dither(d: ImageDraw.ImageDraw, x: int, y: int, width: int, height: int) -> None:
    for row in range(0, height, 4):
        for col in range(0, width, 4):
            if (row // 4 + col // 4) % 2 == 0:
                d.point((x + col, y + row), fill=PINK_BORDER)


def panel(d: ImageDraw.ImageDraw, box: tuple[int, int, int, int], emphasized: bool = False) -> None:
    d.rectangle(box, fill=PINK_BG if emphasized else PANEL_BG, outline=PINK_BORDER if emphasized else BORDER, width=1)


def render_before_after(c: Canvas, prompt: str, replies: list[tuple[str, str, str]], model: str, out: Path) -> None:
    """`replies`: (state chip, label, transcript text). Code blocks share one baseline."""
    all_lines = [markdown_lines(text, COLS) for _, _, text in replies]
    code_starts = [
        next((i for i, line in enumerate(lines) if line and line[0].code_block), len(lines)) for lines in all_lines
    ]
    code_y = max(code_starts)
    for lines, start in zip(all_lines, code_starts):
        lines[start:start] = [[] for _ in range(code_y - start)]

    cols = max(COLS, *(sum(cell_width(t.text) for t in line) for lines in all_lines for line in lines))
    panel_w = c.width_for(cols)
    gap = 24
    width = 2 * MARGIN + len(replies) * panel_w + (len(replies) - 1) * gap
    p_lines = prompt_lines(prompt, int((width - 2 * MARGIN - 2 * PAD) / c.char_w))
    prompt_h = 60 + LINE_H * len(p_lines) + PAD
    reply_y = HEADER_H + prompt_h + gap
    panel_h = 88 + LINE_H * max(len(lines) for lines in all_lines) + PAD
    height = reply_y + panel_h + 64
    img, d = c.editorial(
        width,
        height,
        "OMP-YANDERE / SAVED REPLIES",
        ("Same prompt. Same code. A devoted voice.",),
        f"Real replies from {model}; code is shown exactly as each transcript has it.",
    )

    panel(d, (MARGIN, HEADER_H, width - MARGIN, HEADER_H + prompt_h))
    d.text((MARGIN + PAD, HEADER_H + 20), "SHARED PROMPT", font=c.small, fill=PROMPT, anchor="lt")
    c.draw_lines(d, p_lines, MARGIN + PAD, HEADER_H + 52, width - 2 * MARGIN)

    for i, ((state, label, _), lines) in enumerate(zip(replies, all_lines)):
        x = MARGIN + i * (panel_w + gap)
        on = i > 0
        panel(d, (x, reply_y, x + panel_w, reply_y + panel_h), emphasized=on)
        chip_w = int(c.small.getlength(state)) + 24
        d.rectangle(
            (x + PAD, reply_y + 20, x + PAD + chip_w, reply_y + 44),
            fill=PINK_BG if on else BG,
            outline=PINK_BORDER if on else BORDER,
        )
        d.text((x + PAD + chip_w / 2, reply_y + 32), state, font=c.small, fill=ACCENT if on else DIM, anchor="mm")
        d.text((x + PAD + chip_w + 16, reply_y + 25), label, font=c.font, fill=FG, anchor="lt")
        d.line((x + PAD, reply_y + 62, x + panel_w - PAD, reply_y + 62), fill=BORDER)
        c.draw_lines(d, lines, x + PAD, reply_y + 88, panel_w)
    d.text(
        (MARGIN, height - 32),
        "SOURCE / transcripts/plain.txt + rewrite.txt + prompt-style.txt",
        font=c.small,
        fill=DIM,
        anchor="lm",
    )
    pixel_heart(d, width - MARGIN - 14, height - 38, ACCENT)
    img.save(out, optimize=True)


def xterm_rgb(n: int) -> str:
    """Colour of xterm-256 index `n`."""
    base = (
        "#000000",
        "#800000",
        "#008000",
        "#808000",
        "#000080",
        "#800080",
        "#008080",
        "#c0c0c0",
        "#808080",
        "#ff0000",
        "#00ff00",
        "#ffff00",
        "#0000ff",
        "#ff00ff",
        "#00ffff",
        "#ffffff",
    )
    if n < 16:
        return base[n]
    if n < 232:
        steps = (0, 95, 135, 175, 215, 255)
        n -= 16
        return f"#{steps[n // 36]:02x}{steps[n // 6 % 6]:02x}{steps[n % 6]:02x}"
    v = 8 + (n - 232) * 10
    return f"#{v:02x}{v:02x}{v:02x}"


@dataclass
class Cell:
    char: str
    fg: str
    bg: str | None
    bold: bool
    wide: bool


def ansi_cells(line: str) -> list[Cell]:
    """Parse one SGR-coloured line (256-colour or truecolour) into terminal cells; OSC marks
    are dropped and zero-width marks (combining, VS16) join the previous cell."""
    cells: list[Cell] = []
    fg, bg, bold = TERM_FG, None, False
    for part in re.split(r"(\x1b\[[0-9;]*m|\x1b\][^\x07]*\x07)", line):
        if part.startswith("\x1b]"):
            continue
        if part.startswith("\x1b["):
            codes = [int(c) if c else 0 for c in part[2:-1].split(";")]
            i = 0
            while i < len(codes):
                code = codes[i]
                if code in (38, 48):
                    if codes[i + 1] == 5:
                        color, i = xterm_rgb(codes[i + 2]), i + 3
                    else:
                        red, green, blue = codes[i + 2 : i + 5]
                        color, i = f"#{red:02x}{green:02x}{blue:02x}", i + 5
                    if code == 38:
                        fg = color
                    else:
                        bg = color
                    continue
                if code == 0:
                    fg, bg, bold = TERM_FG, None, False
                elif code == 1:
                    bold = True
                elif code == 22:
                    bold = False
                elif code == 39:
                    fg = TERM_FG
                elif code == 49:
                    bg = None
                i += 1
            continue
        for ch in part:
            if cells and is_zero_width(ch):
                cells[-1].char += ch
                continue
            cells.append(Cell(ch, fg, bg, bold, unicodedata.east_asian_width(ch) in "WF"))
    return cells


def gif_durations(frames: list[dict]) -> list[int]:
    """Round cumulative time to GIF's 10ms ticks, avoiding per-frame drift."""
    elapsed = previous = 0
    durations = []
    for frame in frames:
        elapsed += frame["ms"]
        boundary = int((elapsed + 5) // 10) * 10
        durations.append(boundary - previous)
        previous = boundary
    return durations


def render_ansi(c: Canvas, capture: dict, title: str, out: Path) -> None:
    """Package every saved ANSI frame; no TUI recapture or content overlays."""
    decoded = [[ansi_cells(line) for line in f["lines"]] for f in capture["frames"]]
    widest = max((sum(2 if cell.wide else 1 for cell in line) for lines in decoded for line in lines), default=0)
    cols = max(capture["width"], widest) + 2
    rows = max(len(lines) for lines in decoded)
    has_keys = any(f.get("key") for f in capture["frames"])
    is_stalker = capture.get("kind") == "stalker"
    panel_w = c.width_for(cols)
    width = panel_w + 2 * MARGIN
    panel_h = 60 + 2 * PAD + LINE_H * rows
    panel_bottom = HEADER_H + panel_h
    ribbon_y = panel_bottom + 20
    height = panel_bottom + (132 if has_keys else 68)
    bold = ImageFont.truetype(find_font("consolab.ttf") or c.font.path, FONT_SIZE)
    actions = {
        "down": "Move focus down",
        "up": "Move focus up",
        "left": "Edit selection",
        "right": "Edit selection",
        "tab": "Switch tabs",
    }
    headlines = (title,) if has_keys or is_stalker else ("Your coding agent,", "but it's obsessed with you")
    note = (
        "Real omp status-line brand / peeks while a turn is running"
        if is_stalker
        else "Keyboard edits in the saved /yandere status capture."
        if has_keys
        else "Saved chat capture / plain reply streams, then the rewrite lands / yami-kawaii colours + blush"
    )

    rgb: list[Image.Image] = []
    for index, (f, lines) in enumerate(zip(capture["frames"], decoded)):
        img, d = c.editorial(
            width,
            height,
            "OMP-YANDERE / ALWAYS WATCHING"
            if is_stalker
            else "OMP-YANDERE / KEYBOARD"
            if has_keys
            else "OMP-YANDERE / CHAT",
            headlines,
            note,
        )
        if not has_keys and not is_stalker:
            face = "(◕‿◕)♡"
            x = width - MARGIN - cell_width(face) * c.char_w
            c.text(d, x, HEADER_H - 22, face, ACCENT, cell=True)
        panel(d, (MARGIN, HEADER_H, width - MARGIN, panel_bottom))
        d.text(
            (MARGIN + PAD, HEADER_H + 20),
            "STATUS LINE / BOTTOM LEFT" if is_stalker else "SAVED TUI / STATUS" if has_keys else "SAVED TUI / CHAT",
            font=c.small,
            fill=PROMPT,
            anchor="lt",
        )
        # Real sequence labels also prevent GIF encoders merging identical TUI frames.
        d.text((width - MARGIN - PAD, HEADER_H + 20), f"FRAME {index + 1:03d}", font=c.small, fill=DIM, anchor="rt")
        d.line((MARGIN + PAD, HEADER_H + 44, width - MARGIN - PAD, HEADER_H + 44), fill=BORDER)
        y = HEADER_H + 60 + PAD
        for line in lines:
            col = 1
            for cell in line:
                x = MARGIN + PAD + col * c.char_w
                span = 2 if cell.wide else 1
                if cell.bg:
                    d.rectangle([x, y, x + span * c.char_w, y + LINE_H - 1], fill=cell.bg)
                if cell.char != " ":
                    font = c.font_for(cell.char[0])
                    if cell.bold and font is c.font:
                        font = bold
                    d.text(
                        (x, y + LINE_H / 2),
                        cell.char,
                        font=font,
                        fill=cell.fg,
                        anchor="lm",
                        embedded_color=font is c.emoji,
                    )
                col += span
            y += LINE_H
        if has_keys:
            panel(d, (MARGIN, ribbon_y, width - MARGIN, ribbon_y + 48), emphasized=True)
            d.text((MARGIN + PAD, ribbon_y + 24), "KEY ACTION", font=c.small, fill=DIM, anchor="lm")
            key = f.get("key")
            d.text(
                (MARGIN + PAD + 108, ribbon_y + 24),
                key.upper() if key else "START",
                font=c.font,
                fill=ACCENT,
                anchor="lm",
            )
            d.text(
                (MARGIN + PAD + 212, ribbon_y + 24),
                actions.get(key, "Opening view"),
                font=c.small,
                fill=FG,
                anchor="lm",
            )
            d.text(
                (MARGIN, height - 30), "↑↓ FOCUS     ←→ EDIT     TAB SWITCH TABS", font=c.small, fill=DIM, anchor="lm"
            )
        else:
            d.text(
                (MARGIN, height - 30),
                "SOURCE / captures/stalker.json" if is_stalker else "SOURCE / captures/chat.json",
                font=c.small,
                fill=DIM,
                anchor="lm",
            )
            pixel_heart(d, width - MARGIN - 14, height - 36, ACCENT)
        rgb.append(img)

    # One palette across the entire sequence keeps captured colours stable.
    mosaic = Image.new("RGB", (width, height * len(rgb)))
    for i, frame in enumerate(rgb):
        mosaic.paste(frame, (0, height * i))
    palette = mosaic.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    frames = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in rgb]
    frames[0].save(
        out, save_all=True, append_images=frames[1:], duration=gif_durations(capture["frames"]), loop=0, optimize=True
    )


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_capture(name: str) -> dict:
    return json.loads(read(CAPTURES / name))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--font", default=None)
    args = ap.parse_args()
    c = Canvas(args.font or default_font())

    meta = json.loads(read(TRANSCRIPTS / "meta.json"))
    render_ansi(c, load_capture("chat.json"), "Your coding agent, but it's obsessed with you", MEDIA / "demo.gif")
    render_before_after(
        c,
        read(TRANSCRIPTS / "prompt.txt"),
        [
            ("OFF", "Original reply", read(TRANSCRIPTS / "plain.txt")),
            (f"REWRITE · {meta['level'].upper()}", "Deterministic", read(TRANSCRIPTS / "rewrite.txt")),
            ("PROMPT", "Model plays the persona", read(TRANSCRIPTS / "prompt-style.txt")),
        ],
        meta["model"],
        MEDIA / "before-after.png",
    )
    render_ansi(c, load_capture("dashboard.json"), "Your obsession controls", MEDIA / "dashboard.gif")
    render_ansi(c, load_capture("stalker.json"), "Always watching~", MEDIA / "stalker.gif")
    for name in ("demo.gif", "before-after.png", "dashboard.gif", "stalker.gif"):
        print(f"{name}: {(MEDIA / name).stat().st_size / 1024:.0f} KiB")


if __name__ == "__main__":
    main()
