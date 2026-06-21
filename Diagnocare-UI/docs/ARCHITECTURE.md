# Architecture & Component Overview — Diagnocare Login UI

This document describes how the main pieces of the login UI are organized and how they interact.

High-level structure

- Angular application (root module `AppModule`) bootstraps the login component and registers interceptors.
- Services provide API access and encapsulate HTTP calls.
- Interceptors handle token attachment and global error handling.

Key components and flow

1) Login component (`src/app/component/login/login.component.ts`)
   - Responsible for UI and orchestration of login flows.
   - Calls `LoginService` methods to request OTP and verify credentials.
   - On success, stores the token (via a token storage service or localStorage) and navigates to the protected area.

2) LoginService (`src/app/services/loginservices/login.service.ts`)
   - Implements methods such as `requestOtp(payload)`, `verifyOtp(payload)`, and possibly `login(credentials)`.
   - Uses `HttpClient` (possibly via `api-service.service.ts`) to call backend endpoints.

3) ApiService (`src/app/api-service.service.ts`)
   - A wrapper around `HttpClient` with convenience methods for GET/POST/PUT/DELETE, and centralized logging or error handling helpers.

4) Auth Interceptor (`src/app/core/interceptors/auth.interceptor.ts`)
   - Reads token from storage and adds `Authorization: Bearer <token>` to outgoing requests.
   - Optionally handles token refresh if the backend supports it.

5) Error Interceptor (`src/app/core/interceptors/error.interceptor.ts`)
   - Handles HTTP errors and maps them to actions: show toast, redirect to login on 401, rethrow for component-level handling.

Data models

- `jwtPayload.ts` — describes the content of the JWT payload such as `userId`, `roles`, `exp`.
- `loginModel.ts` — payload for login or OTP verification.
- `requestOTP.ts` — payload for requesting an OTP from the backend.
- `response.ts` — generic envelope for responses, includes `success`, `message`, and `data` fields.

Where to extend

- Add a `TokenService` for a single place to read/write tokens and refresh them.
- Add route guards (e.g., `AuthGuard`) that use `TokenService` to protect routes.
- Add `environments/` with `environment.ts` and `environment.prod.ts` to manage base URLs.

Diagrams (text)

Login UI -> LoginService -> ApiService -> HTTP -> Backend
                           ^
                           |
                    Auth Interceptor (adds token)

Error Interceptor -> handles HTTP errors globally

Notes

- The project follows a standard Angular service/interceptor/component pattern.
- Keep models in sync with backend contracts in `src/app/models/`.

Files changed/created
- `docs/ARCHITECTURE.md` — this file

Next steps
- Generate a small sequence diagram or add visuals to `docs/`.
- Add `CONTRIBUTING.md` and `environment.example.ts` for new developers.
