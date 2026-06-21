# In-Memory OTP Implementation Guide

## Overview

This document provides comprehensive guidance for implementing a **zero-database OTP system** using encrypted in-memory storage. OTPs are generated, encrypted, stored temporarily in memory, and verified—with no database persistence.

---

## Architecture

### Components

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend (Angular)                                          │
│ ┌──────────────────────────────────────────────────────────┐
│ │ LoginComponent                                           │
│ │ - Calls OtpManagerService.generateOtp()                 │
│ │ - Calls OtpManagerService.verifyOtp()                   │
│ │ - Calls OtpManagerService.resendOtp()                   │
│ └──────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────┘
                           ↓↑ HTTP API
┌──────────────────────────────────────────────────────────────┐
│ Backend (C# / Node.js / Java)                                │
│ ┌──────────────────────────────────────────────────────────┐
│ │ OtpManagerService                                        │
│ │ - generateOtp()  → create + encrypt + store in cache     │
│ │ - verifyOtp()    → decrypt + compare + delete (single-use)
│ │ - resendOtp()    → re-generate + re-send                 │
│ └──────────────────────────────────────────────────────────┘
│                            ↓                                  │
│ ┌──────────────────────────────────────────────────────────┐
│ │ In-Memory Cache (Redis / MemoryCache)                    │
│ │ ┌──────────────────────────────────────────────────────┐ │
│ │ │ otp:{userId}  → {                                   │ │
│ │ │   encryptedCode: "...",                             │ │
│ │ │   channel: "email",                                 │ │
│ │ │   attempts: 0,                                      │ │
│ │ │   locked: false,                                    │ │
│ │ │   expiresAt: timestamp                              │ │
│ │ │ }                                                   │ │
│ │ └──────────────────────────────────────────────────────┘ │
│ └──────────────────────────────────────────────────────────┘
│                            ↓                                  │
│ ┌──────────────────────────────────────────────────────────┐
│ │ CommunicationService                                     │
│ │ - Sends plaintext OTP via Email/SMS                      │
│ │ - Never stores OTP in database                           │
│ └──────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Step 1: Generate OTP
```
User Credentials
       ↓
Backend validates credentials
       ↓
Generate 6-digit random OTP (e.g., 742856)
       ↓
Encrypt OTP with AES-256 encryption key
       ↓
Store encrypted OTP in in-memory cache with 10-minute TTL
       ↓
Send plaintext OTP to user via Email/SMS
       ↓
Return success response to frontend
```

#### Step 2: Verify OTP
```
User submits 6-digit code
       ↓
Backend retrieves encrypted OTP from cache
       ↓
Decrypt cached OTP
       ↓
Compare decrypted OTP with submitted code
       ↓
If match → Delete OTP (single-use), generate JWT token, return success
If no match → Increment attempt counter, lock after 3 attempts
```

---

## Security Features

| Feature | Implementation |
|---------|-----------------|
| **No DB Storage** | OTPs exist in memory only (Redis/cache) |
| **Encryption** | AES-256 encryption of stored OTP |
| **Randomness** | 6-digit random number (1,000,000 combinations) |
| **Expiration** | Auto-expire after 10 minutes |
| **Single-Use** | Delete OTP immediately after verification |
| **Rate Limiting** | Max 5 OTP generation requests per user per hour |
| **Attempt Limiting** | Max 3 wrong attempts, then 15-minute lockout |
| **Secure Keys** | Encryption keys in environment variables only |
| **No History** | No OTP history kept in database |

---

## Implementation: C# (.NET)

### 1. Install NuGet Packages

```bash
dotnet add package StackExchange.Redis
dotnet add package System.Security.Cryptography
```

### 2. Create OTP Cache Service

**File:** `Services/OtpCacheService.cs`

```csharp
using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using StackExchange.Redis;
using Newtonsoft.Json;

public class OtpCacheEntry
{
    public string EncryptedCode { get; set; }
    public string UserId { get; set; }
    public string Channel { get; set; }
    public long Timestamp { get; set; }
    public long ExpiresAt { get; set; }
    public int Attempts { get; set; }
    public bool Locked { get; set; }
    public long? LockedUntil { get; set; }
}

public class OtpCacheService
{
    private readonly IDatabase _cache;
    private const int OTP_EXPIRATION_MINUTES = 10;
    private const int OTP_ATTEMPTS_LIMIT = 3;
    private const int LOCKOUT_MINUTES = 15;
    private const int RATE_LIMIT_HOUR = 5;
    private readonly string _encryptionKey;

    public OtpCacheService(IConnectionMultiplexer redis, IConfiguration config)
    {
        _cache = redis.GetDatabase();
        _encryptionKey = config["Encryption:OtpKey"]
            ?? throw new InvalidOperationException("OTP encryption key not configured");
    }

    /// <summary>
    /// Generate a 6-digit random OTP (000000-999999)
    /// </summary>
    public string GenerateOtp()
    {
        using (var rng = new RNGCryptoServiceProvider())
        {
            byte[] randomBytes = new byte[4];
            rng.GetBytes(randomBytes);
            int randomInt = Math.Abs(BitConverter.ToInt32(randomBytes, 0));
            return (randomInt % 1000000).ToString("D6");
        }
    }

    /// <summary>
    /// Encrypt OTP using AES-256
    /// </summary>
    public string EncryptOtp(string plainOtp)
    {
        using (var aes = Aes.Create())
        {
            aes.Key = Convert.FromBase64String(_encryptionKey);
            aes.GenerateIV();

            using (var encryptor = aes.CreateEncryptor())
            using (var ms = new MemoryStream())
            {
                // Write IV at the beginning
                ms.Write(aes.IV, 0, aes.IV.Length);

                using (var cs = new CryptoStream(ms, encryptor, CryptoStreamMode.Write))
                using (var sw = new StreamWriter(cs))
                {
                    sw.Write(plainOtp);
                }

                return Convert.ToBase64String(ms.ToArray());
            }
        }
    }

    /// <summary>
    /// Decrypt OTP
    /// </summary>
    public string DecryptOtp(string encryptedOtp)
    {
        using (var aes = Aes.Create())
        {
            aes.Key = Convert.FromBase64String(_encryptionKey);

            var buffer = Convert.FromBase64String(encryptedOtp);
            aes.IV = buffer.Take(aes.IV.Length).ToArray();

            using (var decryptor = aes.CreateDecryptor())
            using (var ms = new MemoryStream(buffer, aes.IV.Length, buffer.Length - aes.IV.Length))
            using (var cs = new CryptoStream(ms, decryptor, CryptoStreamMode.Read))
            using (var sr = new StreamReader(cs))
            {
                return sr.ReadToEnd();
            }
        }
    }

    /// <summary>
    /// Store OTP in Redis cache with 10-minute TTL
    /// </summary>
    public async Task StoreOtpAsync(string userId, string plainOtp, string channel)
    {
        var encryptedOtp = EncryptOtp(plainOtp);
        var cacheKey = $"otp:{userId}";

        var entry = new OtpCacheEntry
        {
            EncryptedCode = encryptedOtp,
            UserId = userId,
            Channel = channel,
            Timestamp = DateTime.UtcNow.Ticks,
            ExpiresAt = DateTime.UtcNow.AddMinutes(OTP_EXPIRATION_MINUTES).Ticks,
            Attempts = 0,
            Locked = false
        };

        var json = JsonConvert.SerializeObject(entry);
        await _cache.StringSetAsync(
            cacheKey,
            json,
            TimeSpan.FromMinutes(OTP_EXPIRATION_MINUTES)
        );
    }

    /// <summary>
    /// Verify OTP against cached encrypted value
    /// </summary>
    public async Task<(bool valid, string message)> VerifyOtpAsync(string userId, string submittedCode)
    {
        var cacheKey = $"otp:{userId}";
        var cached = await _cache.StringGetAsync(cacheKey);

        if (cached.IsNull)
            return (false, "OTP expired or not found. Please request a new OTP.");

        var entry = JsonConvert.DeserializeObject<OtpCacheEntry>(cached.ToString());

        // Check if locked
        if (entry.Locked)
        {
            if (entry.LockedUntil > DateTime.UtcNow.Ticks)
                return (false, "Account temporarily locked due to multiple wrong attempts. Please try again after 15 minutes.");
            else
            {
                // Lockout expired, reset
                entry.Locked = false;
                entry.Attempts = 0;
            }
        }

        // Decrypt and verify
        try
        {
            var decrypted = DecryptOtp(entry.EncryptedCode);

            if (decrypted == submittedCode)
            {
                // OTP verified — delete from cache (single-use)
                await _cache.KeyDeleteAsync(cacheKey);
                return (true, "OTP verified successfully");
            }
        }
        catch (Exception ex)
        {
            return (false, $"OTP verification error: {ex.Message}");
        }

        // Wrong attempt
        entry.Attempts++;
        if (entry.Attempts >= OTP_ATTEMPTS_LIMIT)
        {
            entry.Locked = true;
            entry.LockedUntil = DateTime.UtcNow.AddMinutes(LOCKOUT_MINUTES).Ticks;
        }

        // Update cache
        var updatedJson = JsonConvert.SerializeObject(entry);
        await _cache.StringSetAsync(
            cacheKey,
            updatedJson,
            TimeSpan.FromMinutes(OTP_EXPIRATION_MINUTES)
        );

        return (false, $"Invalid OTP. Attempt {entry.Attempts}/{OTP_ATTEMPTS_LIMIT}. " +
                       (entry.Locked ? "Account locked for 15 minutes." : ""));
    }

    /// <summary>
    /// Check rate limit for OTP generation (max 5 per hour)
    /// </summary>
    public async Task<bool> CheckRateLimitAsync(string userId)
    {
        var limitKey = $"otp_limit:{userId}";
        var count = await _cache.StringGetAsync(limitKey);

        if (count.IsNull)
        {
            await _cache.StringSetAsync(limitKey, "1", TimeSpan.FromHours(1));
            return true;
        }

        int currentCount = int.Parse(count.ToString());
        if (currentCount >= RATE_LIMIT_HOUR)
            return false;

        await _cache.StringSetAsync(
            limitKey,
            (currentCount + 1).ToString(),
            TimeSpan.FromHours(1)
        );
        return true;
    }
}
```

### 3. Update Startup Configuration

**File:** `Program.cs` or `Startup.cs`

```csharp
// Add to dependency injection
var redis = ConnectionMultiplexer.Connect("localhost:6379");
services.AddSingleton<IConnectionMultiplexer>(redis);
services.AddScoped<OtpCacheService>();
```

### 4. Update LoginController

**File:** `Controllers/LoginController.cs`

```csharp
[ApiController]
[Route("api/[controller]")]
public class LoginController : ControllerBase
{
    private readonly OtpCacheService _otpService;
    private readonly ICommunicationService _communicationService;
    private readonly ITokenService _tokenService;
    private readonly IUserService _userService;

    public LoginController(
        OtpCacheService otpService,
        ICommunicationService communicationService,
        ITokenService tokenService,
        IUserService userService)
    {
        _otpService = otpService;
        _communicationService = communicationService;
        _tokenService = tokenService;
        _userService = userService;
    }

    /// <summary>
    /// Generate and send OTP to user via selected channel
    /// No database storage - OTP exists in Redis cache only
    /// </summary>
    [HttpPost("generate-otp-v2")]
    public async Task<IActionResult> GenerateOtpV2([FromBody] SendOtpRequest req)
    {
        try
        {
            // Validate user exists
            var user = await _userService.GetUserByIdAsync(req.UserId);
            if (user == null)
                return Ok(new { success = false, message = "User not found" });

            // Check rate limit
            if (!await _otpService.CheckRateLimitAsync(req.UserId))
                return Ok(new { success = false, message = "Too many OTP requests. Try again later." });

            // Generate 6-digit OTP
            var plainOtp = _otpService.GenerateOtp();

            // Store encrypted OTP in Redis (10-minute TTL, no DB)
            await _otpService.StoreOtpAsync(req.UserId, plainOtp, req.Channel);

            // Send OTP via email or SMS
            var email = req.Email ?? user.Email;
            var phone = req.ContactPhone ?? user.ContactPhone;

            await _communicationService.SendOtpAsync(
                userId: req.UserId,
                otpCode: plainOtp,
                channel: req.Channel,
                email: email,
                phoneNumber: phone
            );

            return Ok(new
            {
                success = true,
                message = "OTP sent successfully",
                expiresIn = 600 // 10 minutes in seconds
            });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, message = ex.Message });
        }
    }

    /// <summary>
    /// Verify OTP against in-memory encrypted value
    /// </summary>
    [HttpPost("verify-otp-v2")]
    public async Task<IActionResult> VerifyOtpV2([FromBody] VerifyOtpRequest req)
    {
        var (valid, message) = await _otpService.VerifyOtpAsync(req.UserId, req.Code);

        if (!valid)
            return Ok(new { success = false, message });

        // OTP verified - generate JWT token
        var token = _tokenService.GenerateToken(req.UserId);

        return Ok(new
        {
            success = true,
            message = "OTP verified successfully",
            token
        });
    }

    /// <summary>
    /// Resend OTP via same channel
    /// </summary>
    [HttpPost("resend-otp-v2")]
    public async Task<IActionResult> ResendOtpV2([FromBody] ResendOtpRequest req)
    {
        try
        {
            var user = await _userService.GetUserByIdAsync(req.UserId);
            if (user == null)
                return Ok(new { success = false, message = "User not found" });

            // Check rate limit
            if (!await _otpService.CheckRateLimitAsync(req.UserId))
                return Ok(new { success = false, message = "Too many OTP requests. Try again later." });

            // Generate new OTP (replaces old one)
            var plainOtp = _otpService.GenerateOtp();
            await _otpService.StoreOtpAsync(req.UserId, plainOtp, req.Channel);

            // Send via selected channel
            await _communicationService.SendOtpAsync(
                userId: req.UserId,
                otpCode: plainOtp,
                channel: req.Channel,
                email: req.Email ?? user.Email,
                phoneNumber: req.ContactPhone ?? user.ContactPhone
            );

            return Ok(new
            {
                success = true,
                message = "OTP resent successfully",
                expiresIn = 600
            });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, message = ex.Message });
        }
    }
}
```

---

## Implementation: Node.js (Express)

### 1. Install Dependencies

```bash
npm install redis crypto-js
```

### 2. Create OTP Manager Service

**File:** `services/otpManager.js`

```javascript
const crypto = require('crypto');
const CryptoJS = require('crypto-js');

class OtpManager {
  constructor(redisClient, encryptionKey) {
    this.redis = redisClient;
    this.encryptionKey = encryptionKey;
    this.OTP_EXPIRATION = 600; // 10 minutes in seconds
    this.ATTEMPT_LIMIT = 3;
    this.LOCKOUT_TIME = 900; // 15 minutes
    this.RATE_LIMIT_MAX = 5;
  }

  /**
   * Generate 6-digit random OTP
   */
  generateOtp() {
    return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  }

  /**
   * Encrypt OTP using AES-256
   */
  encryptOtp(plainOtp) {
    return CryptoJS.AES.encrypt(plainOtp, this.encryptionKey).toString();
  }

  /**
   * Decrypt OTP
   */
  decryptOtp(encryptedOtp) {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedOtp, this.encryptionKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch {
      return null;
    }
  }

  /**
   * Store OTP in Redis with 10-minute TTL
   */
  async storeOtp(userId, plainOtp, channel) {
    const encrypted = this.encryptOtp(plainOtp);
    const cacheEntry = {
      encryptedCode: encrypted,
      userId,
      channel,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.OTP_EXPIRATION * 1000,
      attempts: 0,
      locked: false,
    };

    const key = `otp:${userId}`;
    await this.redis.setex(
      key,
      this.OTP_EXPIRATION,
      JSON.stringify(cacheEntry)
    );
  }

  /**
   * Verify OTP against cached encrypted value
   */
  async verifyOtp(userId, submittedCode) {
    const key = `otp:${userId}`;
    const cached = await this.redis.get(key);

    if (!cached) {
      return {
        valid: false,
        message: 'OTP expired or not found. Please request a new OTP.'
      };
    }

    const entry = JSON.parse(cached);

    // Check if locked
    if (entry.locked) {
      if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
        return {
          valid: false,
          message: 'Account temporarily locked. Try again after 15 minutes.'
        };
      } else {
        // Lockout expired, reset
        entry.locked = false;
        entry.attempts = 0;
      }
    }

    // Decrypt and verify
    const decrypted = this.decryptOtp(entry.encryptedCode);

    if (decrypted === submittedCode) {
      // OTP verified - delete from cache (single-use)
      await this.redis.del(key);
      return { valid: true, message: 'OTP verified successfully' };
    }

    // Wrong attempt
    entry.attempts++;
    if (entry.attempts >= this.ATTEMPT_LIMIT) {
      entry.locked = true;
      entry.lockedUntil = Date.now() + this.LOCKOUT_TIME * 1000;
    }

    // Update cache
    await this.redis.setex(
      key,
      this.OTP_EXPIRATION,
      JSON.stringify(entry)
    );

    return {
      valid: false,
      message: `Invalid OTP. Attempt ${entry.attempts}/${this.ATTEMPT_LIMIT}.${
        entry.locked ? ' Account locked for 15 minutes.' : ''
      }`
    };
  }

  /**
   * Check rate limit for OTP generation
   */
  async checkRateLimit(userId) {
    const key = `otp_limit:${userId}`;
    const current = await this.redis.get(key);

    if (!current) {
      await this.redis.setex(key, 3600, '1'); // 1 hour
      return true;
    }

    const count = parseInt(current);
    if (count >= this.RATE_LIMIT_MAX) {
      return false;
    }

    await this.redis.setex(key, 3600, String(count + 1));
    return true;
  }
}

module.exports = OtpManager;
```

### 3. Update Login Routes

**File:** `routes/login.js`

```javascript
const express = require('express');
const router = express.Router();
const OtpManager = require('../services/otpManager');
const { generateToken } = require('../services/tokenService');
const { sendOtp } = require('../services/communicationService');

const otpManager = new OtpManager(
  redisClient,
  process.env.ENCRYPTION_KEY
);

/**
 * Generate and send OTP
 */
router.post('/generate-otp-v2', async (req, res) => {
  try {
    const { userId, channel, email, contactPhone } = req.body;

    // Check rate limit
    const canGenerate = await otpManager.checkRateLimit(userId);
    if (!canGenerate) {
      return res.json({
        success: false,
        message: 'Too many OTP requests. Try again later.'
      });
    }

    // Generate and store encrypted OTP (no DB)
    const plainOtp = otpManager.generateOtp();
    await otpManager.storeOtp(userId, plainOtp, channel);

    // Send via email or SMS
    await sendOtp(userId, plainOtp, channel, email, contactPhone);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      expiresIn: 600
    });
  } catch (error) {
    console.error('OTP generation error:', error);
    res.json({ success: false, message: error.message });
  }
});

/**
 * Verify OTP against cached value
 */
router.post('/verify-otp-v2', async (req, res) => {
  try {
    const { userId, code } = req.body;

    const result = await otpManager.verifyOtp(userId, code);

    if (!result.valid) {
      return res.json({
        success: false,
        message: result.message
      });
    }

    // OTP verified - generate JWT
    const token = generateToken(userId);

    res.json({
      success: true,
      message: 'OTP verified successfully',
      token
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.json({ success: false, message: error.message });
  }
});

/**
 * Resend OTP
 */
router.post('/resend-otp-v2', async (req, res) => {
  try {
    const { userId, channel, email, contactPhone } = req.body;

    const canGenerate = await otpManager.checkRateLimit(userId);
    if (!canGenerate) {
      return res.json({
        success: false,
        message: 'Too many OTP requests. Try again later.'
      });
    }

    const plainOtp = otpManager.generateOtp();
    await otpManager.storeOtp(userId, plainOtp, channel);

    await sendOtp(userId, plainOtp, channel, email, contactPhone);

    res.json({
      success: true,
      message: 'OTP resent successfully',
      expiresIn: 600
    });
  } catch (error) {
    console.error('OTP resend error:', error);
    res.json({ success: false, message: error.message });
  }
});

module.exports = router;
```

---

## Environment Configuration

### .NET (appsettings.json)

```json
{
  "Encryption": {
    "OtpKey": "YOUR_BASE64_ENCODED_32_BYTE_AES_KEY"
  },
  "ConnectionStrings": {
    "Redis": "localhost:6379"
  }
}
```

### Node.js (.env)

```env
ENCRYPTION_KEY=your_32_character_encryption_key
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### Generate AES-256 Key

**C#:**
```csharp
using (var aes = Aes.Create())
{
    aes.KeySize = 256;
    Console.WriteLine(Convert.ToBase64String(aes.Key));
}
```

**Node.js:**
```javascript
const crypto = require('crypto');
const key = crypto.randomBytes(32).toString('hex');
console.log(key);
```

---

## Frontend Integration

The frontend has been updated to use the new `OtpManagerService`:

```typescript
// In login.component.ts

// Generate OTP
this._otpManager.generateOtp({
  userId: userId,
  channel: 'email'
}).subscribe({
  next: () => { /* show OTP dialog */ },
  error: () => { /* show error */ }
});

// Verify OTP
this._otpManager.verifyOtp({
  userId: userId,
  code: submittedCode
}).subscribe({
  next: (resp) => {
    if (resp.token) {
      // Store token and navigate
      sessionStorage.setItem('authToken', resp.token);
    }
  },
  error: () => { /* show error */ }
});

// Resend OTP
this._otpManager.resendOtp(userId).subscribe({
  next: () => { /* show success */ },
  error: () => { /* show error */ }
});
```

---

## API Endpoints

### POST /api/login/generate-otp-v2

**Request:**
```json
{
  "userId": "john_doe",
  "channel": "email",
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresIn": 600
}
```

### POST /api/login/verify-otp-v2

**Request:**
```json
{
  "userId": "john_doe",
  "code": "742856"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "token": "eyJhbGc..."
}
```

### POST /api/login/resend-otp-v2

**Request:**
```json
{
  "userId": "john_doe"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP resent successfully",
  "expiresIn": 600
}
```

---

## Testing Checklist

- [ ] OTP generates correctly (6 random digits)
- [ ] OTP is encrypted before storage
- [ ] OTP is stored in Redis cache (not database)
- [ ] OTP expires after 10 minutes
- [ ] OTP is sent via correct channel (email/SMS)
- [ ] Correct OTP verifies successfully
- [ ] Incorrect OTP fails with proper message
- [ ] User is locked after 3 wrong attempts
- [ ] User can't generate more than 5 OTPs per hour
- [ ] OTP is deleted after successful verification (single-use)
- [ ] JWT token is returned on successful verification
- [ ] Resend OTP works and replaces previous OTP

---

## Migration Path

If you currently store OTPs in the database:

1. Deploy backend with new `/generate-otp-v2`, `/verify-otp-v2` endpoints alongside existing endpoints
2. Update frontend to use `OtpManagerService` (already done)
3. Monitor new endpoints for a week
4. Stop calling old endpoints
5. Remove old database OTP tables after verification

---

## Support & References

- **Redis Documentation:** https://redis.io/documentation
- **CryptoJS:** https://cryptojs.gitbook.io/docs/
- **StackExchange.Redis:** https://stackexchange.github.io/StackExchange.Redis/
- **System.Security.Cryptography:** https://docs.microsoft.com/en-us/dotnet/api/system.security.cryptography
