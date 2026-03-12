---
name: Svelte 5
description: Svelte 5 runes syntax reference and enforcement. Use this when writing ANY Svelte code — components, stores, templates, or reactive state. Enforces $state, $derived, $effect, $props patterns and PREVENTS deprecated Svelte 4 syntax (export let, $:, createEventDispatcher, slot). Always write Svelte 5 runes syntax.
metadata: {"clawdbot":{"emoji":"🔥","requires":{"bins":["node"]},"os":["linux","darwin","win32"]}}
---

## Runes — Reactive State

### $state — Mutable Reactive Variable
```typescript
let count = $state(0);
let name = $state<string | null>(null);
let items = $state<Set<string>>(new Set());
let arr = $state<number[]>([]);
```
- Replaces plain `let` for reactive values
- Works in `.svelte` and `.svelte.ts` files

### $derived — Simple Computed Value
```typescript
const doubled = $derived(count * 2);
const isReady = $derived(name !== null && count > 0);
const isPlaying = $derived(phase === 'playing');
```
- Single expression only — no statements, no blocks
- Replaces `$: variable = expression`

### $derived.by — Complex Computed Value
```typescript
const sorted = $derived.by(() => {
    const arr = [...items];
    return arr.sort();
});

const selectedIsBomb = $derived.by(() => {
    if (selectedCards.size < 4) return false;
    const combo = detectCombination(selectedCardObjs);
    return combo !== null && isBomb(combo);
});
```
- Use when you need multiple statements or intermediate variables
- Must return a value

### $effect — Side Effects
```typescript
$effect(() => {
    // Auto-tracks dependencies, re-runs when they change
    console.log(`count is now ${count}`);
});

// With cleanup
$effect(() => {
    const timer = setInterval(() => tick(), 1000);
    return () => clearInterval(timer); // cleanup function
});
```
- Replaces `$:` blocks that had side effects
- Runs after DOM update
- Return a function for cleanup

### untrack — Break Dependency Tracking
```typescript
import { untrack } from 'svelte';

$effect(() => {
    const evt = lastEvent; // tracked dependency
    if (!evt) return;
    untrack(() => {
        // mutations here don't create dependencies
        if (evt.type === 'pass') {
            passedSeats = new Set(passedSeats).add(evt.seat);
        }
    });
});
```
- Prevents infinite loops when writing to state inside effects
- The code inside `untrack()` runs but is not tracked

## Props

### $props — Component Props
```typescript
// Basic with inline type
let { game } = $props<{ game: GameState }>();

// With defaults
let { selected = false, small = false, onclick } = $props<{
    selected?: boolean;
    small?: boolean;
    onclick?: () => void;
}>();

// With interface
interface Props {
    stats: Array<{ label: string; value: string }>;
    onResume: () => void;
    onQuit: () => void;
}
let { stats, onResume, onQuit } = $props<Props>();

// Rest props (replaces $$restProps)
let { specific, ...rest } = $props<{ specific: string; [key: string]: any }>();

// Children (replaces <slot />)
let { children } = $props<{ children: any }>();
```
- Replaces `export let`
- Destructured props ARE reactive in Svelte 5
- Callback props replace `createEventDispatcher`

### $bindable — Two-way Binding Props
```typescript
let { open = $bindable(false) } = $props<{ open: boolean }>();
let { isNoteMode = $bindable(false) } = $props<{ isNoteMode: boolean }>();
```
- For props that parent can `bind:` to
- Provide default value inside `$bindable()`

## Template Syntax Changes

### {@render} — Replaces <slot />
```svelte
<!-- Layout component -->
<script lang="ts">
    let { children } = $props<{ children: any }>();
</script>
<main>{@render children()}</main>

<!-- Named slots via snippet props -->
<script lang="ts">
    let { header, children } = $props();
</script>
<header>{@render header?.()}</header>
<main>{@render children()}</main>
```

### {#snippet} — Reusable Template Blocks
```svelte
{#snippet homeContent()}
    <div class="home">Home content</div>
{/snippet}

{#snippet cardItem(card)}
    <div class="card">{card.name}</div>
{/snippet}

{@render homeContent()}
{#each cards as card}
    {@render cardItem(card)}
{/each}
```

### {@const} — Template-Level Constants
```svelte
{#each tubes as tube (tube.id)}
    {@const isSelected = selectedTubeId === tube.id}
    {@const complete = isTubeComplete(tube)}
    <div class:selected={isSelected} class:complete>...</div>
{/each}
```
- Only valid inside `{#each}`, `{#if}`, `{#snippet}` blocks

### Event Handlers — No Colon Syntax
```svelte
<!-- New syntax (use this) -->
<button onclick={handleClick}>Click</button>
<button onclick={() => count++}>+1</button>
<div onkeydown={(e) => e.key === 'Escape' && close()}>...</div>

<!-- Modifier replacement -->
<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
```
- `onclick` not `on:click`
- `onkeydown` not `on:keydown`
- No `|preventDefault` modifier — use `e.preventDefault()` inline

## Module-Level State (.svelte.ts)

Runes work in `.svelte.ts` files for shared reactive state. Replaces `writable`/`readable`/`derived` from `svelte/store`.

### IIFE Singleton Pattern
```typescript
// rankUpStore.svelte.ts
export const rankUpStore = (() => {
    let isVisible = $state(false);
    let currentRank = $state<number | null>(null);
    return {
        get isVisible() { return isVisible; },
        get currentRank() { return currentRank; },
        show(rank: number) { currentRank = rank; isVisible = true; },
        close() { isVisible = false; currentRank = null; }
    };
})();
```

### Factory Function Pattern
```typescript
// gameState.svelte.ts
export function createGameState() {
    let score = $state(0);
    let phase = $state<'setup' | 'playing'>('setup');
    const isPlaying = $derived(phase === 'playing');
    return {
        get score() { return score; },
        set score(v: number) { score = v; },
        get phase() { return phase; },
        get isPlaying() { return isPlaying; },
        start() { phase = 'playing'; }
    };
}
```

### CRITICAL: Getter/Setter Pattern
- **MUST** use `get`/`set` accessors to export reactive state
- Returning `{ score }` directly breaks reactivity — the value is captured at creation time
- `get score() { return score; }` reads the reactive variable on every access

### Import Convention
```typescript
// Include .svelte in path (NOT .svelte.ts)
import { themeStore } from '$lib/stores/theme.svelte';
import { rankUpStore } from '$lib/stores/rankUpStore.svelte';
```

## CRITICAL: Mutable Object Reactivity

When an external engine mutates a state object in-place (same reference), `$derived` does NOT detect changes because the reference hasn't changed.

### The Problem
```typescript
// THIS DOES NOT WORK — gameState is same reference
const phase = $derived(gameState?.phase); // Never updates!
```

### The stateVersion Pattern
```typescript
// In .svelte.ts module
let stateVersion = $state(0);

function onStateChange() {
    stateVersion++; // Increment on every engine mutation
}

function getState() {
    void stateVersion; // Creates reactive dependency
    return engine?.state ?? null;
}

// Now these update correctly
const phase = $derived.by(() => getState()?.phase ?? null);
const isMyTurn = $derived.by(() => {
    const s = getState();
    return s?.phase === 'playing' && s?.round?.currentSeat === 0;
});
```

### In Components
```svelte
<script lang="ts">
    let { game } = $props<{ game: any }>();

    // Helper that reads stateVersion
    function gs() {
        void game.stateVersion;
        return game.gameState;
    }

    const myPlayer = $derived.by(() => gs()?.players[0]);
    const trick = $derived.by(() => gs()?.round?.trick ?? null);
</script>
```

### Rules
1. ALL `$derived` reading mutable engine state MUST access `stateVersion`
2. Use `getState()` helper or `void stateVersion` directly
3. Constants (team IDs, seat numbers) don't need this — use plain values

## Lifecycle & Utilities

```typescript
import { onMount, onDestroy, tick } from 'svelte';
import { browser } from '$app/environment';

// Client-only code
onMount(() => {
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer); // cleanup
});

// Explicit cleanup
onDestroy(() => { /* cleanup */ });

// Wait for DOM update
await tick();

// SSR guard
if (browser) {
    localStorage.setItem('key', value);
}
```
- `onMount` only runs client-side — safe for browser APIs
- `beforeUpdate`/`afterUpdate` are deprecated — use `$effect` instead

## SvelteKit Conventions

```typescript
// Page data
import { page } from '$app/stores';
$page.url.pathname, $page.params.id

// Navigation
import { goto, afterNavigate } from '$app/navigation';

// Environment
import { browser, version } from '$app/environment';

// Layout with children
let { children } = $props();
{@render children()}
```
- `+page.svelte` / `+page.server.ts` / `+page.ts`
- `+layout.svelte` uses `$props()` for `children`, not `<slot />`

## Template Syntax (Unchanged)

These work the same as before:
- `{#if}...{:else if}...{:else}...{/if}`
- `{#each items as item (item.key)}...{/each}` — always use keys
- `{#key value}...{/key}` — destroys/recreates on change
- `{#await promise}...{:then}...{:catch}...{/await}`
- `class:name={condition}` — conditional classes
- `style:property={value}` — dynamic inline styles
- `bind:value`, `bind:checked`, `bind:this`
- Transitions: `transition:fade`, `in:fly`, `out:slide`
- `<svelte:head>`, `<svelte:window>`, `<svelte:body>`

## AVOID: Svelte 4 Patterns

| Svelte 4 (DO NOT USE) | Svelte 5 (USE THIS) |
|---|---|
| `export let prop` | `let { prop } = $props()` |
| `export let prop = val` | `let { prop = val } = $props()` |
| `$: x = expr` | `const x = $derived(expr)` |
| `$: { sideEffect() }` | `$effect(() => { sideEffect() })` |
| `createEventDispatcher()` | Callback props: `let { onclick } = $props()` |
| `dispatch('event', data)` | `onclick(data)` |
| `<slot />` | `{@render children()}` |
| `<slot name="x" />` | Snippet props |
| `$$props` | `$props()` full object |
| `$$restProps` | `let { a, ...rest } = $props()` |
| `on:click={fn}` | `onclick={fn}` |
| `on:click\|preventDefault` | `onclick={(e) => { e.preventDefault(); fn() }}` |
| `writable()` from svelte/store | `$state()` in `.svelte.ts` |
| `readable()` from svelte/store | `$state()` + getter in `.svelte.ts` |
| `derived()` from svelte/store | `$derived()` in `.svelte.ts` |
| `$store` auto-subscribe | Direct property access via getters |
| `beforeUpdate`/`afterUpdate` | `$effect()` |
| `let:prop` on slots | Snippet parameters |

## Common Mistakes

1. **`onDestroy`에서 `document`/`window` 접근 → SSR 에러**: `onDestroy`는 서버에서도 실행된다. 브라우저 API를 사용하면 `document is not defined` 에러가 발생한다.
   ```typescript
   // WRONG — SSR에서 크래시
   onDestroy(() => {
       document.removeEventListener('click', handler);
   });
   // RIGHT — 브라우저 환경 체크
   onDestroy(() => {
       if (typeof document !== 'undefined') {
           document.removeEventListener('click', handler);
       }
   });
   // BETTER — onMount 리턴으로 cleanup (서버에서 실행 안됨)
   onMount(() => {
       document.addEventListener('click', handler);
       return () => document.removeEventListener('click', handler);
   });
   ```
   - `onMount`는 클라이언트 전용 → 안전. `onDestroy`는 서버+클라이언트 둘 다 실행.
   - `onMount`의 리턴 함수가 cleanup 역할을 하므로, 가능하면 `onMount` 리턴을 우선 사용.

2. **Mutable object $derived trap**: `$derived(obj?.prop)` won't update if `obj` is same reference. Use `stateVersion` pattern.

2. **Set/Map mutations need reassignment**:
   ```typescript
   // WRONG — does not trigger
   selected.add(id);
   // RIGHT
   selected = new Set(selected).add(id);
   // or
   selected = new Set([...selected, id]);
   ```

3. **Array push needs reassignment**:
   ```typescript
   // WRONG
   arr.push(item);
   // RIGHT
   arr = [...arr, item];
   ```

4. **$effect infinite loop** — writing to a value the effect reads:
   ```typescript
   // WRONG — infinite loop
   $effect(() => { count = count + 1; });
   // RIGHT — use untrack for the write
   $effect(() => {
       const val = someOtherValue;
       untrack(() => { count = val; });
   });
   ```

5. **Missing .svelte in imports**:
   ```typescript
   // WRONG
   import { store } from './store';
   import { store } from './store.svelte.ts';
   // RIGHT
   import { store } from './store.svelte';
   ```

6. **$derived vs $derived.by**: Use `$derived(expr)` for single expressions. Use `$derived.by(() => { })` for multi-line logic with intermediate variables.

7. **Forgetting stateVersion in components**: Always `void game.stateVersion` before reading `game.gameState` properties.

## Quick Reference

```
$state(value)              Reactive mutable state
$state<Type>(value)        Typed reactive state
$derived(expr)             Simple computed value
$derived.by(() => {})      Complex computed (block body)
$effect(() => {})          Side effect (auto-tracks deps)
$props<Type>()             Component props
$bindable(default)         Two-way bindable prop
untrack(() => {})          Escape dependency tracking
{@render children()}       Render slot/children content
{#snippet name()}...       Define template block
{@render name()}           Render template block
{@const x = expr}          Template-level constant
onclick={fn}               Event handler (no colon)
.svelte.ts                 Module file with rune support
get prop() { return x; }   Export reactive state from module
```
