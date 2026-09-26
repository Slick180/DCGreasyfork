# Reference captures

This folder holds **genuine captured DartConnect DOM snapshots** for offline
parser development. Do not commit invented or hand-written markup here.

## Files (to be captured, not yet present)

- `schedule-normal.html` — full upcoming schedule page
- `schedule-delayed.html` — page containing postponed/expandable date groups
- `match-centre-live.html` — Match Center with live playing rows
- `match-centre-completed.html` — Match Center with completed rows

## How to capture

1. Open the relevant DartConnect URL in the browser.
2. Open DevTools → Elements, right-click the `<html>` element → Copy →
   Copy outerHTML (or Save Page, HTML only).
3. Save the result under the filename above, unmodified.
4. Note the capture date/competition stage in the commit message.

Captures must include the Schedule Filter panel (rosters) and, for delayed
pages, both collapsed and expanded states where practical (capture twice
if needed: collapsed, then expanded).
