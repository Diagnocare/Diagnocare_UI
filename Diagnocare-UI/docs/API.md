# API Contract — Diagnocare Login UI (summary)

This file summarizes the expected backend API endpoints and the request/response shapes based on models in `src/app/models/`.

Note: These are inferred from front-end models; confirm exact URLs and fields with backend API documentation or by inspecting `constants.ts` for base URLs.

Base URL
- Check `src/app/constant/constants.ts` for the `API_BASE_URL` or similar constant used by services.

Endpoints (inferred)

1) Request OTP
- Method: POST
- Path: /auth/request-otp (example; actual path may vary)
- Request body (inferred from `requestOTP.ts`):
  - phone: string
  - countryCode?: string
  - email?: string

- Response (inferred from `response.ts`):
  - success: boolean
  - message: string
  - data?: { referenceId?: string }

2) Verify OTP / Login
- Method: POST
- Path: /auth/verify-otp or /auth/login
- Request body (inferred from `loginModel.ts`):
  - phone/email
  - otp
  - deviceId?: string

- Response (inferred from `response.ts` + `jwtPayload.ts`):
  - success: boolean
  - message: string
  - data: {
      token: string,
      refreshToken?: string,
      payload?: { userId, roles, exp, iat, ... } // matches jwtPayload
    }

3) Token refresh (optional)
- Method: POST
- Path: /auth/refresh
- Request body: { refreshToken: string }
- Response: new access token + optional refresh token.

Headers
- Authorization: Bearer <token> (added by `auth.interceptor.ts` once logged in)
- Content-Type: application/json

Error handling
- The `error.interceptor.ts` centralizes mapping HTTP errors to user-friendly messages and handles redirects for 401/403.

How to confirm exact endpoints
- Open `src/app/services/loginservices/login.service.ts` and `src/app/constant/constants.ts` to see the actual endpoint paths and parameter names. The front-end models and file names provide a strong hint but confirm values in code.

Example cURL (adjust base URL and paths per `constants.ts`):

```bash
curl -X POST "http://localhost:3000/auth/request-otp" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+911234567890"}'
```

Follow-up: If you want, I can update these examples to the exact paths by reading `login.service.ts` and `constants.ts` and put concrete examples here. (I inferred endpoints generically to be safe.)
