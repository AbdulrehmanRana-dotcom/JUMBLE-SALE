# Design system (Jumble Sale)

Tokens live in `/src/theme`. They are exported as plain TypeScript objects for use in StyleSheets.

## Source of truth

1. Mockups in `/design` (add your PNG/JPG files).
2. Code tokens in `/src/theme` — update when mockups change.

## Current palette (starter — tune against `/design`)

| Token | Value | Usage |
|-------|-------|--------|
| `primary` | `#E84855` | CTAs, active tab, deal accents |
| `primaryDark` | `#C93440` | Pressed primary |
| `secondary` | `#1F2937` | Headings, strong text |
| `accent` | `#6366F1` | AI / highlights |
| `background` | `#F5F6F8` | Screen background |
| `surface` | `#FFFFFF` | Cards, inputs |
| `textPrimary` | `#111827` | Body |
| `textSecondary` | `#6B7280` | Captions |
| `border` | `#E5E7EB` | Dividers, outlines |
| `success` | `#059669` | Approved / saved |
| `warning` | `#D97706` | Expiring soon |
| `error` | `#DC2626` | Errors |

## Typography

- **Font:** Plus Jakarta Sans (400, 500, 600, 700)
- **Scale:** `xs` 12 → `3xl` 30 (see `typography.ts`)

## Spacing & radius

- Spacing base unit: **4px** (`spacing[1]` = 4)
- Radius: `sm` 8, `md` 12, `lg` 16, `xl` 24, `full` pill
