# Diagnocare Login UI — Documentation

This document provides a developer-focused overview of the Diagnocare Login UI front-end located in `src/`.

Contents
- Project summary
- How to run the app (PowerShell)
- Component & service summary
- Models and payloads (summary)
- Interceptors and cross-cutting behavior
- Common workflows (OTP request, login)
- Testing and tips

Project summary
The Login UI is an Angular-based single-page application focused on authentication flows for Diagnocare. It provides a login component which communicates with backend endpoints via services. The project includes typed models for requests and responses and HTTP interceptors to manage authentication tokens and errors.

How to run (PowerShell)

Open PowerShell in the project root (`Login UI`) and run:

```powershell
npm install
npm start
# or
npx ng serve --open
```

The app typically serves at http://localhost:4200.

Component & service summary

- `src/app/component/login/login.component.ts`
  - Presents the login UI and handles user interactions (request OTP, submit OTP, or traditional login flow depending on implementation).
  - Uses `LoginService` to call backend APIs.

- `src/app/services/loginservices/login.service.ts`
  - Encapsulates login-related HTTP calls (request OTP, verify OTP, get tokens, etc.).
  - Returns typed observables using models in `src/app/models/login/`.

- `src/app/api-service.service.ts`
  - Generic API service used across the app for HTTP operations (wrapping Angular `HttpClient`), if present.

Models and payloads (summary)

Located in `src/app/models/` and `src/app/models/login/`:

- `loginModel.ts` — likely contains the login request DTO (phone/email, password or OTP fields).
- `requestOTP.ts` — request payload for requesting an OTP.
- `response.ts` — generic/specific response model for login endpoints.
- `jwtPayload.ts` — typed representation of the JWT payload the backend returns.
- `auditableDetails.ts` — audit metadata for responses or models.

Interceptors and cross-cutting behavior

- `src/app/core/interceptors/auth.interceptor.ts`
  - Attaches the Authorization header (Bearer token) to outgoing requests when a token exists.
  - Handles token refresh behavior if implemented.

- `src/app/core/interceptors/error.interceptor.ts`
  - Captures HTTP errors, logs or transforms them into user-friendly messages, and may redirect to login on 401/403.

Common workflows

- Request OTP
  - From `login.component`, user submits phone/email.
  - `LoginService.requestOtp()` calls the backend endpoint with `RequestOTP` model.
  - Backend responds with `response.ts` structure.

- Verify OTP / Login
  - User enters OTP.
  - `LoginService.verifyOtp()` or `LoginService.login()` calls backend, receives tokens and `jwtPayload`.
  - `auth.interceptor` attaches token to subsequent requests.

Testing

- Unit tests exist for services and interceptors (`*.spec.ts`). Use `npm test` to run tests via Angular's Karma/Jasmine configuration.

Notes and next steps

- Add `src/environments/environment.example.ts` for environment-specific base URLs and API keys.
- Add small code examples for API request/response pairs (done in `docs/API.md`).

Files created:
- `docs/DOCUMENTATION.md` — this file
- `docs/API.md` — API contract summary
- `docs/ARCHITECTURE.md` — architecture and component relationships
