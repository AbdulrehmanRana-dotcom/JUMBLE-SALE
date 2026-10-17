# Setup & Deployment Guide

This guide walks through configuring Supabase backend services, setting environment secrets, running database migrations, deploying Edge Functions, and building an Android APK using Expo Application Services (EAS).

---

## 1. Prerequisites

- **Node.js**: v20+ / npm v10+
- **Expo CLI**: `npx expo`
- **EAS CLI**: `npx eas-cli@latest`
- **Supabase CLI**: `npx supabase@latest`
- **Git**: Installed and initialized

---

## 2. Supabase Project Setup & Database Migrations

### 2.1 Connect Local Project to Remote Supabase
```bash
# Login to your Supabase account
npx supabase login

# Link your local repo to the remote project
npx supabase link --project-ref ajbxviddoiipcxtovxxu
```

### 2.2 Execute Database Migrations
Run the ordered migrations to initialize extensions (`pgvector`, `pg_cron`, `pg_trgm`), tables, triggers, and Row-Level Security policies:

```bash
# Push all SQL migrations to remote database
npx supabase db push
```

The migration files will execute sequentially:
1. `20261004000000_production_schema.sql`: Core schema, enum types, indexes, and base RLS policies.
2. `20261004000001_admin_rpcs.sql`: Administrative management RPCs, audit log routines, and queues.
3. `20261004000002_automation_cron_analytics.sql`: `pg_cron` jobs, rollup functions, and push notification triggers.
4. `20261004000003_hybrid_recommender.sql`: `vector(768)` embedding column, HNSW index, preference calculation routines, and `get_recommendations()` RPC.
5. `20261004000004_ai_chatbot_and_copy.sql`: Rate limiting, `search_deals_for_chat()` stored procedure, and chat schema extensions.

---

## 3. Configuring Supabase Secrets

Set server-side secrets in the Supabase Vault. These are never exposed to client bundles:

```bash
# Google Gemini API Key for embeddings and bilingual chatbot
npx supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here

# Confirm configured secrets
npx supabase secrets list
```

---

## 4. Deploying Supabase Edge Functions

Deploy the 5 production Edge Functions:

```bash
# 1. Bilingual AI Chat Assistant
npx supabase functions deploy chat-assistant

# 2. Promotional Copy Generator
npx supabase functions deploy generate-promo-copy

# 3. Hybrid Recommendations Edge Gateway
npx supabase functions deploy recommendations

# 4. Content Vector Embeddings Generator
npx supabase functions deploy generate-embeddings

# 5. Expo Push Notification Dispatcher
npx supabase functions deploy send-notification
```

---

## 5. Client Environment Configuration

Configure your client `.env` file in the project root:

```ini
EXPO_PUBLIC_SUPABASE_URL=https://ajbxviddoiipcxtovxxu.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_anon_key_here
```

> [!IMPORTANT]
> Never put the `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` in the client `.env`. The client must only ever receive the publishable anon key.

---

## 6. Building Android APK with EAS Build

### 6.1 Install & Login to EAS CLI
```bash
npx eas-cli@latest login
```

### 6.2 Configure `eas.json`
Ensure `eas.json` has an APK build profile for standalone testing without Google Play Store signing:

```json
{
  "cli": {
    "version": ">= 12.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

### 6.3 Trigger Android APK Cloud Build
Run the cloud build to produce a installable `.apk` file:

```bash
# Build standalone Android APK
npx eas-cli@latest build --platform android --profile preview
```

EAS Build will execute in the cloud, handle Android SDK tools, compile the native runtime, and generate a downloadable link and QR code for the `.apk`.

### 6.4 Run Locally on Web
To run the web preview locally:
```bash
npx expo start --web
```
Access the application at `http://localhost:8081`.
