---
name: CSS Theme
description: Dark/light mode CSS variable reference for this project. Use this when writing ANY CSS or styles — always use theme variables (var(--xxx)) instead of hardcoded colors. Prevents broken dark mode by enforcing the existing theme token system. Activate when writing CSS, styling components, or adding colors.
metadata: {"clawdbot":{"emoji":"🎨","requires":{"bins":["node"]},"os":["linux","darwin","win32"]}}
---

## Theme System

- Theme applied via `data-theme` attribute on `<html>` element
- `:root` = light mode defaults, `[data-theme='dark']` = dark overrides
- Theme store: `import { themeStore } from '$lib/stores/theme.svelte'`
- Variables defined in `src/routes/+layout.svelte` global styles

## RULE: No Hardcoded Colors

```css
/* WRONG — breaks dark mode */
background: #ffffff;
color: #333;
border: 1px solid #ddd;
box-shadow: 0 2px 8px rgba(0,0,0,0.1);

/* RIGHT — uses theme variables */
background: var(--bg-primary);
color: var(--text-primary);
border: 1px solid var(--border-default);
box-shadow: 0 2px 8px var(--shadow-md);
```

Never use: `white`, `black`, `#fff`, `#000`, `#333`, `#666`, `#ddd`, `#eee`, `#f5f5f5`, `rgba(0,0,0,...)` directly. Use the matching theme variable instead.

## Text Colors

| Variable | Light | Dark | Use For |
|----------|-------|------|---------|
| `--text-primary` | #333 | #e5e7eb | Main body text |
| `--text-secondary` | #666 | #9ca3af | Subtitles, labels |
| `--text-tertiary` | #888 | #6b7280 | Captions, metadata |
| `--text-muted` | #999 | #6b7280 | Disabled text |
| `--text-hint` | #adb5bd | #4b5563 | Placeholders |
| `--text-dark` | #495057 | #d1d5db | Emphasized text |
| `--text-darker` | #555 | #d1d5db | Secondary emphasis |

## Background Colors

| Variable | Light | Dark | Use For |
|----------|-------|------|---------|
| `--bg-primary` | #ffffff | #1a1b1e | Cards, modals, panels |
| `--bg-secondary` | #f8f9fa | #25262b | Page background |
| `--bg-tertiary` | #f1f3f5 | #2c2e33 | Nested sections |
| `--bg-elevated` | #f0f0f0 | #2c2e33 | Raised surfaces |
| `--bg-hover` | #e9ecef | #343539 | Hover state |
| `--bg-active` | #dee2e6 | #3e4044 | Active/pressed state |
| `--bg-surface` | #f5f5f5 | #25262b | Subtle surface |
| `--bg-dark` | #333 | #e5e7eb | Inverted background |

## Border Colors

| Variable | Light | Dark | Use For |
|----------|-------|------|---------|
| `--border-default` | #ddd | #3e4044 | Standard borders |
| `--border-light` | #eee | #2c2e33 | Subtle dividers |
| `--border-medium` | #ccc | #4b5563 | Emphasized borders |

## Shadow Colors

| Variable | Light | Dark | Use For |
|----------|-------|------|---------|
| `--shadow-sm` | rgba(0,0,0,0.03) | rgba(0,0,0,0.2) | Subtle elevation |
| `--shadow-md` | rgba(0,0,0,0.1) | rgba(0,0,0,0.3) | Cards, panels |
| `--shadow-lg` | rgba(0,0,0,0.15) | rgba(0,0,0,0.4) | Modals, popups |
| `--shadow-heavy` | rgba(0,0,0,0.3) | rgba(0,0,0,0.5) | Floating elements |
| `--shadow-deep` | rgba(0,0,0,0.6) | rgba(0,0,0,0.7) | Deep shadows |

Usage: `box-shadow: 0 2px 8px var(--shadow-md);`

## Overlay Colors

| Variable | Light | Dark | Use For |
|----------|-------|------|---------|
| `--overlay-light` | rgba(0,0,0,0.05) | rgba(255,255,255,0.05) | Subtle tints |
| `--overlay-medium` | rgba(0,0,0,0.2) | rgba(0,0,0,0.4) | Semi-transparent |
| `--overlay-heavy` | rgba(0,0,0,0.5) | rgba(0,0,0,0.6) | Modal backdrops |

## Brand Colors

| Variable | Light | Dark |
|----------|-------|------|
| `--color-blue` | #339af0 | #4dabf7 |
| `--color-blue-bright` | #007bff | #4dabf7 |
| `--color-amber` | #fbbf24 | #fbbf24 |
| `--color-amber-dark` | #f59e0b | #f59e0b |
| `--color-amber-darker` | #d97706 | #f59e0b |
| `--color-green` | #22c55e | #34d399 |
| `--color-green-dark` | #2b8a3e | #34d399 |
| `--color-red` | #ef4444 | #f87171 |
| `--color-red-dark` | #d32f2f | #f87171 |
| `--color-orange` | #ff9800 | #ffb74d |
| `--color-orange-dark` | #e67700 | #ff9800 |
| `--color-slate` | #94a3b8 | #94a3b8 |
| `--color-slate-dark` | #64748b | #94a3b8 |
| `--color-indigo` | #364fc7 | #5c7cfa |

## State Background Colors

| Variable | Light | Dark | Use For |
|----------|-------|------|---------|
| `--color-success-bg` | #e8f5e9 | rgba(34,197,94,0.12) | Success alerts |
| `--color-error-bg` | #fff5f5 | rgba(239,68,68,0.12) | Error alerts |
| `--color-warning-bg` | #fff3e0 | rgba(251,191,36,0.12) | Warning alerts |
| `--color-info-bg` | #e7f5ff | rgba(59,130,246,0.12) | Info alerts |
| `--color-purple-bg` | #e8d5f5 | rgba(147,51,234,0.12) | Purple highlight |
| `--border-warning` | #ffe0b2 | rgba(251,191,36,0.25) | Warning borders |

## Common Component Patterns

### Card / Panel
```css
.card {
    background: var(--bg-primary);
    border: 1px solid var(--border-default);
    border-radius: 12px;
    box-shadow: 0 2px 8px var(--shadow-md);
    color: var(--text-primary);
}
```

### Modal
```css
.modal-backdrop {
    background: var(--overlay-heavy);
}
.modal-content {
    background: var(--bg-primary);
    box-shadow: 0 4px 20px var(--shadow-lg);
}
```

### Input Fields
```css
input, textarea, select {
    background-color: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
}
input::placeholder {
    color: var(--text-hint);
}
```

### Interactive Elements
```css
.button {
    background: var(--bg-secondary);
    color: var(--text-primary);
}
.button:hover {
    background: var(--bg-hover);
}
.button:active {
    background: var(--bg-active);
}
```

### Status / Alert
```css
.alert-success {
    background: var(--color-success-bg);
    color: var(--color-green-dark);
}
.alert-error {
    background: var(--color-error-bg);
    color: var(--color-red-dark);
}
.alert-warning {
    background: var(--color-warning-bg);
    border: 1px solid var(--border-warning);
    color: var(--color-orange-dark);
}
.alert-info {
    background: var(--color-info-bg);
    color: var(--color-blue);
}
```

## Rules

1. **Never hardcode colors** — always use `var(--xxx)` theme variables
2. **Pick the closest existing variable** — don't create new ones unless absolutely necessary
3. **New variables must have both modes** — define in both `:root` and `[data-theme='dark']` in `+layout.svelte`
4. **Game-specific inline variables are OK** — e.g., `--block-color`, `--tile-size` for game elements
5. **Use semantic names** — `--bg-primary` not `--white`, `--text-secondary` not `--gray`
6. **Shadows use shadow variables** — never write `rgba(0,0,0,0.1)` directly in component CSS
7. **Theme transition** — body has `transition: background-color 0.2s, color 0.2s`
