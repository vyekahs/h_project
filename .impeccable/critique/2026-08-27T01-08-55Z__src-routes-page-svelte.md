---
target: 나의 예약 현황 section (src/routes/+page.svelte)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-27T01-08-55Z
slug: src-routes-page-svelte
---
# Impeccable Critique — `나의 예약 현황` (My Reservation Status section)

**Method: dual-agent** — Assessment A (design review) and Assessment B (detector + browser evidence) ran as two independent, isolated sub-agents in parallel, with no visibility into each other's findings until this synthesis.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | `{#if scheduledGames.length}...{:else if userPlayingGame}` means a currently-playing state can be silently suppressed whenever the user also has a scheduled game |
| 2 | Match System / Real World | 3 | Copy and relative-time formatting read naturally; status pill meanings (pending/waitlisted/confirmed) aren't explained anywhere |
| 3 | User Control and Freedom | 3 | Cancel exists on every actionable card with escalating confirmation copy; no way to recover/re-book from the card after a mistaken cancel |
| 4 | Consistency and Standards | 3 | Icon+label+value+pill pattern is reused consistently, but breaks down when one booking becomes two disconnected cards |
| 5 | Error Prevention | 3 | Genuinely strong: cancel-confirm text escalates dynamically within 10 minutes of start |
| 6 | Recognition Rather Than Recall | 2 | The reservation card renders only game_name + status — scheduled_at is fetched server-side but never shown |
| 7 | Flexibility and Efficiency | 2 | No link to a fuller reservation history; nothing scales past 2-3 stacked cards |
| 8 | Aesthetic and Minimalist Design | 2 | Generic pastel card-grid grammar; duplicate game titles across two cards for the same session |
| 9 | Error Recovery | 3 | Uses the app's own branded confirm modal, not window.confirm() |
| 10 | Help and Documentation | 1 | No explanation of status-pill meaning or the no-show/penalty policy |
| **Total** | | **24/40** | **Acceptable** |

## Design Specificity Verdict

Reads as a generic SaaS "my status" widget swappable into any booking product — no game art, no room context, no personality. Given this is explicitly the "this affects you, right now" moment after the community-wide sections, the flat treatment is a missed opportunity.

Deterministic scan: 2 CLI findings (`layout-transition`, lines 2309/2787) both outside this section. Browser overlay traced a `low-contrast` finding (`#2b8a3e` on `#e8f5e9`, 3.9:1) to `.status-tag.confirmed` inside this section — corroborating a second, separately-found contrast failure on `.btn-cancel-small` (~2.1:1 dark mode). Other overlay findings belong to other sections or are page-wide.

## Priority Issues

**[P1] Same booking renders as two disconnected cards** — a session that is both an accepted reservation and a scheduled participation shows as two cards with the same game title and two independent cancel buttons, with no explanation of the relationship. Fix: merge into one card per session. Command: `$impeccable distill`

**[P1] Reservation card never shows the time** — `scheduled_at` is fetched server-side (+page.server.ts:68) but never rendered (+page.svelte:1089-1113). Fix: render it using the existing highlight-orange/sub-value pattern. Command: `$impeccable clarify`

**[P1] The section undersells the one moment it should feel most personal** — a card starting in 1 hour and one starting in 9 hours render at identical visual weight. Fix: give the most urgent card real visual priority. Command: `$impeccable bolder`

**[P2] Insufficient contrast in two places** — `.status-tag.confirmed` at 3.9:1 (detector-confirmed) and `.btn-cancel-small` at ~2.1:1 in dark mode with zero padding. Command: `$impeccable harden`

**[P2] Dead penalty-warning path** — `userPenaltyInfo` is hardcoded null in +page.server.ts:56, never reassigned; `.penalty-warning` card can never render. Command: `$impeccable harden`

## Persona Red Flags

**Casey (Distracted Mobile)**: `.btn-cancel-small` has zero padding, barely tappable on 390px — the cancel-before-penalty button, worst place for a mis-tap.

**Sam (Accessibility)**: ~2.1:1 dark-mode contrast fails WCAG AA for a functional control.

## Minor Observations

- `.status-card.reservation`/`.penalty-warning` set border-color identical to their own background (invisible border)
- `--color-purple-bg` reused elsewhere for an unrelated tag — not an established semantic color
- This page's other h2s are plain text too, so no-emoji heading is consistent with page convention
- Desktop: dead whitespace below this section while the right column continues
- Each card repeats a full inline svg icon instead of a shared snippet

## Questions to Consider

- If a member had an active penalty, a game in 20 minutes, and a waitlisted reservation simultaneously, would this section tell them what matters most — or hand that decision back to equal-weight pastel boxes?
- What happens today if a user cancels the "참여 예정 게임" card but not the matching "예약 내역" card for the same session?
