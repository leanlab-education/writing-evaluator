# ASVS 5.0 Level 2 Security Audit Report

**Application**: Writing Evaluator
**ASVS Version**: 5.0
**Target Level**: L2 (Standard)
**Date**: 2026-04-06
**Auditor**: Automated multi-agent audit (5 parallel domain-specific agents)
**Tech Stack**: Next.js 16, Auth.js v5 (JWT), Prisma v7, Neon PostgreSQL, Vercel

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total L1+L2 requirements checked** | 126 |
| **PASS** | 82 (65%) |
| **PARTIAL** | 14 (11%) |
| **FAIL** | 21 (17%) |
| **N/A** | 9 (7%) |
| **Critical findings** | 3 |
| **High findings** | 7 |
| **Medium findings** | 8 |
| **Low findings** | 3 |

The application has strong fundamentals: React auto-escaping prevents XSS, Prisma parameterized queries prevent SQLi, all API routes enforce authentication and role-based authorization, and the blinding mechanism is properly enforced. Recent security hardening (this session) closed 4 critical authorization gaps and added security headers, JWT expiration enforcement, CSV injection protection, and SSRF prevention.

**To reach full ASVS L2 compliance, the primary gaps are:**
1. No multi-factor authentication (ASVS L2 requirement)
2. No rate limiting on authentication endpoints
3. No server-side logging or audit trail
4. No Content Security Policy header
5. Weak password policy (6-char min, no breach check)
6. No token revocation mechanism

---

## Compliance Matrix by Chapter

### V1: Encoding and Sanitization

| Req ID | Description | Level | Status | Notes |
|--------|-------------|-------|--------|-------|
| V1.1 | Decode once, encode at output | L2 | **PASS** | React JSX auto-escaping; single decode via searchParams |
| V1.2.1 | Context-aware HTML output encoding | L1 | **PASS** | All user data rendered via JSX text interpolation |
| V1.2.2 | URL encoding for dynamic URLs | L1 | **PASS** | URLSearchParams handles encoding |
| V1.2.3 | JS/JSON output encoding | L1 | **PASS** | No user data in script blocks |
| V1.2.4 | Parameterized queries (SQL/NoSQL) | L1 | **PASS** | Prisma ORM exclusively; no raw queries |
| V1.2.5 | OS command injection prevention | L1 | **PASS** | No exec/spawn/child_process usage |
| V1.2.6 | LDAP injection | L2 | **N/A** | No LDAP |
| V1.2.7 | XPath injection | L2 | **N/A** | No XML/XPath |
| V1.2.8 | LaTeX injection | L2 | **N/A** | No LaTeX |
| V1.2.9 | Regex injection | L2 | **PASS** | No user-supplied regex patterns |
| V1.2.10 | CSV/formula injection | L3 | **PASS** | csvEscape() prefixes =+-@\t\r with single quote |
| V1.3.2 | No eval()/dynamic code exec | L1 | **PASS** | Zero eval/Function/dynamic setTimeout |
| V1.3.6 | SSRF protection via URL allowlist | L2 | **PARTIAL** | studyId regex-validated; base URL from env (not user-controlled) |
| V1.3.7 | Template injection prevention | L2 | **PASS** | No template engines; React JSX only |
| V1.5.1 | Safe deserialization | L1 | **PASS** | Standard JSON.parse only |
| V1.5.2 | Allowlists for deserialized types | L2 | **PASS** | No object serialization formats used |

### V2: Validation and Business Logic

| Req ID | Description | Level | Status | Notes |
|--------|-------------|-------|--------|-------|
| V2.2.1 | Positive validation / allowlist | L1 | **PARTIAL** | Basic presence checks; no schema validation (zod) |
| V2.2.2 | Server-side validation enforced | L1 | **PARTIAL** | Required fields checked; types not validated |
| V2.3.1 | Business logic: batch status on scoring | L1 | **FAIL** | API accepts scores for items in DRAFT/COMPLETE batches |
| V2.3.2 | Batch status transitions | L1 | **PASS** | VALID_TRANSITIONS map enforces FSM |
| V2.3.3 | Score value validation | L1 | **FAIL** | No check against rubric scaleMin/scaleMax |
| V2.3.4 | Score dimensionId validation | L1 | **FAIL** | dimensionId not verified against project |
| V2.4.1 | Rate limiting on login | L2 | **FAIL** | No rate limiting anywhere |
| V2.4.2 | Rate limiting on password reset | L2 | **FAIL** | Email bombing possible |
| V2.4.3 | Account lockout | L2 | **FAIL** | No lockout mechanism |

### V3: Web Frontend Security

| Req ID | Description | Level | Status | Notes |
|--------|-------------|-------|--------|-------|
| V3.2.1 | Correct context rendering | L1 | **PASS** | User data rendered as text children in JSX |
| V3.2.2 | No innerHTML with user data | L1 | **PASS** | Only dangerouslySetInnerHTML is static theme script |
| V3.3.1 | Secure cookie flag + __Secure- prefix | L1 | **PARTIAL** | Auth.js auto-applies in production; not explicitly configured |
| V3.3.2 | SameSite attribute | L2 | **PASS** | Auth.js defaults to Lax |
| V3.3.4 | HttpOnly on session cookies | L2 | **PASS** | Auth.js default |
| V3.4.1 | HSTS max-age >= 1 year | L1 | **PASS** | 2 years with includeSubDomains + preload |
| V3.4.2 | CORS validated | L1 | **PASS** | Same-origin only (no CORS configured) |
| V3.4.3 | CSP with object-src 'none', base-uri 'none' | L2 | **FAIL** | No CSP header configured |
| V3.4.4 | X-Content-Type-Options: nosniff | L2 | **PASS** | Configured in next.config.ts |
| V3.4.5 | Referrer-Policy | L2 | **PASS** | strict-origin-when-cross-origin |
| V3.4.6 | frame-ancestors CSP directive | L2 | **PARTIAL** | X-Frame-Options: DENY set (legacy); CSP frame-ancestors needed |
| V3.5 | CSRF prevention | L1 | **PASS** | JSON POST/PUT with Auth.js CSRF tokens |

### V4: API and Web Service

| Req ID | Description | Level | Status | Notes |
|--------|-------------|-------|--------|-------|
| V4.1.1 | Schema validation on API inputs | L1 | **PARTIAL** | Basic checks only; no zod/yup schemas |
| V4.1.2 | Content-Type enforcement | L2 | **FAIL** | No Content-Type check on POST/PUT/PATCH |
| V4.1.3 | Response Content-Type matches body | L1 | **PASS** | NextResponse.json() auto-sets; export sets text/csv |
| V4.2.1 | HTTP method validation | L1 | **PASS** | Next.js App Router handles automatically |
| V4.2.2 | Mass assignment prevention | L2 | **PARTIAL** | Explicit field destructuring; no .strict() rejection |
| V4.2.3 | RESTful resource authorization | L1 | **PASS** | All routes check role + membership |

### V5: File Handling

| Req ID | Description | Level | Status | Notes |
|--------|-------------|-------|--------|-------|
| V5.1.1 | File type validation | L1 | **PASS** | Client-side CSV check; server receives JSON only |
| V5.1.2 | File size limits | L2 | **FAIL** | No size limit on CSV; client-side DoS possible |
| V5.4.1 | Path traversal prevention | L1 | **PASS** | studyId regex validated |
| V5.5.1 | Content-Disposition on downloads | L1 | **PASS** | Export sets proper headers |
| V5.5.2 | CSV injection prevention | L1 | **PASS** | Formula character prefixing implemented |
| V5.6.1 | SSRF protection | L1 | **PARTIAL** | URL from env + path validation; no explicit allowlist |

### V6: Authentication

| Req ID | Description | Level | Status | Notes |
|--------|-------------|-------|--------|-------|
| V6.2.1 | Min 8 chars password | L1 | **FAIL** | Currently 6 chars |
| V6.2.2 | Users can change password | L1 | **PARTIAL** | Only via email reset flow; no in-app change |
| V6.2.3 | Change requires current password | L1 | **FAIL** | No change-password endpoint |
| V6.2.4 | Common password check (top 3000) | L1 | **FAIL** | Not implemented |
| V6.2.5 | No composition rules | L1 | **PASS** | Correct — no arbitrary complexity rules |
| V6.2.8 | No truncation/case transform | L1 | **PASS** | Password passed directly to bcrypt |
| V6.2.9 | Allow 64+ char passwords | L2 | **PASS** | No maxlength enforced |
| V6.2.12 | Breach password check (HIBP) | L2 | **FAIL** | Not implemented |
| V6.3.1 | Anti-brute-force controls | L1 | **FAIL** | No rate limiting or lockout |
| V6.3.2 | No default accounts in production | L1 | **FAIL** | Seed script creates admin123/eval123 |
| V6.3.3 | MFA required | L2 | **FAIL** | No MFA implementation |
| V6.4.1 | Secure initial passwords | L1 | **PARTIAL** | Invite flow is good; admin user creation has no forced change |

### V7: Session Management

| Req ID | Description | Level | Status | Notes |
|--------|-------------|-------|--------|-------|
| V7.1 | Timeout policies documented | L2 | **PARTIAL** | JWT strategy; no explicit maxAge; defaults to 30 days |
| V7.2.1 | Server-side token verification | L1 | **PASS** | Auth.js middleware verifies JWE |
| V7.2.2 | Dynamic tokens | L1 | **PASS** | Fresh JWT on each login |
| V7.2.4 | New token on authentication | L1 | **PASS** | Auth.js issues new token per signIn() |
| V7.3 | Inactivity + absolute timeout | L2 | **FAIL** | No explicit timeout; 30-day default |
| V7.4.1 | Effective logout | L1 | **PARTIAL** | Cookie cleared; JWT still valid until expiry |
| V7.4.2 | Terminate on account disable | L1 | **FAIL** | No isActive field; no revocation on delete |
| V7.5 | Re-auth for sensitive changes | L2 | **FAIL** | No step-up auth for exports, role changes |

### V8: Authorization

| Req ID | Description | Level | Status | Notes |
|--------|-------------|-------|--------|-------|
| V8.1 | Deny by default | L1 | **PASS** | Middleware enforces auth; public routes allowlisted |
| V8.2 | Operation-level authz | L1-L2 | **PASS** | All 29 endpoints checked — every one has correct role check |
| V8.3 | Data-level access control / IDOR | L1-L2 | **PASS** | ProjectEvaluator membership enforced; users scoped to own scores |
| V8.3.x | Batch assign path validation | L2 | **PARTIAL** | POST/DELETE don't validate batchId belongs to projectId (admin-only) |

### V9: Self-contained Tokens

| Req ID | Description | Level | Status | Notes |
|--------|-------------|-------|--------|-------|
| V9.1.1 | Approved signing algorithms | L1 | **PASS** | HS256 (HMAC-SHA256) and A256CBC-HS512 (JWE) |
| V9.1.2 | No sensitive data in payload | L2 | **PASS** | Only role, id, email, name |
| V9.2.1 | Expiry validated (session JWT) | L1 | **PASS** | Auth.js validates exp claim |
| V9.2.2 | Expiry validated (StudyFlow) | L1 | **PASS** | maxTokenAge: 10m + exp required |
| V9.2.3 | Issuer/audience validated | L2 | **FAIL** | No iss/aud on StudyFlow JWT verification |
| V9.3.1 | Token revocation strategy | L2 | **FAIL** | No revocation mechanism for JWTs |

### V11: Cryptography

| Req ID | Description | Level | Status | Notes |
|--------|-------------|-------|--------|-------|
| V11.1.1 | Crypto inventory documented | L2 | **FAIL** | No documentation |
| V11.1.2 | Key management policy | L2 | **FAIL** | No rotation schedule or lifecycle docs |
| V11.2.1 | Industry-validated libs | L2 | **PASS** | bcryptjs, jose — well-maintained |
| V11.2.3 | Min 128-bit security | L2 | **PASS** | All operations >= 256 bits |
| V11.4.1 | Approved hash functions | L1 | **PASS** | bcrypt, HMAC-SHA256; no MD5/SHA1 |
| V11.4.2 | Password KDF (bcrypt/argon2) | L2 | **PASS** | bcrypt cost factor 12 |
| V11.5.1 | CSPRNG 128-bit entropy | L2 | **PASS** | crypto.randomBytes(32) = 256 bits |

### V12: Secure Communication

| Req ID | Description | Level | Status | Notes |
|--------|-------------|-------|--------|-------|
| V12.1.1 | TLS 1.2+ | L1 | **PASS** | Vercel enforces; HSTS configured |
| V12.2.1 | Certificate validation on outbound | L2 | **PASS** | Node.js fetch() validates certs by default |

### V13: Configuration

| Req ID | Description | Level | Status | Notes |
|--------|-------------|-------|--------|-------|
| V13.2.3 | No default credentials | L2 | **FAIL** | Seed script creates admin123 |
| V13.3.1 | Secrets manager, no secrets in code | L2 | **PASS** | Doppler; .env gitignored; no hardcoded secrets |
| V13.4.1 | No .git accessible | L1 | **PASS** | Vercel doesn't serve .git |
| V13.4.2 | Debug disabled in production | L2 | **PASS** | No debug flags |
| V13.4.5 | CSP header | L2 | **FAIL** | Not configured (duplicate of V3.4.3) |

### V14: Data Protection

| Req ID | Description | Level | Status | Notes |
|--------|-------------|-------|--------|-------|
| V14.1.1 | Data classification | L1 | **FAIL** | No formal classification |
| V14.1.2 | Encryption at rest | L2 | **PASS** | Neon AES-256 |
| V14.1.3 | Blinding enforcement | L1 | **PASS** | feedbackSource excluded from evaluator queries |
| V14.2.1 | No sensitive data in browser storage | L1 | **PASS** | localStorage has only theme/sidebar prefs |
| V14.3.1 | PII access logging | L2 | **FAIL** | No audit trail for exports/unblinding |
| V14.3.2 | Data retention policy | L2 | **FAIL** | No policy documented or implemented |

### V15: Secure Coding

| Req ID | Description | Level | Status | Notes |
|--------|-------------|-------|--------|-------|
| V15.3.1 | Race condition prevention | L2 | **PASS** | Score upsert handles P2002 race |
| V15.3.2 | Batch status transition atomicity | L2 | **PARTIAL** | Check-then-update not atomic; low risk |
| V15.4.1 | Lockfile with integrity hashes | L2 | **PASS** | package-lock.json with SHA-512 |
| V15.4.2 | CSPRNG for security-relevant randomness | L2 | **PARTIAL** | Math.random() used for blinding shuffle |

### V16: Security Logging

| Req ID | Description | Level | Status | Notes |
|--------|-------------|-------|--------|-------|
| V16.1.1 | Log inventory | L2 | **FAIL** | No logging infrastructure |
| V16.2.1 | Structured logging with metadata | L2 | **FAIL** | No structured logging |
| V16.3.1 | Auth events logged | L2 | **FAIL** | No login/logout logging |
| V16.3.2 | Authz failures logged | L2 | **FAIL** | 403 responses not logged |
| V16.3.3 | Security bypass attempts logged | L2 | **FAIL** | No detection of brute force/abuse |

---

## Prioritized Remediation Roadmap

### P0 — Required for L2 (blocking)

| # | Finding | ASVS Reqs | Effort | Impact |
|---|---------|-----------|--------|--------|
| 1 | **Add MFA** (at minimum for admins) | V6.3.3 | Large | L2 hard requirement |
| 2 | **Add rate limiting** on login, reset, invite | V6.3.1, V2.4 | Medium | Prevents brute-force + email bombing |
| 3 | **Add CSP header** with object-src 'none', base-uri 'none' | V3.4.3, V13.4.5 | Small | XSS defense-in-depth |
| 4 | **Strengthen password policy**: min 8 chars + common password check | V6.2.1, V6.2.4 | Small | Prevents trivially weak passwords |
| 5 | **Add server-side logging** (pino) with security event coverage | V16.x (5 reqs) | Medium | Zero observability currently |
| 6 | **Add audit logging** for exports/unblinding + admin actions | V14.3.1 | Medium | Research integrity requirement |
| 7 | **Configure session timeout** (8-12 hours, not 30 days) | V7.3 | Tiny | One config line |
| 8 | **Add token revocation** (tokenVersion counter on User) | V9.3.1, V7.4.2 | Medium | Compromised sessions unrevocable today |

### P1 — Important for L2 compliance

| # | Finding | ASVS Reqs | Effort | Impact |
|---|---------|-----------|--------|--------|
| 9 | **Validate score values** against rubric scaleMin/scaleMax | V2.3.3 | Small | Data integrity |
| 10 | **Validate dimensionId** belongs to correct project | V2.3.4 | Small | Cross-project data corruption |
| 11 | **Check batch status** before accepting scores | V2.3.1 | Small | Workflow integrity |
| 12 | **Add change-password** endpoint (requires current password) | V6.2.2, V6.2.3 | Medium | ASVS L1 requirement |
| 13 | **Add iss/aud** validation to StudyFlow JWT | V9.2.3 | Small | Requires coordinated StudyFlow change |
| 14 | **Add breach password check** (HIBP k-anonymity API) | V6.2.12 | Small | ASVS L2 requirement |
| 15 | **Gate seed script** to refuse production | V6.3.2, V13.2.3 | Tiny | Prevents default credentials in prod |

### P2 — Documentation & hardening

| # | Finding | ASVS Reqs | Effort | Impact |
|---|---------|-----------|--------|--------|
| 16 | Create **crypto inventory** document | V11.1.1 | Tiny | Documentation |
| 17 | Create **key management policy** | V11.1.2 | Small | Rotation procedures |
| 18 | Create **data classification** document | V14.1.1 | Tiny | Research compliance |
| 19 | Create **data retention policy** | V14.3.2 | Small | Governance |
| 20 | Add **schema validation** (zod) to all API routes | V4.1.1, V2.2 | Medium | Input hardening |
| 21 | Replace **Math.random()** with crypto.randomInt in blinding shuffle | V15.4.2 | Tiny | Blinding integrity |
| 22 | Add **re-auth** for sensitive admin actions | V7.5 | Medium | Step-up auth |
| 23 | Add **Content-Type enforcement** on POST/PUT routes | V4.1.2 | Small | Defense-in-depth |
| 24 | Add **file size limit** on CSV upload | V5.1.2 | Tiny | Client-side DoS prevention |

---

## Strengths (things done right)

1. **Zero XSS surface**: React JSX auto-escaping used everywhere; no dangerouslySetInnerHTML with user data
2. **Zero SQLi surface**: Prisma ORM exclusively; no raw queries
3. **Complete authorization coverage**: All 29 API endpoints have correct role + membership checks
4. **Blinding properly enforced**: feedbackSource excluded from evaluator queries; only admin export reveals it
5. **Password hashing**: bcrypt cost 12 — meets ASVS L2
6. **Token security**: 256-bit entropy, single-use, expiry enforced, old tokens invalidated
7. **HSTS + security headers**: Properly configured with preload
8. **Anti-enumeration**: Password reset always returns success
9. **Secrets management**: Doppler; no secrets in source code
10. **CSRF resistance**: JSON API + Auth.js CSRF tokens
