# JWT Token Implementation Guide

## Overview
This document explains the centralized JWT token handling system implemented in the Diagnocare UI application. The system provides a clean separation between login/basic authentication endpoints and protected API endpoints that require JWT tokens.

## Architecture

### Components

#### 1. **TokenService** (`src/app/core/interceptors/token.service.ts`)
A centralized service for managing JWT tokens in session storage.

**Key Methods:**
- `setToken(token: string)` - Store JWT token in session storage
- `getToken()` - Retrieve JWT token from session storage
- `hasToken()` - Check if JWT token exists
- `removeToken()` - Remove JWT token
- `setUserId(userId: string)` - Store user ID in session storage
- `getUserId()` - Retrieve user ID
- `clearAuth()` - Clear all auth data (use on logout)
- `decodeToken(token?: string)` - Decode and return JWT payload
- `isTokenExpired()` - Check if token is expired
- `getTokenExpirationTime()` - Get remaining time until expiration

#### 2. **AuthInterceptor** (`src/app/core/interceptors/auth.interceptor.ts`)
HTTP interceptor that automatically handles authentication headers for all API requests.

**Behavior:**
- **For Login Endpoints** (specified in `basicAuthEndpoints`):
  - Uses basic authentication (username:password encoded in Base64)
  - Endpoints: getUserDetails, generateOTP, resetPassword, getUserIdByContact, verifyOtp, generateJWTToken

- **For All Other Endpoints**:
  - Automatically attaches JWT token from session storage in `Authorization: Bearer <token>` header
  - If no token is available, proceeds without the header (for public endpoints)

#### 3. **LoginService Updates** (`src/app/services/loginServices/login.service.ts`)
Enhanced to automatically store JWT tokens after successful authentication.

**Key Methods:**
- `validateOTP(req)` - Validates OTP and stores JWT token if returned
- `refreshToken(userId)` - Generates new JWT token and stores it
- `logout()` - Clears all auth data from session storage

---

## Implementation Details

### Token Storage
- **Location**: Browser's session storage
- **Keys**: 
  - `jwtToken` - Stores the JWT token
  - `userId` - Stores the user ID extracted from token
- **Scope**: Session only (cleared when browser tab closes)

### Request Flow

#### Login Request Flow
```
User Login
    ↓
LoginService.getUserDetails() [Basic Auth]
    ↓
Basic auth credentials added by AuthInterceptor
    ↓
API endpoint validates and generates JWT
    ↓
LoginService.validateOTP() [Basic Auth]
    ↓
Response includes JWT token
    ↓
TokenService stores token in session storage
```

#### Protected API Request Flow
```
Any API Call (e.g., PatientService.getPatientById())
    ↓
AuthInterceptor checks request URL
    ↓
URL is not a login endpoint
    ↓
TokenService.getToken() retrieves JWT from session
    ↓
AuthInterceptor adds "Authorization: Bearer <token>" header
    ↓
API endpoint validates token
    ↓
Request proceeds if token is valid
```

---

## Usage Examples

### 1. Making Protected API Calls
No changes needed! The interceptor automatically attaches the JWT token:

```typescript
// In PatientService or any other service
getPatientById(patientId: string): Observable<PatientEditDto> {
  const geturl = `${this.patienturl}${apiEndpoints.getById}?patientId=${encodeURIComponent(patientId)}`;
  
  // JWT token is automatically added by the interceptor
  return this.httpClient.get<PatientEditDto>(geturl).pipe(
    catchError(this.errorHandler)
  );
}
```

### 2. Checking if User is Logged In
```typescript
import { TokenService } from 'src/app/core/interceptors/token.service';

constructor(private tokenService: TokenService) {}

isUserLoggedIn(): boolean {
  return this.tokenService.hasToken() && !this.tokenService.isTokenExpired();
}
```

### 3. Getting Current User ID
```typescript
import { TokenService } from 'src/app/core/interceptors/token.service';

constructor(private tokenService: TokenService) {}

getCurrentUserId(): string | null {
  return this.tokenService.getUserId();
}
```

### 4. Logging Out
```typescript
import { LoginService } from 'src/app/services/loginServices/login.service';

constructor(private loginService: LoginService) {}

logout(): void {
  this.loginService.logout();
  // Redirect to login page
  this.router.navigate(['/login']);
}
```

### 5. Checking Token Expiration
```typescript
import { TokenService } from 'src/app/core/interceptors/token.service';

constructor(private tokenService: TokenService) {}

checkTokenStatus(): void {
  if (this.tokenService.isTokenExpired()) {
    console.log('Token has expired');
    // Redirect to login or refresh token
  } else {
    const remainingTime = this.tokenService.getTokenExpirationTime();
    console.log(`Token expires in ${remainingTime}ms`);
  }
}
```

### 6. Decoding Token to Get Custom Claims
```typescript
import { TokenService } from 'src/app/core/interceptors/token.service';

constructor(private tokenService: TokenService) {}

getTokenClaims(): any {
  const decoded = this.tokenService.decodeToken();
  return decoded;
}
```

---

## Configuration

### Adding New Login Endpoints
If you add new login endpoints that should use basic authentication instead of JWT, update the `basicAuthEndpoints` array in `AuthInterceptor`:

```typescript
const basicAuthEndpoints = [
  apiEndpoints.getUserDetails,
  apiEndpoints.generateOTP,
  apiEndpoints.resetPassword,
  apiEndpoints.getUserIdByContact,
  apiEndpoints.verifyOtp,
  apiEndpoints.generateJWTToken,
  // Add new login endpoints here
  apiEndpoints.newLoginEndpoint
];
```

### Changing Token Storage
To use localStorage instead of sessionStorage, update `TokenService`:

```typescript
// Change from sessionStorage to localStorage
setToken(token: string): void {
  localStorage.setItem(this.TOKEN_KEY, token);
}

getToken(): string | null {
  return localStorage.getItem(this.TOKEN_KEY);
}

// And similarly for other methods
```

---

## Security Considerations

1. **HTTPS Only**: Ensure your application is served over HTTPS in production
2. **Secure Flag**: Consider using secure cookies instead of session storage if the backend supports it
3. **Token Expiration**: Implement token refresh logic before expiration
4. **CORS**: Ensure CORS is properly configured on the backend
5. **XSS Protection**: Session storage is vulnerable to XSS attacks; use Content Security Policy (CSP)

---

## Troubleshooting

### JWT Token Not Being Attached
- **Check**: Ensure the endpoint URL doesn't match any item in `basicAuthEndpoints`
- **Check**: Verify token exists in session storage using browser DevTools
- **Check**: Ensure LoginService is calling TokenService.setToken() after successful authentication

### Basic Auth Not Working
- **Check**: Endpoint URL must match one in `basicAuthEndpoints` array
- **Check**: Ensure AuthConfigService is properly configured with valid credentials endpoint

### Token Expiration Issues
- Implement token refresh logic before the token expires
- Use `getTokenExpirationTime()` to monitor token lifetime
- Automatically redirect to login when token expires

---

## Related Files
- [AuthInterceptor](../core/interceptors/auth.interceptor.ts)
- [TokenService](../core/interceptors/token.service.ts)
- [LoginService](../services/loginServices/login.service.ts)
- [AuthConfigService](../services/auth-config.service.ts)
