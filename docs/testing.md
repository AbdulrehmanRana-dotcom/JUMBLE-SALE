# Test Suite & Verification Matrix

This document provides the formal Test Execution Report and Requirements-to-Tests Traceability Matrix for the Jumble Sale platform.

---

## 1. Test Case Execution Results Table

| Test ID | Requirement | Test Steps | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| **TC-01** | Deal End Date Validation | Submit deal with `start_date: 2026-06-01`, `end_date: 2026-06-15`. | Passes schema validation. | Schema validated successfully. | **PASS** |
| **TC-02** | Inverted Date Rejection | Submit deal with `start_date: 2026-06-15`, `end_date: 2026-06-01`. | Zod validation error: "End date must be strictly after start date". | Rejected with custom issue on `end_date`. | **PASS** |
| **TC-03** | In-Store City Requirement | Submit `deal_type: 'in_store'` with empty city string. | Rejects with message: "City is mandatory for in-store promotions". | Validation blocked submission. | **PASS** |
| **TC-04** | Brand Verification Document | Register brand account without document attachments. | Rejection: At least 1 document required in private bucket. | Form validation blocked submission. | **PASS** |
| **TC-05** | Vector Cosine Similarity | Compute cosine similarity between identical vectors `[1, 0, 0]` and `[1, 0, 0]`. | Value equals `1.0`. | Cosine similarity = `1.0`. | **PASS** |
| **TC-06** | Vector Orthogonality | Compute cosine similarity between `[1, 0, 0]` and `[0, 1, 0]`. | Value equals `0.0`. | Cosine similarity = `0.0`. | **PASS** |
| **TC-07** | Interaction Recency Weight | Calculate weight for interaction today ($0$ days ago). | $1 / (1 + 0.1 \times 0) = 1.0$. | Calculated weight = `1.0`. | **PASS** |
| **TC-08** | Temporal Recency Decay | Calculate weight for 10-day old interaction vs today. | $10\text{-day weight} < 0\text{-day weight}$. | $0.5 < 1.0$ decay verified. | **PASS** |
| **TC-09** | Hybrid Scoring Blending | Calculate score blending content similarity (50%), collaborative (30%), category (20%), and urgency boost. | Score $> 1.0$ with accurate weights. | Blended score = `1.09`. | **PASS** |
| **TC-10** | Consumer Deal Visibility RLS | Consumer selects deals across active, draft, and pending states. | Only active deals visible; drafts and pending hidden. | Only active Khaadi deal returned. | **PASS** |
| **TC-11** | Cross-Brand Deal Isolation | Brand B queries promotions table for Brand A's draft deals. | Brand A drafts are strictly inaccessible to Brand B. | 0 records returned. | **PASS** |
| **TC-12** | Direct Self-Activation Block | Brand attempts direct SQL UPDATE on deal setting `status = 'active'`. | Blocked by RLS `WITH CHECK (status IN ('draft', 'pending'))`. | Update denied. | **PASS** |
| **TC-13** | Cross-User Bookmarks RLS | User 2 queries `saved_deals` belonging to User 1. | RLS policy blocks access (`auth.uid() = user_id`). | 0 records returned. | **PASS** |
| **TC-14** | Cross-Brand Analytics RLS | Brand 1 queries `analytics_daily` belonging to Brand 2. | RLS blocks query (`brand_id = get_user_brand_id()`). | Access denied. | **PASS** |
| **TC-15** | Private Bucket Protection | Consumer attempts to read files from `brand-docs` bucket. | Storage policy blocks access; admin permitted. | Consumer denied, admin allowed. | **PASS** |
| **TC-16** | Promo Copy Auth Gate | Unauthenticated client calls `POST /generate-promo-copy`. | HTTP 401 Unauthorized returned. | 401 returned. | **PASS** |
| **TC-17** | Promo Copy Role Gate | Consumer role caller calls `POST /generate-promo-copy`. | HTTP 403 Forbidden returned. | 403 returned. | **PASS** |
| **TC-18** | Notification Dispatch Gate | Consumer caller calls `POST /send-notification`. | HTTP 403 Forbidden returned (only admin/service role). | 403 returned. | **PASS** |
| **TC-19** | User Impersonation Defense | Anonymous caller passes `user_id` in body to `/recommendations`. | Function ignores spoofed ID and keeps user ID null. | Spoof attempt neutralized. | **PASS** |
| **TC-20** | Chat Input Length Limit | User submits chat message exceeding 500 characters. | HTTP 400 Validation error returned. | Rejected with 400 error. | **PASS** |
| **TC-21** | Consumer E2E Registration | New user signs up as consumer. | Profile created with role `consumer`. | Profile verified. | **PASS** |
| **TC-22** | Consumer Onboarding | User selects preferred categories. | Stored in `user_preferences`. | Category preferences stored. | **PASS** |
| **TC-23** | Consumer Feed Discovery | Consumer requests discovery feed. | Returns only verified active promotions. | Active deals delivered. | **PASS** |
| **TC-24** | Consumer Deal Bookmark | Consumer bookmarks active deal. | Inserted into `saved_deals` and logged. | Saved deal recorded. | **PASS** |
| **TC-25** | Brand Registration Flow | Brand registers with incorporation document. | Status starts as `pending` and `is_verified: false`. | Verified pending state. | **PASS** |
| **TC-26** | Admin Brand Approval | Admin reviews docs and approves brand via RPC. | Brand status becomes `active`, `is_verified: true`. | Brand activated. | **PASS** |
| **TC-27** | Brand Deal Creation | Approved brand submits new promotion. | Promotion created with status `pending`. | Deal status is `pending`. | **PASS** |
| **TC-28** | Pending Deal Isolation | Consumer searches feed while deal is pending. | Pending deal strictly absent from feed. | Deal omitted from consumer feed. | **PASS** |
| **TC-29** | Admin Deal Approval | Admin approves promotion via `admin_approve_deal`. | Promotion status becomes `active`. | Deal activated. | **PASS** |
| **TC-30** | Consumer Deal Discovery | Consumer searches feed after admin approval. | Newly approved deal is now discovered in feed. | Deal returned in feed. | **PASS** |

---

## 2. Requirements-to-Tests Traceability Matrix

| Functional Requirement | Description | Implementing Module | Covering Test Cases |
|---|---|---|---|
| **REQ-AUTH-01** | Multi-tenant user roles (`consumer`, `brand`, `admin`) | `app/(auth)/register.tsx`, `handle_new_user()` | TC-21, TC-25 |
| **REQ-BRAND-01** | Brand registration with required verification documents | `app/(brand)/register.tsx`, `brand-docs` bucket | TC-04, TC-15, TC-25 |
| **REQ-BRAND-02** | Brand deal creation with strict form validation | `app/(brand)/create-deal.tsx` | TC-01, TC-02, TC-03, TC-27 |
| **REQ-BRAND-03** | Brand deal edits reset active deals back to pending | `deals` UPDATE RLS Policy | TC-12 |
| **REQ-BRAND-04** | Multi-tenant brand isolation (deals & analytics) | PostgreSQL RLS on `deals` & `analytics_daily` | TC-11, TC-14 |
| **REQ-ADMIN-01** | Admin brand review and approval workflow | `public.admin_approve_brand()`, `admin_audit_log` | TC-26 |
| **REQ-ADMIN-02** | Admin deal review and approval workflow | `public.admin_approve_deal()`, `admin_audit_log` | TC-29 |
| **REQ-FEED-01** | Consumer feed displays only active, unexpired deals | `public.get_active_deals()`, PostgREST | TC-10, TC-23, TC-28, TC-30 |
| **REQ-BOOKMARK-01**| Private user saved deals | `public.saved_deals` RLS | TC-13, TC-24 |
| **REQ-REC-01** | Content vector embedding & cosine similarity | `generate-embeddings`, pgvector HNSW | TC-05, TC-06 |
| **REQ-REC-02** | Temporal recency decay on user preference vectors | `refresh_all_user_preferences()`, `pg_cron` | TC-07, TC-08 |
| **REQ-REC-03** | Hybrid blend scoring (content, collab, popularity, urgency) | `public.get_recommendations()` RPC | TC-09, TC-19 |
| **REQ-CHAT-01** | Bilingual deals chatbot grounded strictly in real database | `chat-assistant` Edge Function | TC-20 |
| **REQ-COPY-01** | Multi-tone promotional copy generation with role gate | `generate-promo-copy` Edge Function | TC-16, TC-17 |
| **REQ-NOTIF-01** | Push notification dispatch with administrative role check | `send-notification` Edge Function | TC-18 |

---

## 3. How to Run Test Suites

To execute the automated test suites locally:

```bash
# 1. Comprehensive System Verification & End-to-End Suite (30/30 tests)
npx tsx scripts/test-comprehensive-suite.ts

# 2. AI Chatbot & Promo Copy Generator Bilingual Suite (20/20 tests)
npx tsx scripts/test-ai-features.ts

# 3. Hybrid Recommender Precision/Recall Evaluation
npx tsx scripts/evaluate-recommender.ts

# 4. Brand Multi-Tenant & Form Isolation Suite
npx tsx scripts/test-brand-features.ts

# 5. Automation, Cron & Analytics Suite
npx tsx scripts/test-automation-analytics.ts

# 6. Admin Approvals & Audit Suite
npx tsx scripts/test-admin-features.ts

# 7. Code Quality & Static Analysis
npx tsc --noEmit
npx eslint app/ src/ --quiet
```
