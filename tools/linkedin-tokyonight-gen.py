#!/usr/bin/env python3
"""Regenerate the token maps in linkedin-tokyonight.user.css.

LinkedIn ships two colour systems. The older one uses named tokens
(--color-background-canvas) with light values only. The newer one uses
hashed names (--_5fa42b79) for a palette, and semantic tokens that pick
from it with light-dark(). This script downloads both stylesheets from
public LinkedIn pages and rewrites the GENERATED blocks in the user style.

Run it again when LinkedIn rotates the hashed names (symptom: the newer
pages, such as the feed, go back to LinkedIn's own colours).

Signed-in pages add a third set of hashed names that no public page loads.
Collect those with probe.js (run it with the style turned off) and save the
DUMP section of its report as tools/dumps/<page>.txt.

Usage: python linkedin-tokyonight-gen.py [--dry-run]
"""
import colorsys
import glob
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
STYLE = os.path.join(HERE, "..", "linkedin-tokyonight.user.css")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"

# each hue range goes to the Tokyo Night accent nearest in feel
HUES = [
    (15, "red"), (38, "orange"), (65, "yellow"), (150, "green"),
    (185, "teal"), (205, "cyan"), (250, "blue"), (330, "purple"), (360, "red"),
]
ACCENT_RGB = {
    "red": (247, 118, 142), "orange": (255, 158, 100), "yellow": (224, 175, 104),
    "green": (158, 206, 106), "teal": (115, 218, 202), "cyan": (125, 207, 255),
    "blue": (122, 162, 247), "purple": (187, 154, 247),
}
# the neutral ramp in the user style, as (lightness it stands for, token)
RAMP = [(0.04, 0), (0.10, 1), (0.13, 2), (0.17, 3), (0.22, 4), (0.30, 5),
        (0.38, 6), (0.48, 7), (0.60, 8), (0.72, 9), (0.86, 10), (1.0, 11)]
# LinkedIn's dark greys by role, not lightness. Its page (#1F1E1E) is a
# shade lighter than its cards (#1D1C1B), which flattens under a lightness
# match, so the page goes to the background and the cards to the card step
DARK_ROLES = {
    "000000": 1, "1f1e1e": 1, "1f1f1f": 1, "1f1f1c": 1,
    "151414": 2,
    "1d1c1b": 3, "1b1f23": 3,
    "2a2929": 4, "2f2f2f": 4, "293037": 4,
    "343232": 5, "38434f": 5, "424242": 5,
}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def find_css(page, test):
    html = fetch(page)
    urls = re.findall(r'https://static\.licdn\.com/[^"\'\s)]+', html)
    for u in dict.fromkeys(urls):
        if u.endswith((".js", ".ico", ".png", ".svg", ".jpg")):
            continue
        try:
            css = fetch(u)
        except Exception:
            continue
        if test(css):
            return u, css
    sys.exit(f"no matching stylesheet found on {page}")


def parse_color(v):
    """Return (r, g, b, alpha) or None for keywords, var() and images"""
    v = v.strip().lower()
    m = re.fullmatch(r"#([0-9a-f]{3}|[0-9a-f]{6})", v)
    if m:
        h = m.group(1)
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (1.0,)
    m = re.fullmatch(r"rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+))?\s*\)", v)
    if m:
        a = float(m.group(4)) if m.group(4) else 1.0
        return (int(float(m.group(1))), int(float(m.group(2))), int(float(m.group(3))), a)
    m = re.fullmatch(r"hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:[,/]\s*([\d.]+))?\s*\)", v)
    if m:
        r, g, b = colorsys.hls_to_rgb(float(m.group(1)) / 360, float(m.group(3)) / 100, float(m.group(2)) / 100)
        a = float(m.group(4)) if m.group(4) else 1.0
        return (round(r * 255), round(g * 255), round(b * 255), a)
    return None


def hls(r, g, b):
    return colorsys.rgb_to_hls(r / 255, g / 255, b / 255)


def ramp_token(light):
    best = min(RAMP, key=lambda s: abs(s[0] - light))
    return f"var(--ln-n{best[1]})"


def accent_for(hue_deg):
    for top, name in HUES:
        if hue_deg < top:
            return name
    return "red"


def chromatic(hue_deg, light):
    """Accent at a matching lightness: dark = tint of the page, light = pastel"""
    acc = f"var(--ln-{accent_for(hue_deg)})"
    if light <= 0.6:
        pct = round(max(0.0, min(1.0, (light - 0.06) / 0.54)) * 100)
        if pct >= 98:
            return acc
        return f"color-mix(in srgb, {acc} {pct}%, var(--ln-bg))"
    pct = round(max(0.0, min(1.0, (light - 0.6) / 0.4)) * 55)
    if pct <= 2:
        return acc
    return f"color-mix(in srgb, {acc} {100 - pct}%, var(--ln-fg))"


def with_alpha(expr, a):
    if a >= 0.999:
        return expr
    return f"color-mix(in srgb, {expr} {round(a * 100, 1):g}%, transparent)"


def map_dark(c):
    """A colour already chosen for a dark UI: keep its lightness order"""
    r, g, b, a = c
    h, l, s = hls(r, g, b)
    if a < 0.999 and (r, g, b) == (0, 0, 0):
        return f"rgb(0 0 0 / {a:g})"    # shadows and scrims stay black
    role = DARK_ROLES.get(f"{r:02x}{g:02x}{b:02x}")
    if role is not None:
        return with_alpha(f"var(--ln-n{role})", a)
    if s < 0.25 or l > 0.97:
        return with_alpha(ramp_token(l), a)
    return with_alpha(chromatic(h * 360, l), a)


def map_light(name, c):
    """A colour chosen for a light UI: invert it for a dark one"""
    r, g, b, a = c
    h, l, s = hls(r, g, b)
    # on-dark, inverse and *-dark tokens are already meant for a dark surface
    if re.search(r"-dark(-|$)", name) or "inverse" in name:
        return map_dark(c)
    if (r, g, b) == (0, 0, 0) and a < 0.999:
        if any(k in name for k in ("scrim", "shadow", "overlay")):
            return f"rgb(0 0 0 / {a:g})"
        return with_alpha("var(--ln-fg)", a)
    if (r, g, b) == (255, 255, 255) and a < 0.999:
        return with_alpha("var(--ln-bg)", a)
    if s < 0.25 or l > 0.97:
        if l >= 0.995:
            return with_alpha("var(--ln-card)", a)
        if l >= 0.96:
            return with_alpha("var(--ln-n4)", a)
        if l >= 0.88:
            return with_alpha("var(--ln-bg)", a)
        return with_alpha(ramp_token(1 - l), a)
    return with_alpha(chromatic(h * 360, 1 - l), a)


def named_block(css, skip):
    m = re.search(r":root\s*\{([^}]*--color-background-canvas\s*:[^}]*)\}", css)
    out = []
    for name, val in re.findall(r"(--[\w-]+)\s*:\s*([^;]+)", m.group(1)):
        if name in skip:
            continue
        c = parse_color(val)
        if c is None:
            continue
        out.append(f"  {name}: {map_light(name, c)} !important;")
    return out


def hashed_block(css):
    # the palette is the :root block that holds the most hex literals
    blocks = re.findall(r":root\s*\{([^}]*)\}", css)
    pal = max(blocks, key=lambda b: len(re.findall(r":\s*#[0-9A-Fa-f]{6};", b)))
    out = []
    for name, val in re.findall(r"(--[\w-]+)\s*:\s*([^;]+)", pal):
        c = parse_color(val)
        if c is None:
            continue
        out.append(f"  {name}: {map_dark(c)} !important;")
    return out


def dump_block(skip):
    """Palette colours seen only on signed-in pages, from probe.js reports.

    Signed-in pages load bundles that the public pages do not, and those carry
    their own hashed names. A report lists them. Only the first report that
    names a token counts, oldest file first, so a later report taken with the
    style on cannot feed Tokyo Night values back in
    """
    files = sorted(glob.glob(os.path.join(HERE, "dumps", "*.txt")), key=os.path.getmtime)
    seen, out = set(), []
    for path in files:
        for line in open(path, encoding="utf-8"):
            m = re.match(r"(--_?[0-9a-f]{8}):\s*(.+?);?\s*$", line)
            if not m or m.group(1) in skip or m.group(1) in seen:
                continue
            c = parse_color(m.group(2))
            if c is None:
                continue
            seen.add(m.group(1))
            out.append(f"  {m.group(1)}: {map_dark(c)} !important;")
    return files, out


def splice(text, tag, lines):
    begin, end = f"/* GENERATED:{tag}:BEGIN */", f"/* GENERATED:{tag}:END */"
    i, j = text.index(begin) + len(begin), text.index(end)
    return text[:i] + "\n" + "\n".join(lines) + "\n" + text[j:]


def main():
    text = open(STYLE, encoding="utf-8", newline="").read().replace("\r\n", "\n")
    # tokens set by hand outside the generated blocks win over the generator
    hand = re.sub(r"/\* GENERATED:(\w+):BEGIN \*/.*?/\* GENERATED:\1:END \*/", "", text, flags=re.S)
    skip = set(re.findall(r"(--[\w-]+)\s*:", hand))

    named_url, named_css = find_css("https://www.linkedin.com/signup",
                                    lambda c: "--color-background-canvas:" in c)
    hashed_url, hashed_css = find_css("https://www.linkedin.com/login",
                                      lambda c: "light-dark(" in c)
    named = named_block(named_css, skip)
    hashed = hashed_block(hashed_css)
    hashed_names = {line.split(":")[0].strip() for line in hashed}
    dump_files, signed_in = dump_block(skip | hashed_names)
    print(f"named:     {len(named):4d} tokens from {named_url}")
    print(f"hashed:    {len(hashed):4d} tokens from {hashed_url}")
    print(f"signed-in: {len(signed_in):4d} tokens from {len(dump_files)} report(s) in tools/dumps/")

    text = splice(text, "NAMED", named)
    text = splice(text, "HASHED", hashed)
    text = splice(text, "SIGNEDIN", signed_in)
    if "--dry-run" in sys.argv:
        return
    with open(STYLE, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"wrote {os.path.normpath(STYLE)}")


if __name__ == "__main__":
    main()
