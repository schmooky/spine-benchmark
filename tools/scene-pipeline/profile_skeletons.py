#!/usr/bin/env python3
"""
Offline skeleton profiler for the spine-bench scene pipeline.

Walks the extracted game sources, finds every Spine skeleton (.json), pairs it
with its atlas, and computes a STATIC approximation of the canonical
Rendering-Impact (RI) and Computational-Impact (CI) scores used by the runner
(packages/metrics-impact-formula). The runner still measures the true live
values during play; this static grade is only used to bucket spines/scenes into
low / moderate / high / very-high so we can compose a deliberate spread.

Output: catalog.json — per game, every spine with its features + RI/CI + level,
animations, and repo-relative skeleton/atlas paths.

Usage:
    python3 profile_skeletons.py <games-src-root> [-o catalog.json]
"""
from __future__ import annotations
import json, os, sys, argparse, collections
from pathlib import Path

# ── canonical formula (mirror of packages/metrics-impact-formula/src/index.ts) ──
BRACKETS = (3, 8, 15, 25)  # low, moderate, high, very-high

def classify(score: float) -> str:
    if score >= BRACKETS[3]: return "very-high"
    if score >= BRACKETS[2]: return "high"
    if score >= BRACKETS[1]: return "moderate"
    if score >= BRACKETS[0]: return "low"
    return "minimal"

def rendering_impact(non_normal_blends: int, clipping: int, total_verts: int) -> float:
    return non_normal_blends * 3 + clipping * 5 + total_verts / 200

def computational_impact(ik, transform, path, physics,
                         total_verts, mesh_count, weighted, deformed) -> float:
    mc = max(mesh_count, 1)
    avg = total_verts / mc
    constraint = physics * 0.7 + path * 0.55 + ik * 0.35 + transform * 0.2
    dw = 0.08 + min(0.5, avg / 500)
    ww = 0.1 + min(0.55, avg / 450)
    mesh = deformed * dw + weighted * ww + total_verts / 2000
    return constraint + mesh

# ── skeleton parsing ──
def is_skeleton(doc) -> bool:
    return isinstance(doc, dict) and "skeleton" in doc and "bones" in doc

def iter_default_attachments(skins):
    """Yield (slot_name, attachment_name, attachment_dict) for the default skin.
    Spine 3.8+ skins are a list of {name, attachments}; older are a dict."""
    if isinstance(skins, list):
        chosen = next((s for s in skins if s.get("name") == "default"), None) or (skins[0] if skins else None)
        if not chosen: return
        for slot, atts in chosen.get("attachments", {}).items():
            for name, a in atts.items():
                yield slot, name, a
    elif isinstance(skins, dict):
        chosen = skins.get("default") or (next(iter(skins.values())) if skins else {})
        for slot, atts in chosen.items():
            for name, a in atts.items():
                yield slot, name, a

def deformed_slots(animations) -> set:
    """Slots that any animation deforms (mesh deform timelines)."""
    out = set()
    for anim in (animations or {}).values():
        deform = anim.get("deform")
        if isinstance(deform, dict):
            for skin, slots in deform.items():
                out.update(slots.keys())
    return out

BLEND_NORMAL = ("normal", None, "")

def profile_skeleton(path: Path) -> dict | None:
    try:
        doc = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return None
    if not is_skeleton(doc):
        return None

    slots = doc.get("slots", [])
    bones = doc.get("bones", [])
    animations = doc.get("animations", {})
    skins = doc.get("skins", [])

    non_normal = sum(1 for s in slots if s.get("blend", "normal") not in BLEND_NORMAL)
    ik = len(doc.get("ik", []))
    transform = len(doc.get("transform", []))
    path_c = len(doc.get("path", []))
    physics = len(doc.get("physics", []))

    deformable = deformed_slots(animations)
    total_verts = mesh_count = weighted = deformed = clipping = 0
    for slot, name, a in iter_default_attachments(skins):
        t = a.get("type", "region")
        if t == "clipping":
            clipping += 1
            continue
        if t not in ("mesh", "linkedmesh", "weightedmesh"):
            continue
        mesh_count += 1
        uvs = a.get("uvs")
        verts = a.get("vertices")
        vcount = (len(uvs) // 2) if isinstance(uvs, list) else 0
        total_verts += vcount
        if isinstance(verts, list) and isinstance(uvs, list) and len(verts) > len(uvs):
            weighted += 1
        if slot in deformable:
            deformed += 1

    ri = rendering_impact(non_normal, clipping, total_verts)
    ci = computational_impact(ik, transform, path_c, physics,
                              total_verts, mesh_count, weighted, deformed)
    return {
        "skeletonName": doc.get("skeleton", {}).get("name") or path.stem,
        "spineVersion": doc.get("skeleton", {}).get("spine"),
        "bones": len(bones),
        "slots": len(slots),
        "animations": list(animations.keys()),
        "features": {
            "vertices": total_verts, "nonNormalBlends": non_normal,
            "clippingMasks": clipping, "meshes": mesh_count,
            "weightedMeshes": weighted, "deformedMeshes": deformed,
            "ik": ik, "transform": transform, "path": path_c, "physics": physics,
        },
        "ri": round(ri, 3), "ci": round(ci, 3), "total": round(ri + ci, 3),
        "riLevel": classify(ri), "ciLevel": classify(ci),
        "totalLevel": classify(ri + ci),
    }

def referenced_regions(doc) -> set:
    """Region/path names a skeleton's attachments point into an atlas by."""
    out = set()
    for _slot, name, a in iter_default_attachments(doc.get("skins", [])):
        if a.get("type") in ("clipping", "boundingbox", "point", "path"):
            continue
        out.add(a.get("path") or name)
    return out

def atlas_regions(atlas: Path) -> set:
    """Region names declared in a .atlas (non-indented lines that aren't the
    page image or a key:value header)."""
    out = set()
    try:
        for line in atlas.read_text(encoding="utf-8", errors="replace").splitlines():
            if not line or line[0] in " \t":
                continue
            if ":" in line:  # key: value header (size/filter/pma/…)
                continue
            if re.search(r"\.(png|webp|jpg|jpeg|ktx2|basis)$", line, re.I):
                continue  # page image filename
            out.add(line.strip())
    except Exception:
        pass
    return out

def best_atlas(skel: Path, doc) -> Path | None:
    """Among atlases near the skeleton, pick the one whose regions best cover
    the skeleton's referenced attachments (dirs can hold several atlases)."""
    d = skel.parent
    cands: list[Path] = []
    cands += list(d.glob("*.atlas"))
    for q in ("1", "1.0", "0.75", "0.5"):
        cands += list((d / q).glob("*.atlas"))
    if not cands:
        cands += list(d.rglob("*.atlas"))
    if not cands:
        return None
    if len(cands) == 1:
        return cands[0]
    want = referenced_regions(doc)
    if not want:
        return cands[0]
    scored = [(len(want & atlas_regions(a)), -len(str(a)), a) for a in cands]
    scored.sort(reverse=True)
    return scored[0][2]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root")
    ap.add_argument("-o", "--out", default="catalog.json")
    args = ap.parse_args()
    root = Path(args.root).resolve()

    # game = two levels under root: <studio>/<game>
    catalog = {}
    skipped = 0
    for skel in root.rglob("*.json"):
        # only look inside assets/spine trees to avoid config/package json noise
        parts = skel.parts
        if "spine" not in parts and "spines" not in parts:
            continue
        rel = skel.relative_to(root)
        if len(rel.parts) < 2:
            continue
        studio, game = rel.parts[0], rel.parts[1]
        prof = profile_skeleton(skel)
        if not prof:
            skipped += 1
            continue
        try:
            doc = json.loads(skel.read_text(encoding="utf-8", errors="replace"))
        except Exception:
            doc = {}
        atlas = best_atlas(skel, doc)
        key = f"{studio}/{game}"
        prof["skel"] = str(rel)
        prof["atlas"] = str(atlas.relative_to(root)) if atlas else None
        prof["id"] = f"{game}--{skel.stem}"
        catalog.setdefault(key, {"studio": studio, "game": game, "spines": []})
        catalog[key]["spines"].append(prof)

    out = Path(args.out)
    out.write_text(json.dumps(catalog, indent=2))
    # summary
    games = len(catalog)
    spines = sum(len(g["spines"]) for g in catalog.values())
    print(f"games={games} spines={spines} skipped_nonskeleton={skipped} -> {out}")
    # level distribution
    dist = collections.Counter(s["totalLevel"] for g in catalog.values() for s in g["spines"])
    print("total-impact level distribution:", dict(dist))

if __name__ == "__main__":
    main()
