# End-to-End Sync Walkthrough

> Manual verification before the v1 production build. Goal: prove that sync works
> across all three browser families (Chromium, Firefox, Safari) and that conflict
> handling behaves as designed.

## Prerequisites

- [ ] Junction is running (`npm run electron:dev` or installed app)
- [ ] Logged in (Magic-Link auth completed; `auth:status` shows authenticated)
- [ ] Three browsers installed: **Chrome**, **Firefox**, **Safari**
- [ ] Safari permission granted (System Settings → Privacy & Security → Full Disk Access → Junction enabled)
- [ ] All three browsers enabled in Junction Settings
- [ ] At least one successful baseline sync completed today

## Pre-Test Snapshot

Note these numbers before starting (so you can verify deltas):

- [ ] Total bookmarks in `bookmarks_cloud`: ______
- [ ] Last successful sync timestamp visible in UI: ______
- [ ] Conflict log "open" count: ______ (expected: 0)

Run in Supabase SQL Editor:
```sql
select count(*) as total from public.bookmarks_cloud;
select count(*) as open_conflicts from public.conflict_log where status = 'open';
```

---

## Test 1 — Chromium-family seed (Chrome → Cloud → Firefox + Safari)

**Setup**
- [ ] All three browsers closed (Cmd+Q, not just window-close)

**Steps**
1. [ ] Open Chrome only
2. [ ] Add bookmark: title `Junction-Test-Chrome`, URL `https://example.com/junction-chrome-1`, place in **Bookmarks Bar**
3. [ ] Quit Chrome (Cmd+Q)
4. [ ] In Junction tray menu → **Jetzt synchronisieren**
5. [ ] Wait for sync to complete (status: success, no error)
6. [ ] Open Firefox
7. [ ] **Verify:** `Junction-Test-Chrome` appears in Firefox's Bookmarks Toolbar
8. [ ] Quit Firefox
9. [ ] Open Safari
10. [ ] **Verify:** `Junction-Test-Chrome` appears in Safari's Favorites
11. [ ] Quit Safari

**Expected**
- One new bookmark in `bookmarks_cloud` with `source_browsers: ['chrome', 'firefox', 'safari']` after step 10
- Sync log shows three drivers: chrome read, firefox write, safari write
- Total count incremented by 1

**Rollback if it fails**
- Note exact error message and which step failed
- Check `~/Library/Application Support/Junction/logs/sync-runs/` for the run log

---

## Test 2 — Firefox seed (Firefox → Cloud → Chrome + Safari)

Tests the reverse direction and the lock-handling path (Firefox `places.sqlite`
copy-then-read when the browser is open vs. closed).

**Steps**
1. [ ] Quit all three browsers
2. [ ] Open Firefox only
3. [ ] Add bookmark: title `Junction-Test-Firefox`, URL `https://example.com/junction-firefox-1`, place in **Bookmarks Toolbar**
4. [ ] Quit Firefox
5. [ ] Junction tray → **Jetzt synchronisieren**
6. [ ] Open Chrome → **Verify:** `Junction-Test-Firefox` in Bookmarks Bar → Quit
7. [ ] Open Safari → **Verify:** `Junction-Test-Firefox` in Favorites → Quit

**Expected**
- New bookmark with `source_browsers` containing all three browsers
- Folder placement: bar/toolbar/favorites should map consistently across browsers

---

## Test 3 — Safari seed (Safari → Cloud → Chrome + Firefox)

Closes the loop on the Apple-side adapter.

**Steps**
1. [ ] Quit all browsers
2. [ ] Open Safari
3. [ ] Add bookmark: title `Junction-Test-Safari`, URL `https://example.com/junction-safari-1`, in **Favorites**
4. [ ] Quit Safari
5. [ ] Sync via tray
6. [ ] Verify in Chrome and Firefox

---

## Test 4 — Conflict provocation

Force a real Last-Write-Wins decision and verify the conflict log captures it.

**Setup**
- [ ] All three browsers closed

**Steps**
1. [ ] Open Chrome only
2. [ ] Edit `Junction-Test-Firefox` (created in Test 2): change title to `Junction-Test-Conflict-Chrome-Edit`
3. [ ] Quit Chrome
4. [ ] Open Firefox
5. [ ] Edit the same bookmark in Firefox: change title to `Junction-Test-Conflict-Firefox-Edit`
6. [ ] Quit Firefox
7. [ ] Junction tray → **Jetzt synchronisieren**

**Expected**
- One new entry in conflict log (status: open)
- Either Chrome or Firefox version wins (LWW based on `lastModified`)
- Entry visible in Junction's Conflict-Log UI with side-by-side diff
- `winner_browser_id` and `loser_browser_id` populated
- Both Chrome and Firefox bookmarks now show the winning title after the sync

Verify in Supabase:
```sql
select id, winner_browser_id, loser_browser_id, status, created_at
from public.conflict_log
where status = 'open'
order by created_at desc
limit 5;
```

---

## Test 5 — Conflict restore

**Steps**
1. [ ] Open Junction main window → Conflicts page
2. [ ] Click on the conflict from Test 4
3. [ ] Click **Wiederherstellen** (restore loser version)
4. [ ] Wait for the follow-up sync to complete
5. [ ] Open Chrome and Firefox
6. [ ] **Verify:** the bookmark title now matches the previously-losing version
7. [ ] **Verify:** the conflict's status changed to `restored` in the UI

---

## Test 6 — Browser-Lock behavior

Junction must not corrupt data when a Chromium browser is open during sync.

**Steps**
1. [ ] Open Chrome (and leave it open)
2. [ ] Junction tray → **Jetzt synchronisieren**
3. [ ] **Verify:** sync run completes; Chrome appears in the plan with reason `browser-running-write` (skipped for write, may still be read)
4. [ ] Quit Chrome
5. [ ] Re-trigger sync
6. [ ] **Verify:** this time Chrome is included for both read and write

For Firefox/Zen, the adapter uses copy-then-read so it can read a running browser
without lock errors. Confirm this:

7. [ ] Open Firefox (leave it open)
8. [ ] Sync via tray
9. [ ] **Verify:** Firefox is in the plan with read access; sync completes without `places.sqlite is locked` error

---

## Test 7 — Auto-trigger after online recovery

**Steps**
1. [ ] Disable Wi-Fi (or pull the network)
2. [ ] Add a bookmark in any browser, quit
3. [ ] Trigger sync from tray
4. [ ] **Verify:** UI shows `skipped-offline`
5. [ ] Re-enable Wi-Fi
6. [ ] Wait up to ~30 seconds (auto-trigger online recovery interval)
7. [ ] **Verify:** sync auto-runs and completes successfully

---

## Cleanup

After all tests pass, remove the test bookmarks from any one browser and run a sync
to propagate the deletion. They should disappear from `bookmarks_cloud` and the
other browsers.

- [ ] Delete `Junction-Test-Chrome`, `Junction-Test-Firefox` (or its renamed form),
      `Junction-Test-Safari` from one browser
- [ ] Trigger sync
- [ ] Verify deletions in the other two browsers
- [ ] Verify `bookmarks_cloud` total count returned to baseline

---

## Pass criteria

All seven tests must complete without:
- Sync errors (other than the explicit lock-skip in Test 6.3)
- Silent data loss (every change must be visible in the conflict log if it lost)
- Crashes
- `places.sqlite is locked` errors
- Permission prompts after the initial setup

If everything passes, this build is **green-lit** for `npm run electron:build`.
