---
target: 어드민 대시보드
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-31T23-32-06Z
slug: src-routes-admin-dashboard-page-svelte
---
# Critique — 어드민 대시보드 (`src/routes/admin/(dashboard)/+page.svelte`)

Method: dual-agent (A: design review · B: detector + evidence)
Mode: Operate. Surface: club-room live control panel used by a few operators, often one-handed on a phone in the room.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | `getTimeRemaining()` is evaluated once per render — countdowns are frozen between unrelated SSE mutations; no pending/submit state on any button; silent SSE reconnect. |
| 2 | Match System / Real World | 3 | Korean labels are natural and clubby ("이번주 빼기", "게임 폭파", "상황봐서"); only the generic "알림" title lets it down. |
| 3 | User Control and Freedom | 2 | Modals have Esc/backdrop/취소, but 게임 폭파 / 블랙 / 삭제 / 비참여자 퇴장 fire instantly with no undo. |
| 4 | Consistency and Standards | 1 | 105 hardcoded hex / zero `var(--…)` here vs the token system on the sibling monitor page; Svelte 4 `export let`/`$:` vs runes elsewhere; `.btn-delete` red reused for benign "숨기기" and for 퇴장/폭파/삭제; two separate alert/confirm implementations. |
| 5 | Error Prevention | 2 | Confirm exists only for playing-attendee removal and closeDay; no double-submit guard; `is_playing` checkboxes correctly disabled. |
| 6 | Recognition Rather Than Recall | 2 | Detail modals list participants, but the game-name combobox needs the exact name recalled; winner modal shows names only (no team/score context); score inputs are placeholder-only. |
| 7 | Flexibility and Efficiency | 2 | Quick-add chips and prefilled defaults help; no bulk check-in, no "end all games", no keyboard shortcuts, every action its own round-trip. |
| 8 | Aesthetic and Minimalist Design | 2 | Six identical grey cards, no visual priority; per-attendee row crams six controls; pipe-delimited recurring meta. |
| 9 | Error Recovery | 1 | Generic "알림" box for both success and failure; raw English `fail(500, 'Failed to create game')`; "필수 입력 항목" without marking the field. |
| 10 | Help and Documentation | 1 | One hint line under guest count; `title` attrs on penalty buttons; nothing explains the 매니저 toggle, penalty threshold, or what 폭파 does. |
| **Total** | | **17/40** | **Poor — major UX rework needed** |

Scores are harsh but each is tied to concrete evidence in the file.

## Design Specificity Verdict

**LLM assessment:** Generic composition with a domain-aware skin. The *content* is specific to a club room, and a few interactions are genuinely authored for this product: the playing-attendee removal fork ("게임 종료 및 퇴장" vs "참가자만 퇴장"), the collapsible "저장된 멤버" quick-add chips with penalty dots and blacklist-disable, "게임 폭파" slang, the schedule time defaulting to the next 10-minute mark, auto-named guests. But the *layout* is a stock vertical stack of six identical grey Bootstrap-blue CRUD cards that could be relabeled for any admin panel. Nothing in the composition says "a room that is happening right now": no at-a-glance room state, no urgency on games about to end, no live clock, and equal visual weight on "games ending now" and "weekly schedule housekeeping."

**Deterministic scan:** detector exit 2, 2 findings in the target, both `side-tab` (slop-pattern accent stripe): `+page.svelte:1461` (`.current-notice`, `border-left: 4px solid #ff9800`) and `+page.svelte:1780` (`.recurring-item`, `border-left: 4px solid #4caf50` on an already-bordered 8px-radius card — also a border-accent-on-rounded clash). Dir scan adds 5 more in siblings/imports: another `side-tab` in `passes/+page.svelte:237`, and `bounce-easing` + `border-accent-on-rounded` + `layout-transition` inside `monitor/PerformanceMonitor.svelte` (imported here). Manual pass confirms the big one: **105 hardcoded hex values (~45 distinct), zero theme tokens** in a codebase whose `css-theme` skill mandates `var(--xxx)`; 33 inline `style=` attributes; 20 distinct form actions on one page; modal backdrops are `<div role="button" tabindex="-1">` with two no-op `onkeydown={() => {}}` handlers (lines 689, 925); 4 non-interactive `<li onclick tabindex="0">` with suppressed (not fixed) a11y warnings.

**Visual overlays:** none — no browser automation is available in this environment and the app needs a DB-backed server, so no live page inspection or injected overlay was possible. Findings are source-based.

**Where A and B agree:** the theme-token gap (A flagged it P2; B quantified 105 hex / 0 tokens), the modal a11y weakness (A's Sam walkthrough; B's role/tabindex/no-op-keydown evidence), and the cross-page inconsistency (A noticed the monitor page differs; B's dir scan shows the monitor page on tokens, this page not).
**Where B adds what A missed:** the `side-tab` accent-stripe slop pattern and the imported `PerformanceMonitor` bounce easing.
**False positives (dropped):** empty `alt=""` at lines 726/965 (game name is adjacent text — decorative is defensible); inline styles on hand-authored SVG icons; every `{#each}`-line hex grep hit.

## Overall Impression

The person who wrote the *copy* and the *edge-case handling* clearly runs this room — the vocabulary and the removal fork prove it. But the *screen* doesn't behave like a live-room panel: the one section with clocks running out is dead last, and those clocks are frozen. The single biggest opportunity is to make the first viewport answer "what's my room doing right now?" in three seconds — a summary strip plus a live, sorted "게임 진행 중" block — and to make the destructive column safe to work next to.

## What's Working

1. **"저장된 멤버" quick-add** — collapsible chips with a per-member penalty dot and blacklist dimming/`disabled` state. Task-specific, speeds the repeated check-in job, and structurally prevents re-adding a blacklisted member.
2. **Playing-attendee removal fork** — the modal offering "게임 종료 및 퇴장" / "참가자만 퇴장" / "취소" as three distinct full-width choices correctly models a real club situation instead of a generic "Are you sure?".
3. **Domain vocabulary and small defaults** — "게임 폭파", "이번주 빼기", "상황봐서", next-10-minute schedule default, auto-named guests (게스트1, 게스트2…), the warm closeDay success line. These are the parts that feel authored.

## Priority Issues

### [P0] Live game timers never tick
- **What:** `getTimeRemaining()` is a pure function run once at render. There is no `setInterval` / `$effect` clock, so "12분 남음" and "종료됨" only change when an unrelated `games`/`visitors` SSE event fires `invalidateAll`. An operator walking the room triggers no mutations, so the display can be minutes stale.
- **Why it matters:** knowing which tables are about to free up is the core job of this screen. Frozen clocks make the primary section actively misleading.
- **Fix:** one 30-second ticking `$state` "now" timestamp that every `getTimeRemaining` call reads; sort/tint sessions with <5 min left to the top of "진행 중인 게임".
- **Suggested command:** `$impeccable harden`

### [P0] Destructive actions fire instantly and look identical to benign ones
- **What:** 게임 폭파 (`dissolveScheduledGame`), 블랙 (`toggleblacklist`), 삭제 (`deleteRecurringSchedule`) and 퇴장 for non-playing attendees all execute on first click. 게임 폭파 sits directly under 게임 시작 in the same modal. `.btn-delete` red is reused for the harmless "숨기기" notice button. No double-submit guard anywhere.
- **Why it matters:** one mis-tap one-handed in a busy room blacklists a member or deletes a recurring schedule, with no undo.
- **Fix:** route 폭파 / 삭제 / blacklist-set through the existing confirm-modal pattern; add a dedicated destructive-button treatment distinct from routine red; move 게임 폭파 out of the primary action cluster (secondary/“…” menu); give "숨기기" a neutral style; disable buttons while their form is submitting.
- **Suggested command:** `$impeccable harden`

### [P1] Section order buries the live room
- **What:** order is 공지 → 갈 예정 → 참여 인원 → 시작 예정 → 반복 게임 관리 → 진행 중인 게임. Notice editing and weekly-recurring admin are the two lowest-frequency tasks and they sit first and mid; the live "게임 진행 중" block is last.
- **Why it matters:** someone entering a running room needs "what's running / ending / who's here" first. Right now that is the longest scroll, worst on mobile where sections stack full-height.
- **Fix:** room-summary strip (N명 / N게임 / 다음 종료까지) → 진행 중인 게임 → 현재 참여 인원 → 시작 예정 게임 → 갈 예정 → 공지 → 반복 게임 관리 (or move 반복 게임 to its own subpage).
- **Suggested command:** `$impeccable layout`

### [P1] The per-attendee row is a 6-control decision point repeated up to 50×
- **What:** each `<li>` has name link + `−1` + `+1` + `블랙` + `매니저` + `퇴장` inline — 5 actions (2 destructive) plus a link. On mobile the targets shrink to `gap:0.15rem` / `padding:0.2rem 0.4rem` (~28–32px). SSE `invalidateAll` re-sorts the list under the operator's thumb mid-tap.
- **Why it matters:** violates minimal-choices (≤4), drives wrong-row errors one-handed, and scanning 50 rows of 6 controls is heavy cognitive load. 6 of the 8 cognitive-load checklist items fail on this page overall.
- **Fix:** row shows name + status badges + one "관리" affordance that opens a per-attendee sheet grouping penalty / blacklist / manager / 퇴장 with labels; keep at most one inline quick action, with confirm; freeze list order briefly after a mutation or animate the reorder.
- **Suggested command:** `$impeccable distill`

### [P2] No theme tokens, forced light mode, and failing contrast
- **What:** the page `<style>` is 105 raw hex values with zero `var(--…)`, while `monitor/+page.svelte` uses the token system and `+layout.svelte` hard-wraps admin in `data-theme="light" .force-light` + `color-scheme: light`. Contrast failures: `.list-arrow` #ccc on #fff (~1.6:1), `.hint` / `.meta` / `.recurring-status` #888 on #f9f9f9 (~3.5:1), `.empty-state` #999 on translucent white.
- **Why it matters:** inconsistent with the codebase and unmaintainable; overrides the operator's OS dark-mode choice on a screen used late at night in dim rooms; sub-AA text on a data-dense operational screen.
- **Fix:** migrate `<style>` to `css-theme` tokens, re-check every value against the dark palette, drop `force-light` (or at least expose a theme toggle in the admin header); raise muted-text and arrow colors to ≥4.5:1.
- **Suggested command:** `$impeccable audit`

Also worth fixing soon: the **"알림" modal is one undifferentiated success + error channel** (same box/title for "게임이 종료되고 승자가 기록되었습니다!" and "오류가 발생했습니다."), and several server errors surface as raw English. Typed toast/inline feedback with success/error variants and localized, specific messages → `$impeccable clarify`.

## Persona Red Flags

**Alex (fast operator, repeating the same actions all night):**
- Frozen `getTimeRemaining` values — the clocks he uses to see who's freeing a table are stale until an unrelated mutation fires.
- No double-submit guard on 인원 추가 / 게임 시작 / `+10분` — a double-tap on a laggy laptop makes a duplicate visitor, a second game, or +20분.
- SSE `invalidateAll` re-runs `ORDER BY is_playing, arrival_time DESC`; the attendee row resorts under his cursor and he hits 퇴장 on the wrong person.
- New-game modal's `.player-select` is up to 50 checkboxes with no search and no select-all, to start a 4-player game.
- "진행 중인 게임" — his most-used view — is the last section and the longest scroll.

**Sam (keyboard / screen reader / contrast):**
- Modals are `<div role="button|dialog" tabindex="-1">` with no focus trap, no focus-on-open, no return-focus; the Esc handler only fires if the backdrop div is focused, which it never is. Two backdrop `onkeydown` handlers are literal no-ops (lines 689, 925).
- `.game-list-item` and participant-search options are `<li onclick tabindex="0">` — a11y warnings suppressed, not fixed; no `role="option"`, no arrow-key navigation, no `aria-activedescendant`.
- Contrast failures listed in [P2]; `.force-light` + `color-scheme: light` also overrides OS high-contrast / dark preference with no opt-out.
- Score inputs and the game-name combobox are placeholder-only, no real label; combobox lacks `role="combobox"` / `aria-expanded`.

**Club operator triaging a busy Friday night, one-handed on a phone (project persona):**
- Running games are at the bottom; on mobile every section is full-height, so it's a long one-thumb scroll past the 50-person list to reach them.
- Attendee action row on mobile: five ~28–32px targets in a line including instant, no-confirm 퇴장 and 블랙.
- `.modal-content { max-height: 90vh; overflow-y: auto }` wrapped around a 50-checkbox `.player-select` puts 취소/시작 below the fold — she has to scroll the modal to submit.
- Custom combobox dropdown is `position:absolute` inside the `max-height:90vh` scroll container, so options render off-screen; `setTimeout(() => searchInput.focus())` then pops the keyboard and pushes them further.
- `datetime-local` one-handed is painful and there are no "+30분 / +1시간" quick chips, even though the code already computes a default time.
- Frozen timers hurt her most — walking the room she triggers no mutations, so nothing ever refreshes.

## Minor Observations

- Commented-out 예약/대기열 `<section>` (~50 lines, 590–640) left in the file — dead code.
- `guestCount` and `bind:this={searchInput}` are shared between the new-game and scheduled-game modals; opening one after the other carries the value / last-mounted ref wins.
- Playing-detail modal prints `new Date(g.end_time).toLocaleTimeString()` — raw locale time with seconds ("오후 11:47:03"), inconsistent with `formatScheduledTime`.
- No empty state for "현재 참여 인원" at 0 attendees — just an empty `<ul>` above the add form.
- `.empty-state { grid-column: 1 / -1 }` on flex (not grid) containers — leftover rule. Duplicate `.notice-manager { gap: 0.5rem }` in the 600px block.
- Three responsive breakpoints across two files (600px + 768px here, 768px in layout) — inconsistent thresholds.
- `+10분` / `+30분` use `.btn-extend` green, which reads as "success/go", not "modify time".
- `.attendee-link` navigates away from the live dashboard mid-shift with no "back to room" affordance.
- Long Korean names: `.list-name` truncates, but `.name-row` / `.attendee-link` do not — a long name + 블랙 + 페널티 badges squeezes the desktop action row.
- `side-tab` accent stripes on `.current-notice` and `.recurring-item` (detector) — swap for a background tint or a chip.

## Questions to Consider

1. If an operator only glances at this screen for three seconds between running the room, what single strip of numbers tells them everything — and why is the notice editor in that spot instead?
2. Why does editing a *weekly* recurring schedule sit higher on the screen than the games with clocks running out *right now*?
3. Has anyone watched the attendee list resort under their thumb after an SSE `invalidateAll`, and how many wrong 퇴장s has that caused?
4. Check-in is automatic via phone signal — how often is the operator really adding people by hand, and does the 50-checkbox participant picker solve a problem the BLE data already solved?
5. What does this layout actually do at 40 attendees and 8 simultaneous games on a phone — has anyone run that, or is "slice(0,5) + 더보기" hiding the real failure mode?
6. If "게임 폭파" earned its own slang, why is it the one destructive action with no confirmation?
