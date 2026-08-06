# Feedback Portal — Launch Contract

How the Diagnocare UI hands context to the feedback portal
(`https://feedback-system-rosy.vercel.app/`) when a user opens **Help → Submit
Feedback** or **Help → Track My Issues**.

The portal rejects a bare visit with:

> No user/product context found. Open this form from within your app

…so the app must pass identifying context on the launch URL.

Identity travels in a **signed token**, not in plain query parameters, so the
portal can verify who the caller is instead of trusting values anyone could edit
in the address bar.

---

## 1. What the app sends

Built in `src/app/component/help/help.component.ts` → `buildHelpUrl()`.

```
{helpUrl}?view=…&product=…&env=…#token=…
```

### Query string — routing only, not sensitive

| Param     | Source                | Always sent? | Example         |
|-----------|-----------------------|--------------|-----------------|
| `view`    | which button was used | Yes          | `new` / `track` |
| `product` | `environment.appName` | Yes          | `Diagnocare`    |
| `env`     | `environment.envName` | Yes          | `qa`            |

`view` selects the screen: `new` = submit form, `track` = the user's case list.
`env` is one of `local`, `dev`, `qa`, `uat`, `prod`, driven by which
`environment.*.ts` Angular swaps in at build time.

### Fragment — the signed token

`#token=<jwt>` carries the identity claims. **A fragment, not a query param**:
fragments are never sent to the server, so the token stays out of the portal's
access logs and out of any `Referer` header the portal emits onward.

Read it with:

```js
const token = new URLSearchParams(location.hash.slice(1)).get('token');
```

The token is absent when the visitor is signed out (`/help` is a public route),
when the lab isn't registered yet, or if the token call failed. The portal must
handle that — see §3.

**Example — submit, signed in:**

```
https://feedback-system-rosy.vercel.app/?view=new&product=Diagnocare&env=qa#token=eyJhbGciOiJIUzI1NiIs…
```

**Example — signed out:**

```
https://feedback-system-rosy.vercel.app/?view=new&product=Diagnocare&env=qa
```

---

## 2. The token

Issued by `GET api/Feedback/Token` (requires a valid Diagnocare session), minted
by `FeedbackTokenProvider`. **It is not the session JWT** — different signing
key, different audience, minutes-long lifetime — so a leaked feedback token
cannot be replayed against the Diagnocare API.

### Claims

| Claim     | Meaning                                    | Example         |
|-----------|--------------------------------------------|-----------------|
| `sub`     | user name                                  | `rsharma`       |
| `uid`     | numeric user ID                            | `1042`          |
| `email`   | user's email (omitted if the claim is absent) | `r@lab.com`  |
| `role`    | role name                                  | `Admin`         |
| `pathId`  | pathology (tenant) ID                      | `Path1000`      |
| `product` | product name                               | `Diagnocare`    |
| `iss`     | issuer, `Secrets:JwtIssuer`                | `DiagnocareAPI` |
| `aud`     | `feedback-portal`                          |                 |
| `exp`     | expiry — 5 minutes by default              |                 |
| `jti`     | unique token ID, for replay detection      |                 |

### Verification (HS256 shared secret)

The portal verifies the signature itself with a shared secret. This was chosen
over a callback-to-API design because lab deployments are not all reachable from
Vercel — dev runs on an internal host, and on-prem installs have no public
endpoint — so a verify endpoint would work in UAT and fail everywhere else.

Set-up:

1. API side: `Secrets:FeedbackTokenSecret` in the relevant `appsettings.*.json`.
   Must be ≥32 bytes and **must differ from `Secrets:JwtSecret`** — the provider
   throws at issue time if the two match, since an identical key would make a
   leaked feedback token equivalent to a session token.
2. Portal side: the same value as an environment variable (never committed).
3. Verify signature, `aud === 'feedback-portal'`, `iss`, and `exp` on every
   request. Reject anything that fails — do not fall back to reading claims from
   an unverified payload.

```js
import jwt from 'jsonwebtoken';

const claims = jwt.verify(token, process.env.DIAGNOCARE_FEEDBACK_SECRET, {
  audience: 'feedback-portal',
  algorithms: ['HS256'],
});
// claims.uid, claims.sub, claims.email, claims.role, claims.pathId, claims.product
```

Rotation: change the value in both places. Tokens live ~5 minutes, so a rotation
window of a few minutes is enough to avoid rejecting in-flight launches.

**Upgrade path.** A shared secret means anyone holding it can *forge* tokens for
any user or lab. That's acceptable while both sides are yours. If the portal ever
serves labs you don't control, move to RS256 — the API signs with a private key,
the portal verifies with the public key, and no signing capability leaves the API.

---

## 3. What the portal should do

```js
const q     = new URLSearchParams(location.search);
const view  = q.get('view') ?? 'new';
const token = new URLSearchParams(location.hash.slice(1)).get('token');

if (!q.get('product')) {
  showError('No user/product context found. Open this form from within your app');
  return;
}

const claims = token ? verify(token) : null;   // null on absent/invalid token

if (view === 'track') {
  claims ? renderIssueList(claims)   // scope: uid + pathId + product
         : renderTrackingIdLookup(); // anonymous fallback
} else {
  renderForm(claims);                // prefill when known, else anonymous report
}
```

Clear the fragment once read (`history.replaceState`) so the token doesn't linger
in the address bar or get copy-pasted into a chat.

### `view=track` — the case list

Scope the list to `uid` + `pathId` + `product` from the **verified** claims.

Suggested columns: tracking ID, title, submitted date, last update, status.

**Open / Closed filtering belongs to the portal.** The app deliberately sends no
`status` param — it only says who is asking. The portal renders the list and
provides its own Open / Closed / All control. Suggested grouping:

| Bucket | Internal states                        |
|--------|----------------------------------------|
| Open   | New, Acknowledged, In Progress         |
| Closed | Resolved, Closed, Rejected / Won't Fix |
| All    | no filter                              |

Defaulting to **Open** on arrival is the sensible starting state.

An Admin / Super Admin (`role`) may reasonably see every issue for their
`pathId` — but enforce that from the verified `role` claim, never from a URL
value.

### No token

`/help` is a public route (no auth guard, see `app-routing.module.ts`), so a
logged-out visitor can reach it and will arrive with `product` + `env` only.
Treat that as valid "opened from the app" context: accept an anonymous report on
`view=new`, and fall back to tracking-ID lookup on `view=track`.

---

## 4. Where things live

| Concern                          | File                                                        |
|----------------------------------|-------------------------------------------------------------|
| Launch URL construction          | `src/app/component/help/help.component.ts` → `buildHelpUrl()` |
| Token fetch                      | `src/app/services/feedbackServices/feedback.service.ts`     |
| Token minting                    | `Diagnocare_API/Helpers/FeedbackTokenProvider.cs`           |
| Endpoint                         | `Diagnocare_API/Controllers/FeedbackController.cs`          |
| Portal URL per environment       | `helpUrl` in `src/environments/environment*.ts`             |

Portal URL per build config — Angular substitutes these via the
`fileReplacements` entries in `angular.json`:

| Build config  | File                              |
|---------------|-----------------------------------|
| (fallback)    | `src/environments/environment.ts` |
| `development` | `environment.development.ts`      |
| `qa`          | `environment.qa.ts`               |
| `uat`         | `environment.uat.ts`              |
| `production`  | `environment.production.ts`       |

Signing secret per environment: `Secrets:FeedbackTokenSecret` in
`appsettings.json` (local default), `appsettings.Development.json`,
`appsettings.QA.json`, `appsettings.Uat.json`, `appsettings.Production.json`.
QA / UAT / Production ship **empty** — inject the real value from the deployment
pipeline rather than committing it.
