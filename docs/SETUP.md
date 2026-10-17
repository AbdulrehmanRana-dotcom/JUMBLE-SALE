# Jumble Sale — local setup

## Prerequisites

- Node.js 20+
- Expo Go on a device, or Android emulator / iOS simulator / web browser

## Install

```bash
npm install
```

## Environment

```bash
copy .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from the Supabase dashboard. The design-system demo runs without a valid project, but auth and data features will need real values later.

## Run

```bash
npm start
```

Then press `w` for web, or scan the QR code for Expo Go.

The first screen is the **design system playground** (`app/index.tsx`).

## Project layout

| Path | Purpose |
|------|---------|
| `app/` | Expo Router screens |
| `src/components/` | Shared UI |
| `src/features/` | Role/feature modules (later) |
| `src/lib/` | Supabase client, query client |
| `src/theme/` | Design tokens |
| `supabase/` | Migrations & Edge Functions |
| `design/` | UI mockups (source of truth) |
