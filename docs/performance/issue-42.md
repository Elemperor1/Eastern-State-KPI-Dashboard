# Issue 42 performance evidence

Current profile recorded: 2026-07-14 17:32 UTC

Controlled baseline recorded: 2026-07-14 16:26 UTC

Runtime: authenticated local production builds

The repeatable profile uses a fresh authenticated browser context for each
route. Desktop is 1280 × 900 without throttling. Mobile is 390 × 844 with 4×
CPU slowdown, 150 ms latency, 1.6 Mbps download, and 0.75 Mbps upload.

| Destination | Desktop LCP | Desktop load | Mobile LCP | Mobile load | HTML | DOM | Full Board Report present |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Overview | 396 ms | 92 ms | 1,132 ms | 1,472 ms | 56,780 B | 229–230 | No |
| Data Entry | 100 ms | 80 ms | 1,136 ms | 1,713 ms | 64,325 B | 443–445 | No |
| Reports | 448 ms | 109 ms | 1,232 ms | 2,185 ms | 658,880 B | 6,627 | Yes, on request |
| Setup | 100 ms | 75 ms | 1,140 ms | 1,821 ms | 96,568 B | 438–439 | No |

Every request returned HTTP 200 and ended on its protected destination rather
than `/login`. Overview passed the automated limits: response below 2 seconds,
desktop LCP below 2 seconds, throttled-mobile LCP below 4 seconds, HTML below
250 KB, DOM below 1,000 elements, and no hidden Board Report.

## Controlled baseline

The baseline is a clean production build of commit
`14550ae4c20173ccd453a1a54608bb1f328e7967`, captured with the same browser,
authentication, viewport, CPU, and network settings. The old routes map to the
new product destinations as follows:

| Destination | Baseline route | Current route |
| --- | --- | --- |
| Overview | `/dashboard/overview?year=2026` | `/dashboard/overview?year=2026` |
| Data Entry | `/admin/strategy-data?year=2026` | `/data-entry?year=2026` |
| Reports | `/dashboard/trends?year=2026` | `/reports?view=board&year=2026` |
| Setup | `/admin` | `/setup?area=measures&year=2026` |

Only Overview is an exact route-and-purpose comparison. Its decoded document
fell from 971,362 to 56,780 bytes (**94.2% less**) and its DOM fell from
6,891 to 229–230 elements (**96.7% fewer**). The baseline contained the full
Board Report invisibly; the current Overview does not build or render it.
Data Entry, Reports, and Setup are recorded for traceability, but their routes
and visible responsibilities changed, so their raw timings are not presented
as like-for-like speed comparisons.

The complete measurements are in `issue-42-profile.json` and
`issue-42-baseline-profile.json`. Sixteen gzip-compressed Chrome trace JSON
files are in `traces/`: eight current and eight controlled-baseline traces.
Each trace passes `gzip -t` and contains parseable Chrome trace JSON.

Run the same profile against a production server:

```bash
BASE=http://127.0.0.1:3290 \
  PERF_EMAIL='<admin email>' PERF_PASSWORD='<admin password>' \
  npm run perf:profile
```

The credentials are used only to obtain a server-confirmed session. They are
not written to the measurements or trace filenames.

## Development watcher investigation

A normal `npm run dev` run reproduced the reported macOS `EMFILE` watcher
failure under this repository's file load. This is separate from production
page performance: the production build and authenticated traces above do not
use a file watcher. `npm run dev:stable` is the supported local fallback; it
runs the same server with `WATCHPACK_POLLING=true` and a 1-second polling
interval. The final bypass smoke and credentialed Playwright suite both passed
with polling, so watcher exhaustion no longer makes their route evidence
intermittent.

To repeat the controlled mapping against the baseline checkout, add
`PERF_PROFILE_MODE=baseline`; that mode writes the baseline JSON and uses the
four baseline routes listed above.
