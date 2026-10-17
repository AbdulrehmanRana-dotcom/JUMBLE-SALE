# API & Database Functions Specification

This document provides complete interface specifications for all Edge Functions and PostgreSQL Stored Procedures (RPCs) implemented in Jumble Sale.

---

## 1. Supabase Edge Functions

### 1.1 `chat-assistant`
Bilingual conversational deals assistant powered by Gemini 1.5 Flash with strict real database grounding.

- **Endpoint**: `POST /functions/v1/chat-assistant`
- **Authentication**: Optional (supports anonymous guest browsing and authenticated consumer history sync)
- **Rate Limit**: Enforced max 15 requests per 60 seconds per user
- **Input Payload**:
  ```json
  {
    "message": "Eid pe kapron par sasti sale dikhao"
  }
  ```
  | Field | Type | Validation | Description |
  |---|---|---|---|
  | `message` | `string` | Mandatory, non-empty, max 500 characters | Natural language search query in English or Roman Urdu. |

- **Output Response (200 OK)**:
  ```json
  {
    "success": true,
    "reply": "Yeh rahein kapron par behtareen discounts:",
    "deals": [
      {
        "id": "e0000000-0000-0000-0000-000000000001",
        "title": "Summer Clearance - Up to 50% Off",
        "discount_pct": 50,
        "deal_type": "in_store",
        "city": "Lahore",
        "image_urls": ["https://images.unsplash.com/..."],
        "brand": { "id": "...", "name": "Khaadi", "logo_url": "..." },
        "category": { "id": "...", "name": "Fashion & Apparel" }
      }
    ],
    "language": "roman_urdu"
  }
  ```

---

### 1.2 `generate-promo-copy`
Generates high-converting title and description suggestions for brands creating a promotion.

- **Endpoint**: `POST /functions/v1/generate-promo-copy`
- **Authentication**: Required (`Authorization: Bearer <jwt>`). Caller must have profile role `'brand'` or `'admin'`.
- **Input Payload**:
  ```json
  {
    "product_or_category": "Lawn Collection",
    "brand_name": "Khaadi",
    "discount_pct": 40,
    "start_date": "2026-06-01T00:00:00Z",
    "end_date": "2026-06-15T00:00:00Z",
    "tone": "urgent",
    "language": "roman_urdu"
  }
  ```
  | Field | Type | Validation | Description |
  |---|---|---|---|
  | `product_or_category` | `string` | Mandatory, 2–100 chars | Item or collection being promoted. |
  | `brand_name` | `string` | Optional | Name of the publisher brand. |
  | `discount_pct` | `number` | Optional, 1–100 | Percentage discount. |
  | `tone` | `string` | `'exciting' \| 'luxury' \| 'urgent' \| 'casual'` | Copywriting tone. Default `'exciting'`. |
  | `language` | `string` | `'english' \| 'roman_urdu'` | Copy language style. |

- **Output Response (200 OK)**:
  ```json
  {
    "success": true,
    "titles": [
      "Aakhri Mauqa: Lawn Collection par Flat 40% Off!",
      "Flash Sale! Khaadi ki Lawn Collection par Badi Bachat",
      "Mehdood Muddat: 40% Discount Lawn Collection par"
    ],
    "descriptions": [
      "Waqt bohat kam hai! Khaadi par Lawn Collection ki tamam variety par flat 40% discount haasil karein...",
      "Khatam honay se pehlay faida uthayein! Khaadi ki taraf se Lawn Collection par 40% off flash deal..."
    ]
  }
  ```

---

### 1.3 `recommendations`
Exposes the hybrid personalized recommendation engine over HTTP Edge runtime.

- **Endpoint**: `GET /functions/v1/recommendations?limit=8` or `POST /functions/v1/recommendations`
- **Authentication**: Optional Bearer JWT (enables personalization; falls back to cold-start ranking if guest).
- **Input Parameters**:
  | Parameter | Type | Validation | Description |
  |---|---|---|---|
  | `limit` | `number` | 1–50 (default 10) | Maximum number of recommended deals to return. |
  | `user_id` | `string` | Optional UUID | Allowed only if caller is authenticated admin. |

- **Output Response (200 OK)**:
  ```json
  {
    "success": true,
    "count": 8,
    "recommendations": [
      {
        "id": "e0000000-0000-0000-0000-000000000001",
        "brand_name": "Khaadi",
        "title": "Summer Clearance - Up to 50% Off",
        "discount_pct": 50,
        "recommendation_score": 0.942,
        "recommendation_reason": "Matches your shopping interests (94% AI Match)"
      }
    ]
  }
  ```

---

### 1.4 `generate-embeddings`
Generates 768-dimensional content embeddings using Gemini `text-embedding-004` and stores them in `deals.embedding`.

- **Endpoint**: `POST /functions/v1/generate-embeddings`
- **Authentication**: Required (`service_role` key or admin / brand JWT).
- **Input Payload**:
  ```json
  {
    "deal_id": "optional-uuid",
    "limit": 20
  }
  ```
- **Output Response (200 OK)**:
  ```json
  {
    "success": true,
    "processed_count": 5,
    "deal_ids": ["..."]
  }
  ```

---

### 1.5 `send-notification`
Dispatches push notifications via Expo Push Notification service and mirrors records into `public.notifications`.

- **Endpoint**: `POST /functions/v1/send-notification`
- **Authentication**: Required (service role key or authenticated admin JWT).
- **Input Payload**:
  ```json
  {
    "type": "new_deal",
    "user_ids": ["user-uuid-1", "user-uuid-2"],
    "title": "New Deal from Khaadi!",
    "body": "50% Off Summer Lawn Clearance has just started.",
    "deal_id": "deal-uuid",
    "data": { "screen": "deal-detail" }
  }
  ```
  | Field | Type | Validation | Description |
  |---|---|---|---|
  | `title` | `string` | 1–120 characters | Notification alert headline. |
  | `body` | `string` | 1–500 characters | Notification message body. |
  | `user_ids` | `string[]` | Max 500 recipients | Target recipient profile UUIDs. |
  | `deal_id` | `string` | Optional UUID | Related promotion ID for deep linking. |

- **Output Response (200 OK)**:
  ```json
  {
    "success": true,
    "sent_count": 2,
    "skipped_optout": 0
  }
  ```

---

## 2. PostgreSQL Stored Procedures (RPCs)

### 2.1 `public.get_recommendations(p_limit INT, p_user_id UUID)`
Calculates the hybrid recommendation score blending content vector similarity, collaborative filtering overlap, onboarding category match, popularity, and urgency boost.

- **Parameters**:
  - `p_limit` (`INT`, default `10`): Number of recommendations to return.
  - `p_user_id` (`UUID`, default `NULL`): User context for personalized scoring.
- **Security**: `SECURITY DEFINER SET search_path = public`
- **Returns**: `TABLE (id UUID, brand_id UUID, brand_name TEXT, brand_logo TEXT, category_id UUID, category_name TEXT, title TEXT, description TEXT, discount_pct NUMERIC, deal_type deal_type, city TEXT, image_urls TEXT[], start_date TIMESTAMPTZ, end_date TIMESTAMPTZ, status deal_status, terms TEXT, recommendation_score FLOAT, recommendation_reason TEXT)`

---

### 2.2 `public.get_active_deals(p_category_id UUID, p_city TEXT, p_search TEXT, p_limit INT, p_offset INT)`
Retrieves paginated active promotions with joins on brands and categories.

- **Parameters**:
  - `p_category_id` (`UUID`, default `NULL`): Filter by category.
  - `p_city` (`TEXT`, default `NULL`): Filter by city.
  - `p_search` (`TEXT`, default `NULL`): Full-text search keyword.
  - `p_limit` (`INT`, default `20`): Page size.
  - `p_offset` (`INT`, default `0`): Pagination offset.
- **Returns**: `TABLE (...)` with deal metadata, brand name, and logo.

---

### 2.3 `public.search_deals_for_chat(...)`
Executes real SQL search queries tailored for the AI Assistant, enforcing active status and future expiration dates.

- **Parameters**:
  - `p_keywords` (`TEXT`)
  - `p_category` (`TEXT`)
  - `p_brand` (`TEXT`)
  - `p_min_discount` (`NUMERIC`)
  - `p_city` (`TEXT`)
  - `p_deal_type` (`TEXT`)
  - `p_ending_soon` (`BOOLEAN`)
  - `p_limit` (`INT`, default `5`)
- **Returns**: `TABLE (...)` matching active deals.

---

### 2.4 Administrative RPCs (Admins Only)

#### `public.admin_approve_brand(p_brand_id UUID)`
- Sets `brands.status = 'active'` and `brands.is_verified = true`.
- Writes entry into `admin_audit_log`.
- Dispatches in-app notification to the brand owner.

#### `public.admin_reject_brand(p_brand_id UUID, p_reason TEXT)`
- Sets `brands.status = 'rejected'` and `brands.rejection_reason = p_reason`.
- Writes entry into `admin_audit_log`.
- Dispatches in-app notification with explanation.

#### `public.admin_approve_deal(p_deal_id UUID)`
- Sets `deals.status = 'active'`.
- Records `admin_audit_log` event.
- Triggers notifications to brand followers.

#### `public.admin_reject_deal(p_deal_id UUID, p_reason TEXT)`
- Sets `deals.status = 'rejected'` and `deals.rejection_reason = p_reason`.
- Records audit log entry and notifies brand owner.

#### `public.admin_manage_user(p_user_id UUID, p_action TEXT, p_reason TEXT)`
- Executes actions: `'suspend'`, `'reactivate'`, or `'remove'`.
- Sets `profiles.is_active` appropriately.
- Records audit event.

#### `public.admin_resolve_report(p_report_id UUID, p_status TEXT, p_suspend_deal BOOLEAN, p_notes TEXT)`
- Resolves content report (`'resolved'` or `'dismissed'`).
- Optionally sets target deal status to `'rejected'` if violated terms.
- Logs administrative decision.
