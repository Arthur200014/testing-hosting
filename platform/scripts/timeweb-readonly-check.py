#!/usr/bin/env python3
"""Read-only production health/latency probe: no credentials or student data."""
from __future__ import annotations
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

PRODUCTION_ORIGIN = "https://arthur200014-testing-hosting-8c4e.twc1.net"
CHECKS = (
    ("/health/live", {200}),
    ("/health/ready", {200}),
    ("/health/migrations", {200}),
    ("/api/v1/teacher/students", {401, 403}),
)
NEW_API_PROBE = "/api/v1/teacher/schedule-rules/period-preview"
# This route returns the editor's public HTML only when the hosted Node relay is running.
# Health 200 alone did not catch the previous HTTP 502 relay failure.
BOARD_CHECKS = (
    ("/board-pilot/board/", {200}, "<title>Изолированный прототип доски</title>".encode("utf-8")),
    ("/board-pilot/cabinet/teacher.html", {200}, b"Teacher AI Student"),
)

@dataclass(frozen=True)
class Probe:
    path: str
    status: int | None
    ttfb_ms: float | None
    total_ms: float
    ok: bool

def probe(origin: str, path: str, allowed: set[int], *, timeout: float = 12,
          method: str = "GET", contains: bytes | None = None) -> Probe:
    start = time.perf_counter()
    # Anonymous POST to the read-only preview; authorization must reject it before any handler work.
    request = urllib.request.Request(
        origin.rstrip("/") + path,
        data=b"{}" if method == "POST" else None,
        headers={"Content-Type": "application/json"} if method == "POST" else {},
        method=method,
    )
    body = b""
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            ttfb = (time.perf_counter() - start) * 1000
            status = response.status
            body = response.read(4096)
    except urllib.error.HTTPError as error:
        ttfb = (time.perf_counter() - start) * 1000
        status = error.code
        error.close()
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        total = (time.perf_counter() - start) * 1000
        print(f"{path}: transport failure ({type(error).__name__})", file=sys.stderr)
        return Probe(path, None, None, round(total, 1), False)
    total = (time.perf_counter() - start) * 1000
    return Probe(path, status, round(ttfb, 1), round(total, 1),
                 status in allowed and (contains is None or contains in body))

def check_all(origin: str = PRODUCTION_ORIGIN) -> list[Probe]:
    results = [probe(origin, path, expected) for path, expected in CHECKS]
    # The new UI-03 API must exist and require authentication (not stale 404/405).
    results.append(probe(origin, NEW_API_PROBE, {401, 403}, method="POST"))
    results.extend(probe(origin, path, codes, contains=marker)
                   for path, codes, marker in BOARD_CHECKS)
    return results

def main() -> int:
    results = check_all()
    lines = ["| Public health / anonymous API probe | HTTP | TTFB (ms) | Total (ms) | Result |",
             "|---|---:|---:|---:|---|"]
    for result in results:
        label = "PASS" if result.ok else "FAIL"
        lines.append(f"| {result.path} | {result.status or '—'} | "
                     f"{result.ttfb_ms if result.ttfb_ms is not None else '—'} | "
                     f"{result.total_ms} | {label} |")
    table = "\n".join(lines)
    print(table)
    print("Anonymous UI-03 period-preview POST expects 401/403; 404/405 indicates missing or stale route.")
    print("Hosted board HTML 200 with the expected page title is required; 502, 404 and unrelated 200 pages fail.")
    print("No login or data writes; the running API revision and authenticated save/reload remain unverified.")
    summary = os.getenv("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as output:
            output.write("### Timeweb read-only health and latency\n\n" + table + "\n\n")
            output.write("No credentials, student data, imports, deploys or authenticated writes. "
                         "UI-03 anonymous preview POST must return 401/403. "
                         "Board pilot HTML pages must return HTTP 200 with expected content. "
                         "This probe does not identify the running commit or verify board persistence.\n")
    return 0 if all(result.ok for result in results) else 1

if __name__ == "__main__":
    raise SystemExit(main())
