# Limitations & Future Work

This document provides a candid engineering assessment of architectural simplifications, current platform boundaries, and recommended technical roadmaps for future iterations of Jumble Sale.

---

## 1. Current Limitations & Simplifications

### 1.1 Cold-Start Collaborative Filtering Sparsity
- **Current State**: The collaborative filtering component of the hybrid recommendation engine relies on a user co-occurrence bipartite graph (`users who saved X also liked Y`). In early-stage deployments with few interactions, this co-occurrence graph has high sparsity.
- **Mitigation Implemented**: The system gracefully falls back to onboarding category match, discount depth, and popularity ranking.
- **Future Work**: Implement Matrix Factorization (e.g. Implicit ALS) or LightFM hybrid graph neural networks once interaction volume reaches $\ge 100{,}000$ events.

### 1.2 Geolocation Filtering
- **Current State**: The application currently filters deals geographically via exact city string matching (e.g. `'Lahore'`, `'Karachi'`, `'Islamabad'`).
- **Limitation**: It does not compute radius-based geofencing (e.g. deals within 5 km of the user's GPS coordinates).
- **Future Work**: Add PostGIS extension to Supabase (`GEOGRAPHY(POINT, 4326)`) and introduce `ST_DWithin` radius filtering with GPS location permissions on native devices.

### 1.3 Deal Redemption & Voucher Lifecycle
- **Current State**: Promotions are informational discovery cards with external links, terms, and store locations.
- **Limitation**: There is no closed-loop in-app redemption code checkout system (e.g. single-use QR codes scanned by cashiers at store point-of-sale).
- **Future Work**: Build a merchant voucher verification scanner inside the Brand Portal with one-time barcode redemption.

### 1.4 Native Document Preview on Web
- **Current State**: The Admin Brand Approval queue opens brand verification PDFs and documents via pre-signed private storage URLs in a new browser tab.
- **Limitation**: On mobile devices, viewing large multi-page PDF documents relies on system PDF handlers rather than an embedded inline PDF viewer.
- **Future Work**: Integrate `react-native-pdf` or a web PDF canvas viewer for seamless in-app document inspection.

### 1.5 Multi-Language Roman Urdu Dialect Variations
- **Current State**: The AI chatbot and promo copy generator understand Pakistani Roman Urdu through semantic Gemini processing and regex heuristics.
- **Limitation**: Roman Urdu lacks standardized phonetic spelling (e.g. *"sasti"*, *"susti"*, *"kam qeemat"*, *"sasty"*). Extremely non-standard spellings or heavy slang may occasionally trigger the clarifying question fallback.
- **Future Work**: Fine-tune a lightweight sub-model or add a Roman Urdu normalization tokenizer mapping phonetic variations before Gemini intent extraction.

### 1.6 Push Token Registration on Web
- **Current State**: Expo Notifications push tokens are registered seamlessly on native Android and iOS devices.
- **Limitation**: Web browsers require Web Push API service worker configuration and VAPID credentials, which are currently stubbed on Expo Web preview.
- **Future Work**: Configure Firebase Cloud Messaging (FCM) Web Push credentials in `app.json` for desktop browser push notifications.

---

## 2. Technical Roadmap & Enhancements

1. **Merchant POS Integrations**: Direct API webhooks for retail ERPs (SAP, Retail Pro, Candela) to synchronize promotion inventories in real time.
2. **Social Referral Rewards**: Allow consumers to share deals with friends and earn points or tier status when friends bookmark promotions.
3. **Automated Optical Character Recognition (OCR)**: Automatic text and tax registration number extraction from brand registration documents to speed up admin verification.
4. **Vector Search Optimization**: Transition vector distance queries from on-demand compute to quantized HNSW partition caches as deal catalog scales past 50,000 active promotions.
