#!/usr/bin/env python3
"""
youtube_transcript.py — reliable YouTube transcript fetcher for Cascade ingest.

The first, narrow source adapter behind the "external content -> knowledge
package" pipeline. Pulls a transcript by video URL or ID and emits a single
structured JSON object on stdout that an agent (or `cascade ingest`) can turn
into a knowledge package. Transcript-only: no yt-dlp / ffmpeg / browser — it
hits YouTube's timedtext endpoint via youtube-transcript-api, which is the most
dependency-light and reliable path from a residential IP.

Selection policy (most faithful first):
  1. a manually-created transcript in a preferred language
  2. an auto-generated transcript in a preferred language
  3. any transcript, translated to the first preferred language if possible

Every failure mode the library distinguishes is mapped to a stable, machine-
readable `error.code` so callers can react (retry, prompt for cookies, skip)
instead of parsing free text.

Usage:
  python3 youtube_transcript.py <url-or-id> [--languages en,es] [--text-only]
Exit codes: 0 ok · 2 bad args · 3 fetch error (see JSON error.code on stdout)
"""

from __future__ import annotations

import argparse
import json
import re
import sys


def extract_video_id(s: str) -> str | None:
    """Accept a bare 11-char ID or any common YouTube URL form."""
    s = s.strip()
    if re.fullmatch(r"[0-9A-Za-z_-]{11}", s):
        return s
    patterns = [
        r"(?:v=|/shorts/|/embed/|/v/|youtu\.be/|/live/)([0-9A-Za-z_-]{11})",
    ]
    for p in patterns:
        m = re.search(p, s)
        if m:
            return m.group(1)
    return None


def emit(obj: dict, code: int = 0):
    print(json.dumps(obj, ensure_ascii=False, indent=2))
    sys.exit(code)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video", help="YouTube URL or 11-char video ID")
    ap.add_argument("--languages", default="en",
                    help="comma-sep preferred language codes (default: en)")
    ap.add_argument("--text-only", action="store_true",
                    help="omit the per-snippet timed segments from output")
    args = ap.parse_args()

    video_id = extract_video_id(args.video)
    if not video_id:
        emit({"ok": False, "error": {"code": "BAD_INPUT",
              "message": f"Could not parse a video ID from: {args.video!r}"}}, 2)

    prefs = [c.strip() for c in args.languages.split(",") if c.strip()] or ["en"]

    # Import here so a clean BAD_INPUT/arg error doesn't require the dependency.
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        from youtube_transcript_api import (
            TranscriptsDisabled, NoTranscriptFound, VideoUnavailable,
            VideoUnplayable, IpBlocked, RequestBlocked, AgeRestricted,
            InvalidVideoId, YouTubeRequestFailed, CouldNotRetrieveTranscript,
        )
    except Exception as e:  # pragma: no cover
        emit({"ok": False, "error": {"code": "DEP_MISSING",
              "message": f"youtube-transcript-api not importable: {e}"}}, 3)

    api = YouTubeTranscriptApi()

    # Map exception types -> stable codes. Order matters (subclasses first).
    err_map = [
        (InvalidVideoId, "INVALID_VIDEO_ID"),
        (TranscriptsDisabled, "TRANSCRIPTS_DISABLED"),
        (NoTranscriptFound, "NO_TRANSCRIPT"),
        (AgeRestricted, "AGE_RESTRICTED"),
        (VideoUnplayable, "VIDEO_UNPLAYABLE"),
        (VideoUnavailable, "VIDEO_UNAVAILABLE"),
        (IpBlocked, "IP_BLOCKED"),
        (RequestBlocked, "REQUEST_BLOCKED"),
        (YouTubeRequestFailed, "REQUEST_FAILED"),
        (CouldNotRetrieveTranscript, "COULD_NOT_RETRIEVE"),
    ]

    def classify(exc) -> str:
        for typ, code in err_map:
            if isinstance(exc, typ):
                return code
        return "UNKNOWN"

    try:
        tlist = api.list(video_id)

        transcript = None
        selection = None
        # 1) manual in a preferred language
        try:
            transcript = tlist.find_manually_created_transcript(prefs)
            selection = "manual"
        except Exception:
            pass
        # 2) auto-generated in a preferred language
        if transcript is None:
            try:
                transcript = tlist.find_generated_transcript(prefs)
                selection = "generated"
            except Exception:
                pass
        # 3) any, translated to the first preference if translatable
        if transcript is None:
            any_t = next(iter(tlist), None)
            if any_t is None:
                emit({"ok": False, "error": {"code": "NO_TRANSCRIPT",
                      "message": "No transcripts of any language are listed."}}, 3)
            if prefs[0] not in (any_t.language_code,) and any_t.is_translatable:
                transcript = any_t.translate(prefs[0])
                selection = f"translated_from_{any_t.language_code}"
            else:
                transcript = any_t
                selection = "fallback_any"

        fetched = transcript.fetch()
        snippets = list(fetched)

        full_text = " ".join(s.text.replace("\n", " ").strip()
                             for s in snippets if s.text.strip())
        full_text = re.sub(r"\s+", " ", full_text).strip()
        duration = 0.0
        if snippets:
            last = snippets[-1]
            duration = round(last.start + (last.duration or 0), 1)

        out = {
            "ok": True,
            "source": {
                "kind": "youtube",
                "video_id": video_id,
                "url": f"https://www.youtube.com/watch?v={video_id}",
            },
            "transcript": {
                "language": transcript.language,
                "language_code": transcript.language_code,
                "is_generated": transcript.is_generated,
                "selection": selection,
                "snippet_count": len(snippets),
                "duration_seconds": duration,
                "word_count": len(full_text.split()),
                "char_count": len(full_text),
                "text": full_text,
            },
        }
        if not args.text_only:
            out["transcript"]["segments"] = [
                {"start": round(s.start, 2), "dur": round(s.duration or 0, 2),
                 "text": s.text} for s in snippets
            ]
        emit(out, 0)

    except SystemExit:
        raise
    except Exception as e:
        emit({"ok": False, "error": {"code": classify(e),
              "message": f"{type(e).__name__}: {e}",
              "video_id": video_id}}, 3)


if __name__ == "__main__":
    main()
