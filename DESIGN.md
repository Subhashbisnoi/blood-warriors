# Blood Warriors — Design & Theme Guide

A visual system inspired by the Blood Warriors brand. This document defines the *color scheme, typography, and styling tokens* only.

---

## 1. Brand Color Scheme

The palette is led by a vivid *blood red*, grounded by deep neutrals and softened with clean, warm whites. Red signals urgency, life, and donation; neutrals keep the system calm and trustworthy.

### Primary

| Token | Hex | Usage |
|---|---|---|
| `--red-600` | `#D7263D` | Primary brand red — CTAs, links, key accents |
| `--red-700` | `#A4161A` | Hover / pressed states, emphasis |
| `--red-500` | `#E63946` | Highlights, badges, active states |
| `--red-100` | `#FBE4E7` | Tints, hover backgrounds, soft fills |

### Neutrals

| Token | Hex | Usage |
|---|---|---|
| `--ink-900` | `#1A1A1E` | Primary text, headings |
| `--ink-600` | `#4A4A52` | Secondary text, captions |
| `--ink-300` | `#C9C9CF` | Borders, dividers, disabled |
| `--paper-50` | `#FFFFFF` | Base background / cards |
| `--paper-100` | `#FAF7F7` | Warm off-white section background |

### Support / Accent

| Token | Hex | Usage |
|---|---|---|
| `--maroon-900` | `#6A040F` | Deep footer / hero overlays |
| `--gold-500` | `#E9B949` | Sparingly — awards, impact stats |
| `--success` | `#2A9D8F` | Confirmation, "eligible to donate" |

---

## 2. CSS Variables

```css
:root {
  /* Reds */
  --red-500: #E63946;
  --red-600: #D7263D;
  --red-700: #A4161A;
  --red-100: #FBE4E7;
  --maroon-900: #6A040F;

  /* Neutrals */
  --ink-900: #1A1A1E;
  --ink-600: #4A4A52;
  --ink-300: #C9C9CF;
  --paper-50: #FFFFFF;
  --paper-100: #FAF7F7;

  /* Accent */
  --gold-500: #E9B949;
  --success:  #2A9D8F;

  /* Semantic */
  --bg:        var(--paper-100);
  --surface:   var(--paper-50);
  --text:      var(--ink-900);
  --text-soft: var(--ink-600);
  --primary:   var(--red-600);
  --primary-h: var(--red-700);
  --border:    var(--ink-300);
}
```

---

## 3. Color Usage Principles

- **One dominant red.** Use `--red-600` as the single primary. Reserve `--maroon-900` for large dark areas (hero overlays, footer) and `--red-500` for small bright accents only.
- **60 / 30 / 10.** ~60% neutral surfaces, ~30% ink text, ~10% red accents. Red should punctuate, not flood.
- **Gold is a spice.** Use `--gold-500` only for celebratory moments (impact numbers, milestones). Never as body or large fills.
- **Maintain contrast.** Body text stays `--ink-900` on `--paper`. Red on white passes AA at `--red-700` for text; use `--red-600`+ for large text / UI only.

---

## 4. Typography

| Role | Family | Weight | Notes |
|---|---|---|---|
| Display / H1 | **Poppins** | 600–700 | Bold, rounded, approachable |
| Headings | **Poppins** | 600 | Section titles |
| Body | **Inter** | 400 / 500 | Long-form readability |
| Numerals / Stats | **Poppins** | 700 | Large impact figures |

```css
--font-display: 'Poppins', system-ui, sans-serif;
--font-body:    'Inter', system-ui, sans-serif;
```

### Type Scale (1.25 ratio)

| Token | Size | Line height |
|---|---|---|
| `--text-xs`   | 0.8rem  | 1.4 |
| `--text-sm`   | 0.9rem  | 1.5 |
| `--text-base` | 1rem    | 1.6 |
| `--text-lg`   | 1.25rem | 1.5 |
| `--text-xl`   | 1.95rem | 1.25 |
| `--text-2xl`  | 2.6rem  | 1.15 |
| `--text-3xl`  | 3.8rem  | 1.05 |

---

## 5. Spacing & Radius

```css
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;
--space-4: 16px;  --space-6: 24px;  --space-8: 32px;
--space-12: 48px; --space-16: 64px; --space-24: 96px;

--radius-sm: 6px;
--radius-md: 12px;
--radius-lg: 20px;
--radius-pill: 999px;
```

- Pills (`--radius-pill`) for buttons and tags — friendly, campaign-forward.
- Cards use `--radius-lg` with generous internal padding (`--space-8`).

---

## 6. Elevation

```css
--shadow-sm: 0 1px 2px rgba(26,26,30,.06);
--shadow-md: 0 6px 20px rgba(26,26,30,.08);
--shadow-lg: 0 16px 40px rgba(106,4,15,.12); /* warm red-tinted */
```

Shadows carry a subtle warm (red/maroon) tint rather than neutral gray, so elevation feels on-brand.

---

## 7. Core Components

### Buttons

```css
.btn-primary {
  background: var(--red-600);
  color: #fff;
  border-radius: var(--radius-pill);
  padding: 12px 28px;
  font-family: var(--font-display);
  font-weight: 600;
  box-shadow: var(--shadow-md);
}
.btn-primary:hover { background: var(--red-700); }

.btn-ghost {
  background: transparent;
  color: var(--red-700);
  border: 1.5px solid var(--red-600);
  border-radius: var(--radius-pill);
}
```

### Card

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-8);
  box-shadow: var(--shadow-md);
}
```

### Stat / Impact Block

- Large `--text-3xl` numeral in `--red-600` (or `--gold-500` for highlights).
- Small `--text-sm` label in `--ink-600` below.

---

## 8. Theme Summary

```
Dominant:    Blood red (#D7263D)
Grounding:   Near-black ink (#1A1A1E) + warm white (#FAF7F7)
Depth:       Deep maroon (#6A040F)
Celebration: Gold (#E9B949)
Feel:        Urgent yet caring · clean · human · campaign-ready
```
