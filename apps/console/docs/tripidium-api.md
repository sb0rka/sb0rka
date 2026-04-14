# Frontend integration: Tripidium auth (React + TypeScript)

This document is written for an agent (or developer) implementing authentication in a **React TypeScript** SPA against the **Tripidium HTTP API** in this repository.

Canonical server-side details live in [`docs/definitions/AUTH.md`](docs/definitions/AUTH.md).

---

## 1. Auth model (what to implement)

| Piece | Role | Browser handling |
|--------|------|------------------|
| **Access token** | Short-lived **JWT** (EdDSA / Ed25519). Sent as `Authorization: Bearer <jwt>`. | Store in **memory** only (React state, ref, or a small auth module). Do **not** put it in `localStorage` unless you accept the XSS tradeoff. |
| **Refresh token** | Opaque, **rotated** on every refresh. | Delivered only via **`Set-Cookie`** (`HttpOnly` in production). **Not** returned in JSON. JavaScript cannot read it; the browser sends it automatically when `credentials` are included. |

**Implication:** Login and refresh responses return JSON `{ "access_token": "..." }` **and** set the refresh cookie. Protected routes need the Bearer header; refresh routes need the cookie.

---

## 2. API base URL

Configure a single base URL (examples):

- Vite: `VITE_API_BASE_URL`
- CRA: `REACT_APP_API_BASE_URL`

Default local server from sample config: `http://localhost:8020` (see [`.env.sample`](.env.sample); port may differ).

All paths below are relative to that origin (e.g. `${import.meta.env.VITE_API_BASE_URL}/auth/login`).

---

## 3. Request bodies: `application/x-www-form-urlencoded`

Signup, login, profile patch, and password change use Go `ParseForm()` — they expect **HTML form** encoding, **not** JSON.

- Set header: `Content-Type: application/x-www-form-urlencoded`.
- Body: `URLSearchParams` (or equivalent) serialized string, e.g. `username=...&email=...&password=...`.

JSON bodies for these endpoints will **not** populate form fields.

---

## 4. Cookies and CORS (cross-origin SPAs)

- For **login**, **refresh**, and **logout**, use `fetch(..., { credentials: 'include' })` so the browser stores and sends the refresh cookie.
- Server CORS is controlled by **`SERVER_CORS_WHITELIST`** (comma-separated origins, or `*`). See [`internal/server/middlewares.go`](internal/server/middlewares.go):
  - If the whitelist is **not** `*`, the server echoes the request `Origin` when allowed and sets `Access-Control-Allow-Credentials: true`, and allows `Authorization` in preflight.
  - Wildcard `*` **cannot** be used with credentialed requests per browser rules; for cookie-based auth across origins, **list explicit origins** on the server.
- Cookie attributes (`REFRESH_TOKEN_COOKIE_*` in env) must match deployment: **`Secure`**, **`SameSite`** (often `None` + `Secure` for cross-site API + SPA), and **`Domain`/`Path`** must match how the browser will send the cookie to the API host.

Align the SPA’s deployed origin with `SERVER_CORS_WHITELIST` and cookie domain policy.

---

## 5. Endpoints reference

### Public

| Method | Path | Body (form fields) | Response |
|--------|------|--------------------|----------|
| `POST` | `/auth/signup` | `username`, `email`, `password` required; `phone` optional | **200** JSON user object (see §6) |
| `POST` | `/auth/login` | `username` **or** `email`, plus `password` | **200** JSON `{ "access_token": string }` + **Set-Cookie** refresh |
| `POST` | `/auth/refresh` | (none; refresh token from cookie) | **200** JSON `{ "access_token": string }` + **Set-Cookie** new refresh |

### Bearer required (`Authorization: Bearer <access_token>`)

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/auth/logout` | — | **204** + clears refresh cookie |
| `GET` | `/auth/sessions` | — | **200** JSON array of session objects (see §6) |
| `GET` | `/user` | — | **200** JSON user |
| `PATCH` | `/user` | at least one of: `username`, `email`, `phone` | **200** JSON user |
| `PUT` | `/user/password` | `current_password`, `new_password` | **204** |

### Not implemented (do not rely on)

| Method | Path | Notes |
|--------|------|--------|
| `DELETE` | `/auth/sessions` | Returns **501** |
| `DELETE` | `/auth/sessions/{session_id}` | Returns **501** |

---

## 6. JSON shapes

**User** (`GET /user`, `PATCH /user`, `POST /auth/signup`):

```json
{
  "id": "<uuid string>",
  "username": "string",
  "email": "string",
  "phone": 1234567890,
  "created_at": "RFC3339",
  "updated_at": "RFC3339"
}
```

`phone` may be omitted when empty.

**Login / refresh:**

```json
{ "access_token": "string" }
```

**Session list** (`GET /auth/sessions`): array of:

```json
{
  "id": "<uuid>",
  "is_current": true,
  "created_at": "RFC3339",
  "expires_at": "RFC3339",
  "user_agent": "string",
  "ip": "string"
}
```

---

## 7. HTTP errors

Many handlers use `http.Error`, so failed requests often return **plain text** bodies (not JSON), with typical status codes:

- **400** — validation / bad input (message in body)
- **401** — missing/invalid Bearer, invalid/expired refresh, inactive user (wording varies)
- **403** — rare; some flows use **401** instead
- **404** — e.g. user not found on login
- **409** — e.g. duplicate username/email on patch
- **501** — revoke-all / revoke-one session (not implemented)

The client should branch on **status** and optionally show `response.text()`.

---

## 8. JWT claims (for debugging only)

Do **not** trust the client to enforce security; the API validates every request. For UX (e.g. showing expiry), you may decode the JWT payload **without verification** only for display, or parse `exp` after verifying server-side is the source of truth.

Documented claims: `sub` (user id), `sid` (session id), `iss`, `aud`, `typ`, `jti`, `exp`, `iat`. Defaults: issuer `auth.tripidium`, audience `api.tripidium`, `typ` `access+jwt` (see [`docs/definitions/AUTH.md`](docs/definitions/AUTH.md)).

---

## 9. Recommended React integration steps

1. **Env:** `VITE_API_BASE_URL` (or project equivalent), no secrets in the bundle.
2. **API helper:** thin wrapper around `fetch` that:
   - sets `credentials: 'include'` for `/auth/login`, `/auth/refresh`, `/auth/logout`;
   - sets `Authorization: Bearer <token>` when an access token exists for protected routes;
   - uses `Content-Type: application/x-www-form-urlencoded` for form endpoints.
3. **Access token:** keep in memory; on full page reload, token is gone — call **`POST /auth/refresh`** with `credentials: 'include'` to obtain a new `access_token` if the refresh cookie is still valid.
4. **401 handling:** on a protected call, if **401**, optionally try **one** refresh, then retry the original request once; if refresh fails, clear in-memory token and redirect to login.
5. **Logout:** `POST /auth/logout` with Bearer + `credentials: 'include'`, then clear memory token and auth UI state.
6. **Routing:** protect routes by presence of a valid access token (and optionally refresh bootstrap on load).
7. **Signup → login:** after successful signup, either log the user in with a second `POST /auth/login` or navigate to login screen.

---

## 10. Security checklist for the agent

- [ ] Never log access tokens or refresh cookies.
- [ ] Use HTTPS in production; set cookie `Secure` / `SameSite` appropriately.
- [ ] Restrict CORS to known SPA origins when using cookies.
- [ ] Treat access token TTL as short; rely on refresh for session continuity.
- [ ] After logout, discard access token client-side; expect it may still be valid until `exp` (acceptable with short TTL).

---

## 11. Related files in this repo

| Topic | Location |
|--------|----------|
| Auth behavior | [`docs/definitions/AUTH.md`](docs/definitions/AUTH.md) |
| Endpoint list | [`docs/definitions/ENDPOINTS.md`](docs/definitions/ENDPOINTS.md) |
| Handlers | [`internal/server/handlers.go`](internal/server/handlers.go) |
| Responses DTOs | [`internal/server/responses.go`](internal/server/responses.go) |
| CORS + auth middleware | [`internal/server/middlewares.go`](internal/server/middlewares.go) |
| Cookie / JWT env | [`.env.sample`](.env.sample), [`internal/config/config.go`](internal/config/config.go) |
