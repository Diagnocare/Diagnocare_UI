# PERF-009 — Serving the API through the SPA's own origin

**Issue:** `/api/Header/ping` — an endpoint whose body is literally `Ok()` — answers in
**0.16 s on a reused keep-alive connection and 1.9 – 2.0 s on a fresh one**. The ~1.8 s
difference is DNS + TCP + TLS to a second origin. The API host also negotiates
**HTTP/1.1 only**, so the browser is capped at 6 connections per origin, a burst of
authenticated calls serialises into waves, and every wave that needs a new socket pays
the handshake again.

Three things fix it. Only the first lives in this repository.

| # | Change | Where | Status |
|---|---|---|---|
| 1 | Route `/api/*` through the origin that serves the SPA | this repo (`vercel.json`, `nginx.conf`, IIS `web.config`) | config shipped; the per-environment switch is **opt-in**, see below |
| 2 | Enable HTTP/2 on the API host | API host / IIS | **not doable from here** |
| 3 | Move off idle-shutdown shared hosting | API host | **not doable from here** |

Same-origin is worth more than it sounds: it reuses the connection the browser is
*already holding* for the SPA's own documents and bundles, so API calls cost one round
trip instead of a handshake; it removes the CORS preflight on every call (PERF-007); and
it lets the edge cache GETs.

---

## 1. Make the host proxy `/api`

### Vercel — shipped (`vercel.json`)

`vercel.json` rewrites `/api/:path*` to `https://diagnocare-prod.runasp.net/api/:path*`.
Vercel applies rewrites only after a filesystem miss, so bundles and assets are
untouched, and the framework's SPA fallback for client-side routes still applies.

> **The destination is the production API.** `vercel.json` is one file per repository, so
> a second Vercel project built from the same branch (e.g. a UAT preview) inherits this
> rewrite and would proxy to **production**. Leave non-production environments on their
> absolute API URL unless that project gets its own rewrite destination.

The same file also carries the cache rules `nginx.conf` says it mirrors: a year of
`immutable` for content-hashed build output, 7 days for the un-hashed files copied from
`src/assets/`, and `no-store` for `index.html` and `assets/runtime-config.js`.

### Docker / nginx — already same-origin

`nginx.conf` proxies `/api/` (and `/hubs/`) to the API container, and
`docker-entrypoint.sh` defaults `API_BASE_URL` to `/`. Nothing to do.

### IIS — needs two modules installed first

The UAT/production SSH pipelines copy the build to `C:\inetpub\wwwroot\Diagnocare*UI`.
IIS can reverse-proxy, but only with **URL Rewrite 2.1** *and* **Application Request
Routing 3.0** installed, and ARR's proxy enabled
(*IIS Manager → server node → Application Request Routing Cache → Server Proxy Settings
→ Enable proxy*).

This is **not** in `src/web.config` on purpose: a `<rewrite>` section in a site whose
server lacks URL Rewrite fails the whole site with **HTTP 500.19**, so it must not ship
to a host that has not been prepared. Once both modules are installed, add inside
`<system.webServer>`:

```xml
<rewrite>
  <rules>
    <rule name="Proxy API" stopProcessing="true">
      <match url="^api/(.*)" />
      <action type="Rewrite" url="https://diagnocare-prod.runasp.net/api/{R:1}" />
      <serverVariables>
        <set name="HTTP_X_FORWARDED_PROTO" value="https" />
      </serverVariables>
    </rule>
  </rules>
</rewrite>
```

`<serverVariables>` also has to be allow-listed once per server
(*IIS Manager → URL Rewrite → View Server Variables → Add `HTTP_X_FORWARDED_PROTO`*),
or the rule returns HTTP 500.50.

## 2. Point the SPA at the relative path

Nothing changes until the app stops using the absolute URL. The base URL has one source,
`getDiagnocareApiUrl()` in `src/app/shared/api-base-url.util.ts`, and every path it is
concatenated with already starts with `api/` (`controllerEndpoints` in
`src/app/constant/constants.ts`), so a base of `/` produces `/api/...` — same origin,
proxied.

Per environment, after the host above actually proxies `/api`:

```ts
// src/environments/environment.production.ts
diagnocareApiURL: '/',
```

Deployments that inject runtime config (the Docker image) can do it without a rebuild,
because `window.RUNTIME_CONFIG` wins over the baked value:

```sh
docker run -e API_BASE_URL=/ ...
```

**Deploy the rewrite before the flip, not after.** A build with `'/'` served by a host
that does not proxy `/api` 404s every call, and on Vercel a build with `'/'` on a project
whose rewrite points at the wrong API talks to the wrong database. Rolling back is a
one-line revert to the absolute URL (or an `API_BASE_URL` change plus a container
restart — `runtime-config.js` is served `no-store`).

While an environment is still cross-origin, `preconnectToApiOrigin()` in `src/main.ts`
starts the handshake during bootstrap instead of in front of the first XHR. It reads the
same base URL and stops doing anything once that URL is relative.

## 3. Verify

```sh
# Proxied through the SPA origin? (expect 200, and no Access-Control-* in the response)
curl -sS -o /dev/null -D - https://<ui-host>/api/Header/ping

# Did the preflight disappear? (expect no OPTIONS before the GET in the browser's
# network panel; cross-origin shows one per endpoint)

# HTTP/2 on the API host — item 2 above, still 1.1 today
curl -sS -o /dev/null -w '%{http_version}\n' https://diagnocare-prod.runasp.net/api/Header/ping

# Handshake vs. server time: first request pays TLS, the rest reuse the socket
curl -sS -o /dev/null -w 'connect=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer}\n' \
  https://<ui-host>/api/Header/ping
```

## 4. What the API side still owes

- **HTTP/2** on the API host. Removes the 6-connection cap and the per-connection
  handshake for parallel calls; on IIS it is a binding/host setting, not application code.
- **A host without idle shutdown.** The measurements include a 10.1 – 11.1 s first
  request after idle and a 6.47 s stall on an already-warm connection, both from shared
  hosting contention. No amount of application tuning substitutes for a dedicated app pool.
- **`X-Forwarded-*` handling.** Behind a proxy the API sees the proxy's address and
  scheme unless `UseForwardedHeaders` is configured, which matters for anything that logs
  or rate-limits by client IP or builds absolute URLs.
- **CORS** can be narrowed once an environment is fully same-origin — but keep the policy
  in place while any environment still calls the API across origins.
