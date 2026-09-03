---
target: 보드게임 페이지 (src/routes/collection/+page.svelte)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-03T16-10-53Z
slug: src-routes-collection-page-svelte
---
#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Filtering/toggling reacts instantly, but saving an edited result or toggling ownership gives no explicit "저장했어요" confirmation — the row just silently changes |
| 2 | Match Between System and Real World | 4 | "장식장," "수집," lock/trophy metaphor, day-based "자주 만난 친구" counting — genuinely on-domain for this club |
| 3 | User Control and Freedom | 4 | Close button, Escape, backdrop click, explicit 취소 on every edit form — no dead ends found |
| 4 | Consistency and Standards | 3 | Shared `playRow` snippet keeps both views consistent; undercut by the "승리" badge using a fresh, uncalibrated color pair instead of the theme's own solved amber-on-tint token pairing |
| 5 | Error Prevention | 2 | Score inputs have no min/bounds (client or server); winnerIds checkbox group allows 0 or "all" winners silently; no confirm step before overwriting a recorded winner |
| 6 | Recognition Rather Than Recall | 2 | Opponent search is free-text with no autocomplete, despite the app already holding structured attendee data from the same sessions it queries |
| 7 | Flexibility and Efficiency of Use | 3 | Card→modal instead of route nav is a deliberate efficiency win; no sort control beyond fixed play-count ordering |
| 8 | Aesthetic and Minimalist Design | 3 | Clean for 4 games; the filter stack (5-6 controls) is visually heavier than the ~5-record history it filters |
| 9 | Help Users Recognize/Diagnose/Recover from Errors | 2 | `editHistory` surfaces `historyEditError` inline; `toggleOwnership`'s `use:enhance` calls `update()` unconditionally, so a server failure is swallowed with zero feedback |
| 10 | Help and Documentation | 1 | The only "help" (owned-badge / first-play-date tooltips) is hover-only — dead on this file's own stated primary target (mobile touch). No legend for lock/owned icons anywhere |
| **Total** | | **27/40** | **Acceptable — solid foundation, real gaps in error handling and touch-affordance** |

#### Design Specificity Verdict

**LLM assessment**: Not a reskinned generic "my collection" screen. The trophy-shelf framing (grayscale + lock badge for unplayed games, gold "×N" play-count stickers, literal "N/M종 수집" progress bar) is gamified-collection language used on purpose, and the summary cards foreground *social* stats ahead of raw totals — "자주 만난 친구" counts distinct **days** played together rather than raw session count, a specific anti-gaming choice visible in the code, not a default. The "내 소장 게임" vs. club-owned distinction (a separate `game_ownership` table, independent of the catalog) is a real domain decision. Where it slips into generic territory: the desktop layout is a mobile modal dropped onto a wide gray field with no additional treatment, and the year/month/day filter cascade is exactly the "any admin panel" utility pattern that doesn't reflect this club's actual (small) data volume.

**Deterministic scan**: `detect.mjs --json` against `src/routes/collection/+page.svelte` exited 2 with 2 findings: `side-tab` (line 1011, `.modal-play-row.win { border-left: 3px solid var(--color-amber) }`) and `layout-transition` (line 625, `.progress-fill { transition: width }`). The live browser overlay (injected across 4 views: default grid, 전체 기록, played-game modal, unplayed-game modal) additionally surfaced `undersized-ui-text` (the "×5"/"×2" play-count badges render at 10.4px, under the 11px floor), `gpt-thin-border-wide-shadow` (1px border + 32px shadow — a generic-AI-slop pattern) on every view, and `overused-font` (a single font family covering 89-94% of text on every view). These last two corroborate the LLM's "desktop feels generic" read at the CSS level: the underlying *concept* is well-tailored, but some surface-level styling choices are the exact patterns this detector exists to catch.

**Visual overlays**: Injection succeeded on all 4 views (script-tag injection into the live page, confirmed via console evidence, not just a static guess). Because the assessment's live-server was stopped afterward per protocol, there's no persistent overlay tab left open for you to click through — but 4 screenshots were captured during the run and the full per-view findings are folded into Priority Issues and Minor Observations below. No results were discarded.

#### Overall Impression

The concept is the strongest part of this page — a personal trophy shelf with a genuine, considered domain model (day-based friend counting, independent ownership tracking, shared play-row logic across two views) that a generic template wouldn't produce. The execution has one real defect that both assessments independently converged on (the win badge fails contrast in both themes, worse in dark), and one real proportionality problem: a filter UI sized for a catalog, applied to a personal history that — for most members, most of the time — will hold a handful of records. Fix those two and this jumps from Acceptable to Good.

#### What's Working

- **Card→modal instead of navigation**: the code itself reasons about this explicitly ("페이지 이동 대신 모달로... 훑어보는 흐름이 끊긴다") — a deliberate UX call, not a framework default, and it holds up under a real click-through.
- **Shared `playRow` snippet**: used identically in the per-game modal and the flat "전체 기록" list. One source of truth for edit-window logic, win/score formatting, and layout — a fix in one place propagates everywhere, which is exactly the leverage a small feature like this needs.
- **`trapFocus` action**: a genuinely well-built focus trap (handles focus escaping after an in-place form submit, tracks a stack for nested modals, restores focus on close). Verified with an actual keyboard tab-walk through the page — no traps, no skips.

#### Priority Issues

**[P1] "승리" badge fails WCAG AA contrast in both themes**
- **Why it matters**: Both assessments measured this independently and landed on the same numbers — light mode `#333333` on `#d97706` = 3.97-4.0:1, dark mode `#e5e7eb` on `#f59e0b` = 1.73:1 (need 4.5:1 at this text size/weight either way). "승리" is the emotional payoff word on this exact screen, and dark mode is close to illegible.
- **Fix**: Route the badge through the theme's own `--color-warning-bg` / `--color-achievement-text` pairing — already solved and in use two components away on `.btn-ownership-toggle.active`. Don't hand-pick a new pair.
- **Suggested command**: `$impeccable audit`

**[P1] Filter UI is disproportionate to the data it filters**
- **Why it matters**: The per-game modal shows 5 simultaneous controls (year/month/day/opponent/win-only); "전체 기록" shows 6 (adds game-name search). In the seeded test data, the *most-played* game had 5 sessions total — that's a lot of chrome to page past before reaching a single record, and it's the top cognitive-load finding from the review (3 of 8 checklist items failed, landing "moderate").
- **Fix**: Collapse the three date selects into one control, and/or hide the filter row behind a disclosure toggle until record count crosses a real threshold (e.g. 10+).
- **Suggested command**: `$impeccable distill`

**[P2] Accessibility labeling gaps, inconsistent with the file's own pattern elsewhere**
- **Why it matters**: The `view-toggle` buttons (게임별/전체 기록) carry no `aria-pressed`/`aria-current`, so selection state is visual-only. All four free-text search inputs have no `aria-label`/`<label>`, while the sibling `<select>` filters right next to them consistently do (`aria-label="연도 필터"` etc.) — this file already knows how to label controls, it just didn't do it for the text inputs.
- **Fix**: Add `aria-pressed={viewMode === 'byGame'}` (and the 'all' counterpart) to the toggle buttons; add matching `aria-label`s to the four search inputs.
- **Suggested command**: `$impeccable audit`

**[P2] No positive confirmation, and one silent failure path, at save-time actions**
- **Why it matters**: Saving an edited past result or toggling ownership updates the row with no acknowledgment — correcting a recorded winner is a higher-stakes action than a filter toggle and deserves more than silence. Separately, `toggleOwnership`'s `use:enhance` callback calls `update()` unconditionally regardless of `result.type`, so a server-side failure is swallowed with zero user-facing error — inconsistent with `editHistory`, which does surface `historyEditError` on failure.
- **Fix**: Add a brief inline "저장했어요" flash on successful save; branch `toggleOwnership`'s enhance callback on `result.type` the same way `editHistory`'s already does.
- **Suggested command**: `$impeccable harden`

**[P2] Play-count badge text is under the legibility floor**
- **Why it matters**: The detector's browser overlay measured the "×5"/"×2" play-count badges at 10.4px across every view checked — under the 11px floor for functional UI text, and this is a number members actually need to read at a glance on a grid of small icons.
- **Fix**: Bump `.play-badge`'s `font-size` to at least 11px (0.7rem or slightly above); re-check it doesn't overflow the badge's `border-radius: 100px` pill at 3-digit play counts.
- **Suggested command**: `$impeccable typeset`

#### Persona Red Flags

**Sam (Accessibility-Dependent User)**
- Cannot reliably distinguish a win from a loss by badge text alone in dark mode (1.73:1 contrast) and has to fall back to the equally color-only amber left-border — no non-color signal exists.
- Tabbing the view toggle gets no announcement of which view is currently active (no `aria-pressed`).
- Tabbing into any of the four search boxes lands on an unnamed textbox (placeholder-only labeling), right next to date selects that ARE properly named.
- Tabbing through the inline edit form's score inputs gets unnamed spinbuttons — only the adjacent checkbox label announces whose score it is.

**Casey (Distracted Mobile User)**
- The two `title="..."` tooltips (owned-badge meaning, first-play date) are simply inert on a touchscreen — no tap-to-reveal fallback exists, so the meaning of the small amber house icon is undiscoverable one-handed.
- "내가 보유한 것만 보기" lives in the header, but the grid it filters sits two full sections (both summary cards) below it — confirming the filter actually did something requires an extra scroll-and-look instead of an adjacent glance.
- On "전체 기록" at 390px, she scrolls past 6 filter controls before reaching a single actual record — a lot of one-handed scrolling for what should be a quick "what did we play" glance.

**Riley (Deliberate Stress Tester)**
- Score `<input type="number">` has no `min`, and the server-side `parseInt` in `gameHistoryService.ts` has no bounds check — negative or absurd scores save cleanly and permanently within the 7-day window.
- The winnerIds checkbox group has no min/max constraint — Riley can check zero winners or every participant as a winner with no client or server pushback, silently corrupting the same stats this page's own summary cards read from.
- Forcing a server failure on the ownership toggle produces zero visible feedback — the button just does nothing, no error state at all.

#### Minor Observations

- "N/M종 수집" tracks only *played* status, even though "owned" is this cycle's new, fairly prominent feature — two collection concepts exist, only one gets the marquee number.
- The day-of-month filter always offers 31 options regardless of the selected month; picking "31일" for April just returns the generic empty-state instead of disabling the impossible combination.
- The two summary cards ("자주 만난 친구" / "가장 많이 플레이한 게임") stay unfiltered by both the game-name search and "보유한 것만 보기" — defensible in isolation, but not obviously scoped that way to a first-time user.
- Opponent names render exactly as typed with no formatting/sanity check — a careless prior data-entry mistake would show up verbatim in a member's history forever.
- Empty-state copy is warm and consistent across all three empty-state sites ("아직 플레이 기록이 없어요" / "...게임이 없어요") — good tonal discipline, worth preserving in any rework.
- The detector's `text-occlusion` finding on a "✦ hairline border with w..." fragment in the "전체 기록" view is almost certainly the overlay detecting its own injected annotation legend, not a real page defect — noted as a likely false positive, not counted above.

#### Questions to Consider

- What if there were a single always-visible legend row ("🔒 안 해봄 · 🏠 내 소장") at the top of the grid instead of two badges whose only explanation is a hover tooltip that doesn't fire on mobile — would that close most of the discoverability gap for less effort than redesigning the icons?
- What if the year/month/day filter cascade were replaced with something proportionate to a small club's actual volume — a single "최근 N개월" chip row, say — is the current filter UI solving a scale problem this club doesn't have yet, at the cost of cognitive load it definitely has today?
- What if editing a past game's **winner** (not score) required one extra confirmation tap — would that small bit of friction better match the social stakes of rewriting who "beat" whom in a shared club history, without slowing down the far more common score-only correction?
