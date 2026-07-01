#!/usr/bin/env python3
"""
Upload the selected games' spine asset trees to the spine-run S3 bucket.

Keys mirror the games-src-relative path (e.g.
`reelnroll/stars-of-egypt/assets/spine/...`) so scene descriptors can stay
path-relative and only the ASSET base URL changes between local and S3.

Idempotent: skips objects already present with the same byte size.
Objects are public-read; the bucket already has GET/HEAD CORS for '*'.

Env: reads ~/.spine-s3-creds (AWS_ACCESS_KEY_ID / SECRET / S3_ENDPOINT /
S3_BUCKET / S3_REGION). Run from anywhere.

Usage:
    python3 upload_assets.py <games-src-root> [--games selected_games.json] [--dry-run]
"""
from __future__ import annotations
import os, sys, json, argparse, mimetypes
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import boto3
from botocore.config import Config

CT = {
    ".json": "application/json", ".atlas": "text/plain", ".webp": "image/webp",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".skel": "application/octet-stream", ".fnt": "text/plain",
}

def load_creds():
    p = Path.home() / ".spine-s3-creds"
    env = {}
    for line in p.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env

def client(env):
    return boto3.client(
        "s3", endpoint_url=env["S3_ENDPOINT"],
        aws_access_key_id=env["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=env["AWS_SECRET_ACCESS_KEY"],
        region_name=env["S3_REGION"],
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"},
                      connect_timeout=15, read_timeout=60, retries={"max_attempts": 3}),
    )

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root")
    ap.add_argument("--games", default=str(Path(__file__).parent / "selected_games.json"))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    root = Path(args.root).resolve()
    games = json.loads(Path(args.games).read_text())["games"]
    env = load_creds()
    bucket = env["S3_BUCKET"]
    s3 = client(env)

    # gather files: asset spine trees only (dirs named spine OR spines that live
    # under an assets/ path - never source dirs like src/libs/spine).
    files: list[tuple[Path, str, int]] = []  # (path, key, size)
    for g in games:
        gdir = root / g
        spine_dirs = [
            d
            for name in ("spine", "spines")
            for d in gdir.rglob(name)
            if d.is_dir() and "assets" in d.relative_to(gdir).parts
        ]
        for sd in spine_dirs:
            for f in sd.rglob("*"):
                if f.is_file():
                    key = str(f.relative_to(root))
                    files.append((f, key, f.stat().st_size))
    total_mb = sum(s for _, _, s in files) / 1e6
    print(f"{len(files)} files, {total_mb:.1f} MB across {len(games)} games")
    if args.dry_run:
        for _, k, s in files[:15]:
            print("  ", k, s)
        print("  … (dry run)")
        return

    # skip existing (same size)
    def head_size(key):
        try:
            return s3.head_object(Bucket=bucket, Key=key)["ContentLength"]
        except Exception:
            return None

    def upload(item):
        path, key, size = item
        existing = head_size(key)
        if existing == size:
            return ("skip", key)
        ct = CT.get(path.suffix.lower(), mimetypes.guess_type(path.name)[0] or "application/octet-stream")
        with path.open("rb") as fh:
            s3.put_object(Bucket=bucket, Key=key, Body=fh, ContentType=ct, ACL="public-read")
        return ("put", key)

    done = put = skip = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(upload, it) for it in files]
        for fu in as_completed(futs):
            action, key = fu.result()
            done += 1
            if action == "put": put += 1
            else: skip += 1
            if done % 50 == 0 or done == len(files):
                print(f"  {done}/{len(files)}  put={put} skip={skip}")
    print(f"done: uploaded {put}, skipped {skip}")
    print(f"base URL: {env['S3_ENDPOINT']}/{bucket}/")

if __name__ == "__main__":
    main()
