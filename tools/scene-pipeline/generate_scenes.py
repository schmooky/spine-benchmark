#!/usr/bin/env python3
"""
Generate scene descriptors for the selected games from catalog.json.

Classifies each game's spines into roles (main background, bonus background,
reel symbols, win announcer) by path/name, pairs them with per-game grid dims,
and emits scenes for each state:

  base      main bg + symbol grid (all idle)
  bonus     bonus bg + symbol grid (idle)          [if a bonus bg exists]
  big-win   main bg + grid with a middle-row win line + announcer overlay

Output: apps/bench-runner/public/scenes/scenes.json  (array of SceneDescriptor,
matching apps/bench-runner/src/scenes/types.ts). Paths are games-src-relative so
the runner just switches ASSET base (local /games/ vs S3).

stars-of-egypt is authored by hand (src/scenes/data/stars-of-egypt.ts) and is
skipped here to avoid duplication.
"""
from __future__ import annotations
import json, re
from pathlib import Path

HERE = Path(__file__).parent
CATALOG = json.loads((HERE / "catalog.json").read_text())
SELECTED = json.loads((HERE / "selected_games.json").read_text())["games"]
OUT = HERE.parent.parent / "apps/bench-runner/public/scenes/scenes.json"

SKIP = {"reelnroll/stars-of-egypt"}  # hand-authored

# per-game grid (cols, rows, cellW, cellH); scraped from each game's reels config
GRID = {
    "gambit/fortune-numbers": (5, 3, 150, 150),
    "gambit/magic-pipes": (6, 5, 180, 180),
    "gambit/gems-of-olympus": (6, 5, 146, 180),
    "gambit/book-of-zombies": (6, 5, 169, 117),
    "gambit/coin-odyssey": (5, 3, 160, 160),
    "gambit/bang-bang": (6, 5, 166, 166),
    "gambit/legends-of-aztecs": (5, 3, 150, 150),
    "gambit/net-cash": (6, 5, 180, 180),
    "reelnroll/mummy-money-hw": (5, 4, 160, 150),
    "reelnroll/merhaba-bazaar": (5, 4, 210, 260),
    "reelnroll/three-kings": (5, 4, 159, 142),
    "reelnroll/sands-of-olympus3-hw-c": (5, 3, 198, 200),
    "check-in-gaming/fruit-garden": (5, 4, 344, 226),
    "check-in-gaming/bonbon-bonanza": (6, 5, 165, 155),
    "check-in-gaming/falconcash-hw": (5, 4, 344, 226),
    "playcognito/sweet-crumbs": (6, 5, 125, 125),
    "playcognito/biochrome-city": (5, 5, 133, 133),
    "playcognito/alice-bloody-rush": (6, 3, 160, 160),
}
DEFAULT_GRID = (6, 5, 160, 160)

ANNOUNCER_RE = re.compile(r"(big[_-]?win|mega[_-]?win|super[_-]?win|huge[_-]?win|epic[_-]?win|max[_-]?win|announcer)", re.I)
# a symbol lives under a dir mentioning "symbol", or its name looks like a reel
# symbol (low_/high_/med_/hl_ prefixes, single letters, wild/scatter)
SYMBOL_SEG_RE = re.compile(r"symbol|/hl_|/low_|/high_|/med_", re.I)
SYMBOL_NAME_RE = re.compile(r"^(low|high|med|hl|h|l|m|sym)[_\-0-9]|^(wild|scatter)$", re.I)
# exclude non-reel specials AND the coin/bonus/collect symbols, whose long
# texture-sequence attachments (coin_transition frames) frequently reference
# atlas regions that aren't present -> blank -> renderer crash (texture._source).
NOT_SYMBOL_RE = re.compile(
    r"(boss|button|vfx|logo|trail|winbox|character|transition|wide|counter|"
    r"shaker|frame|light|coin|snitch|multip|spin|bonus|collect|ante|jackpot|chest)",
    re.I)
# main background: broad, so games with names like main_game / bg_main / layout
# bg / background_base are caught (bonus + symbols are filtered out first).
MAIN_BG_RE = re.compile(
    r"(background|bg_main|main_?game|maingame|/bg/|/layout/.*bg|background_base)", re.I)
BONUS_BG_RE = re.compile(r"(background_bonus|bg_bonus)", re.I)
# never pick assets out of backup / old export dirs
BACKUP_RE = re.compile(r"(/_bak|/bak/|backup|/old/|_old|/deprecated)", re.I)


def pick_anim(anims, *prefer):
    for p in prefer:
        for a in anims:
            if a == p:
                return a
    for p in prefer:
        for a in anims:
            if p in a:
                return a
    return anims[0] if anims else None


def classify(spines):
    main_bg = bonus_bg = None
    symbols, announcers = [], []
    for s in spines:
        skel = s["skel"].lower()
        name = s["id"].split("--", 1)[1].lower()
        if s["atlas"] is None or BACKUP_RE.search(skel):
            continue
        if BONUS_BG_RE.search(skel):
            if bonus_bg is None or s["total"] > bonus_bg["total"]:
                bonus_bg = s
            continue
        if MAIN_BG_RE.search(skel) and "dog" not in name and "cloud" not in name:
            if main_bg is None or s["total"] > main_bg["total"]:
                main_bg = s
            continue
        if ANNOUNCER_RE.search(name) or "announcer" in skel or "/wins" in skel or "/popup" in skel:
            announcers.append(s)
            continue
        if NOT_SYMBOL_RE.search(name):
            continue
        if SYMBOL_SEG_RE.search(skel) or SYMBOL_NAME_RE.search(name):
            symbols.append(s)
    # prefer a mid-tier "big win" announcer
    announcers.sort(key=lambda s: (0 if "big" in s["id"].lower() else 1, -s["total"]))
    return main_bg, bonus_bg, symbols, announcers


def placement(s, x=0, y=0, anim=None):
    return {"id": s["id"].split("--", 1)[1], "skel": s["skel"], "atlas": s["atlas"],
            "x": x, "y": y, "anim": anim or pick_anim(s["animations"], "idle", "bg_idle")}


def sym_ref(s):
    return {"skel": s["skel"], "atlas": s["atlas"]}


def tier_from(total):
    if total >= 25: return "very-high"
    if total >= 15: return "high"
    if total >= 8: return "moderate"
    return "low"


def build_for(game, entry):
    spines = entry["spines"]
    main_bg, bonus_bg, symbols, announcers = classify(spines)
    if not symbols:
        return []  # nothing to grid, skip
    # keep up to 12 distinct symbol spines, prefer higher-impact for a fuller grid
    symbols = sorted(symbols, key=lambda s: -s["total"])[:12]
    has_win = any("win" in a for s in symbols for a in s["animations"])
    cols, rows, cw, ch = GRID.get(game, DEFAULT_GRID)
    grid = {"cols": cols, "rows": rows, "cellW": cw, "cellH": ch,
            "x": 0, "y": 0, "symbols": [sym_ref(s) for s in symbols], "idleAnim": "idle"}
    gname = game.split("/", 1)[1]
    grid_total = sum(s["total"] for s in symbols[: cols]) * rows  # rough scene impact
    scenes = []

    bg_layers = [placement(main_bg)] if main_bg else []
    scenes.append({
        "id": f"{gname}--base", "game": game, "state": "base",
        "description": f"{gname} main game: {'animated background + ' if main_bg else ''}"
                       f"{cols}x{rows} reel grid of {len(symbols)} idle symbol spines "
                       f"({cw}x{ch}px cells), authored 1920x1080, uniform-fit to viewport.",
        "refWidth": 1920, "refHeight": 1080,
        "background": bg_layers, "grid": grid, "overlays": [], "tier": tier_from(grid_total),
    })

    # NOTE: no separate "bonus" state - bonus-background detection is unreliable
    # (often a symbol named "bonus" or a bg paired with the wrong atlas, giving
    # black scenes). base + big-win cover idle and the win path, which is what
    # the calibration study needs.

    # play the win animation across several lines so plenty of symbols show
    # their win state (not just the middle row) - keep a couple rows idling for
    # contrast / the idle-vs-win RI step.
    win_rows = sorted({rows // 2, 0, max(0, rows - 2)})
    win_cells = [[c, r] for r in win_rows for c in range(cols)]
    overlays = []
    if announcers:
        a = announcers[0]
        overlays.append(placement(a, 0, -ch, pick_anim(a["animations"], "idle", "in")))
    scenes.append({
        "id": f"{gname}--big-win", "game": game, "state": "big-win",
        "description": f"{gname} big-win: base composition with the middle-row line of "
                       f"symbols playing their `win` animation (heavier path)"
                       f"{' plus the win announcer spine overlaid' if announcers else ''}.",
        "refWidth": 1920, "refHeight": 1080,
        "background": bg_layers,
        "grid": {**grid, "winAnim": "win" if has_win else None, "winCells": win_cells},
        "overlays": overlays, "tier": "high",
    })

    # density stress: spawn random symbols from this game's set and ramp the
    # count to the fps breaking point (non-normalized pos/size/anim). No bg, so
    # it's a clean per-device capacity curve for this game's symbol mix.
    scenes.append({
        "id": f"{gname}--stress", "game": game, "state": "stress",
        "description": f"{gname} density stress: random symbols from the reel set "
                       f"(non-normalized position / size / animation) ramped "
                       f"{STRESS_STEPS} instances to the fps breaking point - the "
                       f"per-device capacity curve for this symbol mix.",
        "refWidth": 1920, "refHeight": 1080,
        "background": [], "overlays": [],
        "stress": {"symbols": [sym_ref(s) for s in symbols], "steps": STRESS_STEPS, "anims": "mix"},
        "tier": "very-high",
    })
    return scenes


STRESS_STEPS = [12, 24, 48, 96, 192, 384]


def orthogonal_scenes():
    """Calibration ramps from the procedural single-axis primitives
    (@spine-benchmark/calibration-primitives, emitted by emit_calibration.mjs).
    pure-fill isolates the rendering coefficient, pure-compute the computational
    one - cleanly, unlike the old catalog extremes which were contaminated and
    mis-graded (static RI over-read live by ~150x)."""
    prims = [
        ("calib-fill-light", "fill", "pure fill (coverage/overdraw), light"),
        ("calib-fill-heavy", "fill", "pure fill (coverage/overdraw), heavy"),
        ("calib-compute-light", "compute", "pure compute (physics/IK/deform), light"),
        ("calib-compute-heavy", "compute", "pure compute (physics/IK/deform), heavy"),
    ]
    out = []
    for pid, kind, label in prims:
        skel = f"calibration/assets/spine/{pid}/{pid}.json"
        atlas = f"calibration/assets/spine/{pid}/white.atlas"
        out.append({
            "id": f"calib--{pid}", "game": "calibration", "state": "stress",
            "description": f"Calibration ramp: {label}. Adaptive density ramp of a "
                           f"single-axis primitive to isolate the "
                           f"{'rendering' if kind == 'fill' else 'computational'} coefficient.",
            "refWidth": 1920, "refHeight": 1080, "background": [], "overlays": [],
            "stress": {"symbols": [{"skel": skel, "atlas": atlas}],
                       "steps": [4], "anims": "idle" if kind == "fill" else "mix"},
            "tier": "very-high",
        })
    return out


def main():
    all_scenes = []
    for game in SELECTED:
        if game in SKIP or game not in CATALOG:
            continue
        all_scenes.extend(build_for(game, CATALOG[game]))
    all_scenes.extend(orthogonal_scenes())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(all_scenes, indent=2))
    import collections
    byst = collections.Counter(s["state"] for s in all_scenes)
    bytier = collections.Counter(s["tier"] for s in all_scenes)
    print(f"{len(all_scenes)} scenes -> {OUT}")
    print("states:", dict(byst), "tiers:", dict(bytier))


if __name__ == "__main__":
    main()
