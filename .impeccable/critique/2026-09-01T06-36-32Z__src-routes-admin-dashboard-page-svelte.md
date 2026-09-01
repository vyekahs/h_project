---
target: 어드민 대시보드
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-01T06-36-32Z
slug: src-routes-admin-dashboard-page-svelte
---
# Critique (re-review) — 어드민 대시보드 (`src/routes/admin/(dashboard)/+page.svelte`)

Method: dual-agent (A: design review · B: detector + evidence)
Mode: Operate. This is a re-review after a 6-commit refactor pass (previous score 17/40).

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Strip + 30s tick + countdown + `.ending-soon` tint + empty states + distinct "완료" all landed. But zero in-flight/pending state on any submit; the 30s clock lets "5분 남음" sit stale up to 30s; the strip is not `aria-live`. |
| 2 | Match System / Real World | 3 | 27 server strings + the whole UI now Korean; club vocabulary ("첫 종료", "이번주 빼기", "폭파"). "관리"/"추가" still vague; `formatTime` emits "오후 09:30" AM/PM in a 24h-hours domain. |
| 3 | User Control and Freedom | 2 | Confirm modals + Esc + consistent 취소 are new. But no focus-return on close, no undo on 매니저 toggle, and modal-on-modal (sheet → confirm) drops focus to `<body>`. |
| 4 | Consistency and Standards | 2 | ~15 button classes; `.btn-delete` red overloaded for 폭파 / 게임 종료 / 퇴장 / 삭제; two close-button patterns; penalty is inline in the row AND duplicated in the sheet; scattered inline `style=`. |
| 5 | Error Prevention | 2 | Confirm gates + `submitLock` + disabled checkboxes for playing users + guestCount clamp are wins. But new-game still submits with 0 players → generic alert, min/max not cross-checked, and blacklist is a silent 404 (P0). |
| 6 | Recognition Rather Than Recall | 3 | Sheet sublabels show live state ("현재 3점", "등록됨 — 입장·참여 제한"); game rows show thumb + count + time. But the 50-checkbox new-game picker has no search/filter — pure scan-and-recall. |
| 7 | Flexibility and Efficiency | 2 | show-more, quick-add chips, +10/+30, prefilled time help. But `submitLock`'s 2.5s dead button punishes repeat operators, blacklist is now 4 taps, no shortcuts, no bulk. |
| 8 | Aesthetic and Minimalist Design | 2 | Strip is restrained; side-tab stripes removed; media queries merged. Still 7 equal-weight full-height cards on one long scroll; `#f9f9f9` cards on `#f5f5f5` page = low separation. |
| 9 | Error Recovery | 2 | `showAlert(kind)` + red "문제가 발생했어요" + Korean server messages. But every error is one generic centered modal, "필수 입력 항목" doesn't name the field, and `result.type === 'error'` (the 404) is unhandled → nothing shows at all. |
| 10 | Help and Documentation | 2 | `.hint` under guest count, sheet sublabels, `title=` on penalty buttons. Thin for a panel this dense; no tooltips on 폭파 / 스킵 / 메인표시. |
| **Total** | | **23/40** | **Acceptable — significant improvements still needed** |

## Design Specificity Verdict

**LLM assessment:** It now reads as a club-room panel in patches, not throughout. The `.room-summary` strip ("N명 현재 · 게임 N개 진행 중 · N분 후 첫 종료") plus the end-time-ascending sort with `.ending-soon` tint on `<5min` is authored for THIS product — a café operator genuinely wants to know which table frees up next, and the strip is a restrained text sentence, not the hero-metric-tile template the craft floor warns against. The manage sheet's current-state sublabels are real product copy. But the canvas around these islands is still generic CRUD: seven identical `#f9f9f9` cards with `1px solid #eee` and `margin-bottom: 3rem`, same-weight `<h2>`s, Bootstrap `#007bff` buttons, ~40 inline SVGs. The time-critical "진행 중인 게임" card is visually indistinguishable from "공지사항 관리".

**Deterministic scan:** detector **exit 0 — zero findings** on the target (previous run: 2 `side-tab`). Dir scan surfaces 4 findings but **all in sibling routes** — `monitor/PerformanceMonitor.svelte` (bounce-easing, border-accent-on-rounded), `passes/+page.svelte` (side-tab), `stats/+page.svelte` (layout-transition); none in this file, and the target imports no components. `svelte-check`: 1 error / 14 warnings across 7 files, **none in this route**; the 1 error is the pre-existing unrelated `pushSubscription.ts` / `PUBLIC_VAPID_KEY`. Manual grep: **133 hardcoded hex (55 distinct), 0 `var(--…)`, 0 token definitions** in this file — the css-theme system is still entirely unused here (deferred work, not a regression). 9 dialogs, each `<div role tabindex="-1">`; `use:autofocus` on 2 buttons only; **no focus trap, no focus restore**; Escape handlers exist on every backdrop but only fire if the backdrop holds focus, and there is no `svelte:window` keydown. 2 `svelte-ignore` comments remain (on the `search-select` wrappers). `setTimeout`: 300 (debounce), 3000 (SSE reconnect), **2500 (submitLock re-enable)**, 0 (search focus).

**Visual overlays:** none — no browser automation in this environment and the app needs a DB-backed server, so no live inspection or injected overlay. Findings are source-based.

**Where A and B agree:** no focus trap / restore on any modal (A P2; B: autofocus on 2 buttons, no trap, no return-focus, Escape only works when backdrop focused); `submitLock` is a 2500 ms timer not a request lifecycle (A P1; B: L59 `setTimeout(…, 2500)`); the new-game participant picker is an unbounded `{#each attendees}` of raw checkboxes (A P1; B: L788, no slice); theming untouched (A verdict; B: 133 hex / 0 tokens).
**Where B adds precision:** exact hex/modal/`setTimeout` inventory; confirms the target file itself is detector-clean and the dir-scan hits are all other routes.
**New finding neither the old critique nor the detector caught — verified in-session:** the blacklist action is a dead reference (P0 below).

## Overall Impression

The refactor did what it set out to do on visibility and safety: the room strip, live countdown, ending-soon sort, confirm-with-consequences copy, and the green/red success-vs-error split are all real, product-specific gains, and the score moved 17 → 23. But three of the original P0/P1s were not touched — the flat 7-card hierarchy, the un-simplified mega-modals, and (still) no pending state — and the blacklist path regressed to fully broken because the sheet is now its only entry point and its form points at an action name that does not exist. The single biggest opportunity is no longer "add a summary strip"; it is **make the live blocks visually outrank the admin chores, and make every submit show that it's working.**

## What's Working

1. **`.room-summary` strip + end-ascending sort + `.ending-soon` tint** (`#fff5f5` row bg, red-bold `.time-remaining`): the one authentically product-specific move, executed with restraint — a text strip at `0.95rem` with a small live dot, not metric tiles.
2. **Confirm-modal copy**: `confirmState.message` names the person and the irreversible consequence in plain Korean ("…님을 블랙리스트에 등록합니다. 이후 입장·게임 참여가 제한됩니다"). A measurable drop in "did I nuke the wrong row" dread versus the old bare destructive buttons.
3. **Manage-sheet state sublabels**: `.manage-sub` showing "현재 N점 / 등록됨 / 매니저" is recognition-over-recall, and it collapsed a 6-control attendee row to name + badges + ±1 + one 관리 button.
4. **Accessibility floor moved up**: real `<button>` for game-list and search-result items (2 `svelte-ignore` gone from those), contrast bumps (`#999 → #6b7280` etc.), 27 Korean `fail()` strings.

## Priority Issues

### [P0] Blacklist toggle is a dead reference — fails silently
- **What:** the manage-sheet form posts `action="?/toggleblacklist"` (page line 959) but the server action is `toggleBlacklist` (camelCase, `+page.server.ts:558`). SvelteKit action names are case-sensitive → 404 "No action with name 'toggleblacklist'". The `use:enhance` handlers only branch on `result.type === 'failure'`; a 404 is `result.type === 'error'`, so **nothing renders** — no alert, no state change, sheet still says "미등록". This bug predates this session, but the refactor removed the inline row button, so the sheet is now the *only* way to blacklist from the dashboard — i.e. blacklisting is currently unreachable.
- **Why it matters:** the highest-stakes action in the panel, failing with zero feedback. Product principle #2 is "시스템이 공정성을 보장한다" — blacklist is core to that.
- **Fix:** change the ref to `?/toggleBlacklist`; add an `else if (result.type === 'error')` branch to the shared enhance handlers (and `confirmSubmit`'s default handler) so transport/HTTP errors surface as an error alert instead of vanishing. Add a smoke test that POSTs every `?/action` on this route and asserts no 404.
- **Suggested command:** `$impeccable harden`

### [P1] No pending state; `submitLock` is a timer, not a lifecycle
- **What:** `submitLock` disables buttons for a hardcoded `setTimeout(…, 2500)` regardless of whether the request finished. On slow café wifi the button re-enables while the request is still in flight — the double-submit window it was built to close reopens, and a late "게임 시작" creates two sessions. On a fast server the button is dead for 2.5 s after it already succeeded. No spinner or label change anywhere.
- **Why it matters:** every 인원 추가 / penalty / 게임 시작 / +10분 carries a half-second "did it take?"; the timer makes that worse both directions.
- **Fix:** drive `disabled` + a spinner/label swap from `enhance`'s submit → `update()` completion, not a clock. Replace `submitLock` with an enhance wrapper that owns the button state for the real request duration.
- **Suggested command:** `$impeccable harden`

### [P1] New-game participant picker was not simplified
- **What:** up to 50 bare `<input type=checkbox>` in a `flex-wrap` blob (`{#each attendees}` at L788, no slice), no search, no select-all, no "present and not playing" default; playing users are greyed but still fill the list. Still the top cognitive-load offender and phone-hostile. The scheduled-game modal (~9 controls) and playing-detail modal (6 actions) are also unchanged.
- **Why it matters:** the most frequent modal on a busy night is the slowest to operate, worst one-handed.
- **Fix:** searchable multi-select, selected shown as chips, default to available attendees, collapse/hide playing ones. Same search pattern already exists in the join-game dropdowns — reuse it.
- **Suggested command:** `$impeccable distill`

### [P2] Modals have no focus trap and no focus restore
- **What:** all 9 dialogs are `<div role tabindex="-1">` with `use:autofocus` on at most one control. Tab escapes to the page behind; on close focus drops to `<body>`. The manage-sheet → confirm and manage-sheet → remove chains stack 2–3 backdrops with focus leaking to the lowest layer. Escape only fires if the backdrop happens to hold focus.
- **Why it matters:** keyboard and screen-reader users lose their place on every dialog; the stacked-modal chains are a keyboard trap in reverse (focus is *outside* the dialog).
- **Fix:** trap Tab within `.modal-content`, `inert`/`aria-hidden` the background, focus the dialog (or its first control) on open, restore focus to the invoking control on close, and move Escape to a `svelte:window` handler. Factor the 9 near-identical modal shells into one component.
- **Suggested command:** `$impeccable harden`

### [P2] Flat visual hierarchy — live content has no primacy
- **What:** every `<section>` is the same `#f9f9f9` card, `margin-bottom: 3rem`, same `<h2>` weight. "진행 중인 게임" carries the same visual importance as "공지사항 관리" and "반복 게임 관리", on one long equal-weight scroll. `#f9f9f9` cards on the `#f5f5f5` page barely separate.
- **Why it matters:** the reorder fixed sequence but not weight; a glance still can't find the live room faster than the notice editor.
- **Fix:** give the summary + 진행 중 + 참여 인원 blocks primacy (elevation, tighter internal rhythm, maybe a 2-col split with live on the left); demote 공지 and 반복 게임 to a collapsed panel or a secondary column.
- **Suggested command:** `$impeccable layout`

Still residual (explicitly deferred last pass, restated so it isn't lost): **css-theme token migration + `force-light` removal + dark palette + theme toggle**, shell-wide across all 7 admin routes with visual QA → best as its own dark-mode task (`$impeccable colorize` / `$impeccable audit` once a browser is available).

## Persona Red Flags

**Alex (fast repeat operator):**
- `submitLock`'s 2.5 s dead button after every `?/applyPenaltyAdmin`, `?/addAttendee`, `?/extendGame`.
- Blacklist went from one inline click to 관리 → 등록 → confirm → 확인 (4 taps) — and then 404s silently.
- SSE `invalidateAll` still re-runs `ORDER BY is_playing, arrival_time DESC`; the `.btn-manage` he's reaching for jumps rows mid-tap.
- New-game modal still a 50-checkbox scan to start a 4-player game.

**Sam (keyboard / SR / contrast):**
- No focus trap or focus-restore on any of the 9 modals; stacked sheet→confirm leaves focus on `<body>`.
- `.rs-dot.live` green is the only "room is active" cue and it's `aria-hidden`; `.room-summary` isn't `aria-live`, so the 30 s countdown is silent to a screen reader.
- `.time-remaining` `#ef6c00` on white ≈ 3.4:1 — fails AA for 12–14 px bold text that carries the key number.
- `.manage-sub` / `.detail-sub` / `.list-meta` `#666` on `#f9f9f9` at 0.78–0.8 rem is borderline.

**Club operator, one-handed, Friday night:**
- Single long scroll of 7 × `margin-bottom: 3rem` cards.
- `.game-detail-modal { max-height: 90vh; overflow-y: auto }` puts "닫기" below the fold on a phone.
- `force-light` in `+layout.svelte` forces a white-glare screen in a dim café.
- No pending state → a double-tapped "게임 시작" on weak wifi lands twice (submitLock has re-enabled by then if the server is slow).

## Minor Observations

- Two `showAlert` implementations — `+page.svelte` has `kind`, `+layout.svelte` (마감/오픈) does not.
- `Reservation` / `Table` / `SavedMember`-adjacent `reservations` / `tables` reactive decls remain though the reservation UI is gone — dead code.
- `confirmSubmit` re-enters via a `formElement.dataset.confirmed` string flag + `requestSubmit()`; a fast double-confirm can still double-submit.
- `<img src={g.image_url}>` in game lists has no `width`/`height` and no `onerror` → layout shift as thumbs load.
- `.ending-soon` flips a whole row's tint on the 30 s tick; the boundary can show stale for up to 30 s.
- `formatTime` renders "오후 09:30"; pass `hourCycle: 'h23'` for a 24h room.
- Three different dashed-divider treatments (`.show-more-btn`, `.quick-add`, `.guest-input-group`).
- `autofocus` action calls `node.focus()` unguarded — safe on the two buttons it's on now; would pop the mobile keyboard if ever put on an input.

## Questions to Consider

1. If the `.room-summary` strip is the one thing to read from across the room, why is it `0.95rem` in a white box that sits *lighter* than the cards below it?
2. Penalty ±1 is inline in the row *and* inside the manage sheet. Which is the source of truth, and why does the operator need both?
3. `submitLock` is a 2.5 s guess standing in for a loading state. What's the p95 action latency on café wifi, and what happens to a double-tapped "게임 시작" at second 3?
4. Blacklisting is the highest-stakes action here and it fails silently on a case typo. What test would have caught that?
5. All 7 sections load full-height at equal weight. If you had to collapse three by default for the one-handed case, which three — and why are they still expanded?
6. `force-light` hard-wraps admin in a white screen. Who reads this at 11pm in a dim café, and has anyone tried it there?
