# Design System — Writing Evaluator

## Design Philosophy

Mercury-inspired: cool neutral palette, frosted glass navigation, surface layering for depth (not heavy shadows), generous radius. Clean, professional, warm enough for researchers.

## Color Architecture

All colors are defined as CSS custom properties in `src/app/globals.css` using the oklch color space. Tailwind utility classes are generated via `@theme inline` registration.

### Core Theme Tokens

Cool neutral tint (hue ~260, very low chroma) for backgrounds and surfaces. Primary accent is indigo (hue 280). Both light (`:root`) and dark (`.dark`) modes are fully defined.

| Token | Light Usage | Dark Usage |
|-------|-------------|------------|
| `background` / `foreground` | Cool off-white / near-black | Cool charcoal / light gray |
| `card` / `card-foreground` | Near-white (elevated above bg) / dark text | Dark card / light text |
| `muted` / `muted-foreground` | Subtle cool gray bg / secondary text | Dark muted bg / dim text |
| `primary` / `primary-foreground` | Indigo (~280 hue) / white | Lighter indigo / dark text |
| `accent` | Cool tinted hover bg | Dark accent bg |
| `destructive` | Warm red | Lighter warm red |
| `success` | Warm green | Lighter warm green |

### Surface Layering

Depth comes from background color steps, not heavy shadows (Mercury pattern):
- `background` (page) → `card` (elevated surfaces) — visible tint difference
- Light: bg `oklch(0.975)` vs card `oklch(0.995)` — cards float above the page
- Hover states use `hover:shadow-sm` — subtle, not dramatic

### Semantic Domain Tokens

These are project-specific tokens for domain concepts. **Always use these instead of raw Tailwind colors.**

#### Status Tokens (`--status-{state}-{bg,text}`)
For project status badges (SETUP, ACTIVE, RECONCILIATION, COMPLETE).

```
bg-status-setup-bg text-status-setup-text
bg-status-active-bg text-status-active-text
bg-status-reconciliation-bg text-status-reconciliation-text
bg-status-complete-bg text-status-complete-text
```

Shared map in `src/lib/status-colors.ts` — import and use `statusColors[status]`.

#### Score Tokens (`--score-{level}-{bg,border,text,solid}`)
For rubric scoring buttons (low/mid/high based on scale position).

```
border-score-low-border bg-score-low-bg text-score-low-text    # unselected low
bg-score-low-solid text-white border-score-low-solid            # selected low
border-score-mid-border bg-score-mid-bg text-score-mid-text    # unselected mid
bg-score-mid-solid text-white border-score-mid-solid            # selected mid
border-score-high-border bg-score-high-bg text-score-high-text # unselected high
bg-score-high-solid text-white border-score-high-solid          # selected high
```

Used by `getScoreColor()` / `getSelectedScoreColor()` in `evaluate-client.tsx`.

#### Navigation Circle Tokens (`--nav-{state}-{bg,text,ring}`)
For the numbered item navigation circles in the evaluation interface.

```
bg-nav-current-bg text-nav-current-text ring-nav-current-ring  # current item
bg-nav-scored-bg text-nav-scored-text                           # scored items
bg-nav-unscored-bg text-nav-unscored-text                      # unscored items
```

#### Content Card Tokens (`--content-{type}-{bg,border,text}`)
For the split-pane content cards in the evaluation interface.

```
border-content-student-border bg-content-student-bg text-content-student-text
border-content-feedback-border bg-content-feedback-bg text-content-feedback-text
```

## Dark Mode

- **FOUC prevention**: Inline script in `<head>` (layout.tsx) checks localStorage → system preference → defaults light
- **Toggle**: `<ThemeToggle />` component (Sun/Moon icons) in nav header
- **Implementation**: `.dark` class on `<html>`, custom variant via `@custom-variant dark (&:where(.dark, .dark *))`
- **All tokens** have both light and dark definitions — no component-level dark mode overrides needed

## Shared Components

### NavHeader (`src/components/nav-header.tsx`)
Frosted glass sticky header on all authenticated pages.
- `bg-background/80 backdrop-blur-lg border-b border-border`
- In supported browsers: `supports-[backdrop-filter]:bg-background/60`
- Contains: app title link, theme toggle, user email (hidden mobile), sign out
- Height: `h-14`, max-width: `max-w-7xl`

### ThemeToggle (`src/components/theme-toggle.tsx`)
Client component. Toggles `.dark` class, persists to localStorage.

## Design Rules

1. **Never use hardcoded Tailwind colors** — always use semantic tokens or core theme tokens
2. **Status/scoring/content colors have dedicated tokens** — don't reach for raw color classes
3. **All interactive elements**: `transition-all duration-200`
4. **Card hover effects**: `hover:shadow-sm hover:ring-1 hover:ring-primary/10`
5. **Page containers**: `py-10` consistent padding
6. **Frosted glass nav**: `bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60 border-b border-border`
7. **Dark mode**: Automatic — just use semantic tokens, never hardcode light-only colors
8. **Typography**: Use `text-foreground` for primary, `text-muted-foreground` for secondary
9. **Success states**: Use `text-success` / `bg-success/10`, not green-*
10. **Error states**: Use `text-destructive`, not red-*
