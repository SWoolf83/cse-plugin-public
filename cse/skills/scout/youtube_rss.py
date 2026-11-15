#!/usr/bin/env python3
"""
youtube_rss.py — dependency-light YouTube channel RSS fetch+parse for Scout.

Scout's first source adapter. Given a YouTube channel id (UC...), it pulls the
channel's FREE, KEYLESS Atom feed:

    https://www.youtube.com/feeds/videos.xml?channel_id=<id>

…and emits a single structured JSON object on stdout listing the latest items
{video_id, title, published, url, author}. No API key, no yt-dlp/ffmpeg/browser
— just stdlib urllib + xml.etree. Reliable from a residential IP (the same
constraint as ingest's transcript adapter; cloud-IP harvest is out of scope).

Mirrors youtube_transcript.py: every failure maps to a stable, machine-readable
`error.code` so Scout can react (skip, retry, warn) instead of parsing free text.

FALLBACK (2026-11-14): YouTube's RSS endpoint has had recurring outages since
Dec 2025 where it returns 404 for EVERY channel. When the feed fails, this
adapter lists the channel's latest uploads with yt-dlp (free, keyless; install
with `brew install yt-dlp`) and emits the same shape with source.via='yt-dlp'
and items' published dates marked approximate. If yt-dlp is missing or fails,
a 404 is diagnosed against a control channel: when the control feed also 404s
the error is FEED_UNAVAILABLE (YouTube-wide), not CHANNEL_NOT_FOUND.
Pass --no-fallback to use RSS only.

Usage:
  python3 youtube_rss.py <channel_id | feed-url> [--limit N] [--since ISO8601]
Exit codes: 0 ok · 2 bad args · 3 fetch/parse error (see JSON error.code)
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

FEED_TMPL = "https://www.youtube.com/feeds/videos.xml?channel_id={cid}"
# A long-lived, always-public channel (Google for Developers) used to tell a
# YouTube-wide feed outage from a bad channel id.
CONTROL_CHANNEL_ID = "UC_x5XG1OV2P6uZZ5FSM9Ttw"

# Atom + YouTube/Media Atom namespaces used in the channel feed.
NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
    "media": "http://search.yahoo.com/mrss/",
}

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def emit(obj: dict, code: int = 0):
    print(json.dumps(obj, ensure_ascii=False, indent=2))
    sys.exit(code)


CHANNEL_ID_RE = re.compile(r"^UC[0-9A-Za-z_-]{22}$")


def resolve_feed_url(arg: str) -> str | None:
    """Accept a bare UC... channel id, a full feed url, or a channel page url."""
    s = arg.strip()
    if CHANNEL_ID_RE.match(s):
        return FEED_TMPL.format(cid=s)
    if "feeds/videos.xml" in s and "channel_id=" in s:
        return s
    # /channel/UC... page url → derive channel id
    m = re.search(r"/channel/(UC[0-9A-Za-z_-]{22})", s)
    if m:
        return FEED_TMPL.format(cid=m.group(1))
    return None


def parse_iso(ts: str) -> datetime | None:
    if not ts:
        return None
    try:
        # Atom timestamps look like 2024-01-02T03:04:05+00:00
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


def feed_status(url: str) -> int | None:
    """HTTP status of a feed URL (None on network error)."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return None


def ytdlp_items(channel_id: str, limit: int, since_dt):
    """Latest uploads via yt-dlp (flat listing, approximate dates). None if unavailable/failed."""
    exe = shutil.which("yt-dlp")
    if not exe or not channel_id:
        return None
    cmd = [exe, "--flat-playlist", "--dump-single-json", "--no-warnings",
           "--playlist-items", f"1-{max(1, limit)}",
           "--extractor-args", "youtubetab:approximate_date",
           f"https://www.youtube.com/channel/{channel_id}/videos"]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        if out.returncode != 0:
            return None
        data = json.loads(out.stdout)
    except Exception:
        return None
    title = data.get("channel") or data.get("uploader") or data.get("title")
    items = []
    for e in data.get("entries") or []:
        vid = e.get("id")
        if not vid:
            continue
        ts = e.get("timestamp")
        published = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if isinstance(ts, (int, float)) else None
        if since_dt is not None and published:
            if datetime.fromisoformat(published) <= since_dt:
                continue
        items.append({
            "video_id": vid,
            "title": (e.get("title") or "").strip(),
            "published": published,
            "published_approximate": True,
            "url": f"https://www.youtube.com/watch?v={vid}",
            "author": title,
        })
    return {"channel_title": title, "items": items[: max(0, limit)]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("channel", help="YouTube channel id (UC...) or feed/channel URL")
    ap.add_argument("--limit", type=int, default=15,
                    help="max items to return (default: 15)")
    ap.add_argument("--since", default=None,
                    help="only items published strictly after this ISO8601 ts "
                         "(the source's last_pulled watermark)")
    ap.add_argument("--no-fallback", action="store_true",
                    help="RSS only; do not fall back to yt-dlp when the feed fails")
    args = ap.parse_args()

    feed_url = resolve_feed_url(args.channel)
    if not feed_url:
        emit({"ok": False, "error": {"code": "BAD_INPUT",
              "message": f"Could not derive a feed URL from: {args.channel!r}"}}, 2)

    since_dt = None
    if args.since:
        since_dt = parse_iso(args.since)
        if since_dt is None:
            emit({"ok": False, "error": {"code": "BAD_INPUT",
                  "message": f"--since is not ISO8601: {args.since!r}"}}, 2)
        if since_dt.tzinfo is None:
            since_dt = since_dt.replace(tzinfo=timezone.utc)

    req = urllib.request.Request(feed_url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as e:
        cid_m = re.search(r"channel_id=([^&]+)", feed_url)
        cid = cid_m.group(1) if cid_m else None
        if not args.no_fallback and e.code != 429:
            fb = ytdlp_items(cid, args.limit, since_dt)
            if fb is not None:
                emit({
                    "ok": True,
                    "source": {"kind": "youtube_channel", "channel_id": cid,
                               "channel_title": fb["channel_title"], "feed_url": feed_url,
                               "via": "yt-dlp", "feed_http_status": e.code},
                    "filter": {"since": args.since, "limit": args.limit},
                    "count": len(fb["items"]),
                    "items": fb["items"],
                }, 0)
        # 404: tell a YouTube-wide feed outage from a bad channel id.
        if e.code == 404:
            control = feed_status(FEED_TMPL.format(cid=CONTROL_CHANNEL_ID))
            code = "FEED_UNAVAILABLE" if control == 404 else "CHANNEL_NOT_FOUND"
        else:
            code = "RATE_LIMITED" if e.code == 429 else "HTTP_ERROR"
        hint = (" YouTube's RSS feed is failing for every channel; install yt-dlp "
                "(brew install yt-dlp) for the fallback, or retry later.") if code == "FEED_UNAVAILABLE" else ""
        emit({"ok": False, "error": {"code": code,
              "message": f"HTTP {e.code} fetching feed.{hint}", "feed_url": feed_url}}, 3)
    except urllib.error.URLError as e:
        emit({"ok": False, "error": {"code": "NETWORK_ERROR",
              "message": f"{e.reason}", "feed_url": feed_url}}, 3)
    except Exception as e:  # pragma: no cover
        emit({"ok": False, "error": {"code": "FETCH_FAILED",
              "message": f"{type(e).__name__}: {e}", "feed_url": feed_url}}, 3)

    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        emit({"ok": False, "error": {"code": "PARSE_ERROR",
              "message": f"XML parse failed: {e}", "feed_url": feed_url}}, 3)

    # Prefer the canonical channel id from the feed URL (always the full UC...).
    # The feed's yt:channelId can omit the "UC" prefix in some responses, so use
    # it only as a fallback.
    channel_id = None
    m = re.search(r"channel_id=([^&]+)", feed_url)
    if m:
        channel_id = m.group(1)
    if not channel_id:
        cid_el = root.find("yt:channelId", NS)
        if cid_el is not None and cid_el.text:
            channel_id = cid_el.text

    chan_title_el = root.find("atom:title", NS)
    channel_title = chan_title_el.text if chan_title_el is not None else None

    items = []
    for entry in root.findall("atom:entry", NS):
        vid_el = entry.find("yt:videoId", NS)
        title_el = entry.find("atom:title", NS)
        pub_el = entry.find("atom:published", NS)
        author_el = entry.find("atom:author/atom:name", NS)

        video_id = vid_el.text if vid_el is not None else None
        if not video_id:
            continue
        published = pub_el.text if pub_el is not None else None

        if since_dt is not None:
            pub_dt = parse_iso(published or "")
            if pub_dt is not None:
                if pub_dt.tzinfo is None:
                    pub_dt = pub_dt.replace(tzinfo=timezone.utc)
                if pub_dt <= since_dt:
                    continue  # not new since last_pulled

        items.append({
            "video_id": video_id,
            "title": (title_el.text if title_el is not None else "").strip(),
            "published": published,
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "author": author_el.text if author_el is not None else channel_title,
        })

    # Feed is newest-first; honor --limit after the --since filter.
    items = items[: max(0, args.limit)]

    emit({
        "ok": True,
        "source": {
            "kind": "youtube_channel",
            "channel_id": channel_id,
            "channel_title": channel_title,
            "feed_url": feed_url,
        },
        "filter": {"since": args.since, "limit": args.limit},
        "count": len(items),
        "items": items,
    }, 0)


if __name__ == "__main__":
    main()
