# System Sequence Diagrams

This document illustrates the end-to-end communication lifecycles across clients, Supabase services, and AI systems using Mermaid sequence diagrams.

---

## 1. User (Consumer) Registration & Onboarding Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Consumer as Consumer User
    participant App as Mobile App (Expo)
    participant Auth as Supabase Auth
    participant DB as PostgreSQL Database

    Consumer->>App: Enters Name, Email, Password
    App->>Auth: supabase.auth.signUp(email, password, {role: 'consumer'})
    Auth->>DB: INSERT INTO auth.users
    DB->>DB: Trigger: on_auth_user_created fires
    DB->>DB: INSERT INTO public.profiles (role: 'consumer')
    Auth-->>App: Returns Auth Session & JWT
    App->>Consumer: Navigates to Onboarding Screen
    Consumer->>App: Selects Favorite Categories (e.g. Fashion, Food)
    App->>DB: UPSERT INTO public.user_preferences (preferred_categories)
    DB-->>App: Preferences Saved
    App->>Consumer: Navigates to Home Feed with Cold-Start Ranking
```

---

## 2. Brand Registration & Admin Approval Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Brand as Brand Representative
    participant App as Brand Portal
    participant Storage as Supabase Storage (brand-docs)
    participant DB as PostgreSQL Database
    actor Admin as Platform Admin
    participant Edge as Edge Function (send-notification)

    Brand->>App: Enters Brand Info & Uploads Registration Certificate
    App->>Storage: upload(file) to private 'brand-docs' bucket
    Storage-->>App: Returns private storage path
    App->>DB: INSERT INTO public.brands (status: 'pending', is_verified: false)
    DB-->>App: Record created
    App->>Brand: Shows "Pending Approval" Waiting Screen

    Admin->>App: Opens Admin Dashboard -> Brand Approvals Queue
    App->>DB: SELECT * FROM public.brands WHERE status = 'pending'
    App->>Storage: createSignedUrl(path, 3600) for private documents
    Admin->>App: Inspects certificate and clicks "Approve Brand"
    App->>DB: RPC admin_approve_brand(brand_id)
    DB->>DB: UPDATE public.brands SET status = 'active', is_verified = true
    DB->>DB: INSERT INTO public.admin_audit_log (action: 'APPROVE_BRAND')
    DB->>DB: INSERT INTO public.notifications (user_id: brand_owner_id)
    DB-->>App: Approval confirmed
    App->>Edge: Trigger push notification to brand owner
    Edge-->>Brand: Push notification: "Your brand has been approved!"
    Brand->>App: App refreshes into Brand Studio Dashboard
```

---

## 3. Promotion Upload & Admin Approval Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Brand as Verified Brand
    participant Studio as Create Deal Screen
    participant CopyEdge as Edge Function (generate-promo-copy)
    participant DB as PostgreSQL Database
    actor Admin as Admin Reviewer
    participant Consumer as Follower / Consumer

    Brand->>Studio: Inputs product, discount %, dates
    Brand->>Studio: Clicks "Generate with AI"
    Studio->>CopyEdge: POST /generate-promo-copy (payload, JWT)
    CopyEdge->>CopyEdge: Verifies caller role == 'brand'
    CopyEdge-->>Studio: Returns 3 titles & 2 descriptions
    Brand->>Studio: Picks preferred title, reviews & edits copy
    Studio->>DB: INSERT INTO public.deals (status: 'pending')
    DB-->>Studio: Deal created with status 'pending'
    Studio->>Brand: Deal appears in "My Promotions" with Pending chip

    Admin->>Studio: Opens Promotion Approval Queue
    Studio->>DB: SELECT * FROM deals WHERE status = 'pending'
    Admin->>Studio: Previews exact consumer rendering and clicks "Approve"
    Studio->>DB: RPC admin_approve_deal(deal_id)
    DB->>DB: UPDATE deals SET status = 'active'
    DB->>DB: INSERT INTO public.admin_audit_log (action: 'APPROVE_DEAL')
    DB->>DB: Trigger: trg_notify_followers_on_deal_approval
    DB->>Consumer: In-app notification & Expo Push sent to followers
    Consumer->>Consumer: Deal becomes visible in Home Discovery Feed
```

---

## 4. Bilingual AI Chatbot Query Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User as Consumer User
    participant ChatScreen as AI Assistant Screen
    participant Edge as Edge Function (chat-assistant)
    participant Gemini as Google Gemini 1.5 Flash
    participant DB as PostgreSQL Database

    User->>ChatScreen: Types "Eid pe kapron par sasti sale dikhao"
    ChatScreen->>Edge: POST /chat-assistant (message, JWT)
    Edge->>Edge: Rate limit check (max 15 msgs/min via check_chat_rate_limit)
    Edge->>Edge: Sanitize prompt injection patterns
    Edge->>Gemini: Extract intent (language: 'roman_urdu', category: 'Fashion & Apparel')
    Gemini-->>Edge: Returns extracted parameters JSON
    Edge->>DB: SELECT deals WHERE status = 'active' AND category = 'Fashion' AND end_date > NOW()
    DB-->>Edge: Returns real matching promotions from Khaadi & Outfitters
    Edge->>Edge: Formulate grounded Roman Urdu reply referencing matched deals
    Edge->>DB: INSERT INTO chat_messages (user_id, content, deal_ids)
    Edge-->>ChatScreen: Returns { reply, deals: [...], language: 'roman_urdu' }
    ChatScreen->>User: Displays Roman Urdu message with interactive horizontal deal cards
```

---

## 5. Hybrid Recommendation Generation Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Consumer as Consumer User
    participant Home as Home Screen Feed
    participant Edge as Edge Function (recommendations)
    participant DB as PostgreSQL (public.get_recommendations)
    participant Cron as pg_cron Scheduler

    Consumer->>Home: Opens Home Tab
    Home->>Edge: GET /recommendations?limit=8 (Bearer JWT)
    Edge->>DB: SELECT public.get_recommendations(p_limit: 8, p_user_id: user_id)
    
    rect rgb(240, 245, 255)
        Note over DB: Database Scoring Engine Execution
        DB->>DB: Fetch user_preferences (preference_vector, categories)
        DB->>DB: Exclude deals already saved by user
        DB->>DB: Compute Cosine Similarity: 1 - (embedding <=> preference_vector)
        DB->>DB: Compute Collaborative Signals (co-occurrence graph of likes/saves)
        DB->>DB: Apply Popularity Boost + Ending-Soon Boost (<= 48 hours)
        DB->>DB: Calculate Final Composite Hybrid Score & Transparency Reason
    end

    DB-->>Edge: Returns top ranked active promotions
    Edge-->>Home: Returns JSON { recommendations: [...] }
    Home->>Consumer: Renders "✨ Recommended for You" carousel with AI reason chips

    loop Daily at 03:00 UTC
        Cron->>DB: SELECT public.refresh_all_user_preferences()
        DB->>DB: Decays older interactions with 1 / (1 + 0.1 * days)
        DB->>DB: Updates public.user_preferences (preference_vector)
    end
```
