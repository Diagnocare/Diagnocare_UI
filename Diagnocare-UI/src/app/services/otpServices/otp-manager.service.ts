import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { OtpRequest, OtpResponse, OtpVerificationRequest } from 'src/app/models/otpRequest/otpRequest';

/**
 * OTP Manager Service
 *
 * This service manages One-Time Password (OTP) generation and verification
 * using an IN-MEMORY, ENCRYPTED approach without database storage.
 *
 * Best Practice Implementation:
 * - OTPs are generated as 6-digit random codes
 * - Each OTP is encrypted using AES-256 encryption
 * - Encrypted OTPs are stored in in-memory cache (e.g., Redis, Node cache)
 * - Each OTP has a TTL (Time-To-Live) of 10 minutes
 * - OTP is single-use: deleted immediately after verification
 * - Rate limiting: Max 5 OTP generation attempts per user per hour
 * - Multiple OTP lockout: If wrong code entered 3 times, block for 15 minutes
 */


@Injectable({ providedIn: 'root' })
export class OtpManagerService {
  // This is a frontend service; the actual caching happens on the backend
  // See Backend Implementation section below
  private readonly url: string;
  constructor(private httpClient: HttpClient) {
    this.url = getDiagnocareApiUrl() + controllerEndpoints.otp;
  }

  /**
   * Sends OTP to user via specified channel.
   *
   * Backend steps (no DB used):
   * 1. Check rate limit (max 5 requests/hour per user)
   * 2. Generate 6-digit OTP code (000000-999999)
   * 3. Encrypt code using AES-256 with server secret key
   * 4. Store encrypted code in in-memory cache with 10-min TTL
   * 5. Send plaintext code to user via email/SMS (via CommunicationController)
   * 6. Return success response
   *
   * @param request OTP generation request
   * @returns Observable with success status and TTL
   */
  generateOtp(request: OtpRequest): Observable<OtpResponse> {
    return this.httpClient.post<OtpResponse>(
      this.url + apiEndpoints.generateOTP,
      request
    ).pipe(
      catchError(error => {
        console.error('OTP generation failed:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Verifies user-submitted OTP code.
   *
   * Backend steps (no DB used):
   * 1. Check if user/OTP exists in in-memory cache
   * 2. Check if OTP has expired
   * 3. Check if user is locked (too many wrong attempts)
   * 4. Decrypt cached OTP and compare with submitted code
   * 5. If correct:
   *    - Delete OTP from cache (single-use)
   *    - Reset wrong attempt counter
   *    - Return JWT token
   * 6. If incorrect:
   *    - Increment wrong attempt counter
   *    - Lock user after 3 wrong attempts (15-min lockout)
   *    - Return error
   *
   * @param request OTP verification request
   * @returns Observable with success status and JWT token
   */
  verifyOtp(request: OtpVerificationRequest): Observable<OtpResponse> {
    return this.httpClient.post<OtpResponse>(
      this.url + apiEndpoints.verifyOtp,
      request
    ).pipe(
      catchError(error => {
        console.error('OTP verification failed:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Resends OTP to user via same channel.
   * Respects rate limiting (max 5 resends per hour).
   *
   * @param userId The user identifier
   * @returns Observable with success status
   */
  resendOtp(id:number, userId: string): Observable<OtpResponse> {
    return this.httpClient.post<OtpResponse>(
      this.url + apiEndpoints.resendOtp,
      { id, userId }
    ).pipe(
      catchError(error => {
        console.error('OTP resend failed:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Cancels pending OTP and clears cache entry.
   * Called when user navigates away or explicitly cancels.
   *
   * @param userId The user identifier
   * @returns Observable with success status
   */
  cancelOtp(id:number, userId: string): Observable<OtpResponse> {
    return this.httpClient.post<OtpResponse>(
      this.url + apiEndpoints.cancelOtp,
      { id, userId }
    ).pipe(
      catchError(error => {
        console.error('OTP cancellation failed:', error);
        return throwError(() => error);
      })
    );
  }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * BACKEND IMPLEMENTATION GUIDE (.NET / Node.js / Java)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * FOR .NET (C#) BACKEND:
 * ─────────────────────────
 *
 * 1. Install NuGet packages:
 *    - StackExchange.Redis (for distributed cache)
 *    - System.Security.Cryptography (built-in)
 *
 * 2. Create OtpCacheService.cs:
 *
 *    public class OtpCacheService
 *    {
 *        private readonly IDistributedCache _cache;
 *        private const int OTP_EXPIRATION_MINUTES = 10;
 *        private const int OTP_ATTEMPTS_LIMIT = 3;
 *        private const int LOCKOUT_MINUTES = 15;
 *        private const int RATE_LIMIT_HOUR = 5; // max 5 OTPs per hour
 *
 *        public OtpCacheService(IDistributedCache cache) => _cache = cache;
 *
 *        // Generate 6-digit OTP
 *        public string GenerateOtp()
 *        {
 *            var random = new Random();
 *            return random.Next(100000, 999999).ToString();
 *        }
 *
 *        // Encrypt OTP using AES-256
 *        public string EncryptOtp(string plainOtp, string encryptionKey)
 *        {
 *            using (var aes = Aes.Create())
 *            {
 *                aes.Key = Convert.FromBase64String(encryptionKey);
 *                aes.GenerateIV();
 *
 *                using (var encryptor = aes.CreateEncryptor())
 *                using (var ms = new MemoryStream())
 *                {
 *                    ms.Write(aes.IV, 0, aes.IV.Length);
 *                    using (var cs = new CryptoStream(ms, encryptor, CryptoStreamMode.Write))
 *                    using (var sw = new StreamWriter(cs))
 *                    {
 *                        sw.Write(plainOtp);
 *                    }
 *                    return Convert.ToBase64String(ms.ToArray());
 *                }
 *            }
 *        }
 *
 *        // Decrypt OTP
 *        public string DecryptOtp(string encryptedOtp, string encryptionKey)
 *        {
 *            using (var aes = Aes.Create())
 *            {
 *                aes.Key = Convert.FromBase64String(encryptionKey);
 *
 *                var buffer = Convert.FromBase64String(encryptedOtp);
 *                aes.IV = buffer.Take(aes.IV.Length).ToArray();
 *
 *                using (var decryptor = aes.CreateDecryptor())
 *                using (var ms = new MemoryStream(buffer, aes.IV.Length, buffer.Length - aes.IV.Length))
 *                using (var cs = new CryptoStream(ms, decryptor, CryptoStreamMode.Read))
 *                using (var sr = new StreamReader(cs))
 *                {
 *                    return sr.ReadToEnd();
 *                }
 *            }
 *        }
 *
 *        // Store OTP in cache
 *        public async Task StoreOtpAsync(string userId, string encryptedOtp, string channel)
 *        {
 *            var cacheKey = $"otp:{userId}";
 *            var cacheEntry = new
 *            {
 *                encryptedCode = encryptedOtp,
 *                userId,
 *                channel,
 *                timestamp = DateTime.UtcNow.Ticks,
 *                expiresAt = (DateTime.UtcNow.AddMinutes(OTP_EXPIRATION_MINUTES)).Ticks,
 *                attempts = 0,
 *                locked = false
 *            };
 *
 *            var options = new DistributedCacheEntryOptions()
 *                .SetAbsoluteExpiration(TimeSpan.FromMinutes(OTP_EXPIRATION_MINUTES));
 *
 *            await _cache.SetStringAsync(
 *                cacheKey,
 *                JsonConvert.SerializeObject(cacheEntry),
 *                options
 *            );
 *        }
 *
 *        // Verify OTP
 *        public async Task<(bool valid, string message)> VerifyOtpAsync(
 *            string userId,
 *            string submittedCode,
 *            string encryptionKey)
 *        {
 *            var cacheKey = $"otp:{userId}";
 *            var cached = await _cache.GetStringAsync(cacheKey);
 *
 *            if (string.IsNullOrEmpty(cached))
 *                return (false, "OTP expired or not found");
 *
 *            var entry = JsonConvert.DeserializeObject<OtpCacheEntry>(cached);
 *
 *            if (entry.locked)
 *                return (false, "Account temporarily locked due to wrong OTP attempts");
 *
 *            var decrypted = DecryptOtp(entry.encryptedCode, encryptionKey);
 *
 *            if (decrypted == submittedCode)
 *            {
 *                await _cache.RemoveAsync(cacheKey); // Single-use
 *                return (true, "OTP verified");
 *            }
 *
 *            // Wrong attempt
 *            entry.attempts++;
 *            if (entry.attempts >= OTP_ATTEMPTS_LIMIT)
 *            {
 *                entry.locked = true;
 *                entry.lockedUntil = DateTime.UtcNow.AddMinutes(LOCKOUT_MINUTES).Ticks;
 *            }
 *
 *            await _cache.SetStringAsync(
 *                cacheKey,
 *                JsonConvert.SerializeObject(entry),
 *                new DistributedCacheEntryOptions()
 *                    .SetAbsoluteExpiration(TimeSpan.FromMinutes(OTP_EXPIRATION_MINUTES))
 *            );
 *
 *            return (false, "Invalid OTP");
 *        }
 *    }
 *
 * 3. Update LoginController:
 *
 *    [HttpPost("generate-otp-v2")]
 *    public async Task<IActionResult> GenerateOtpV2([FromBody] SendOtpRequest req)
 *    {
 *        try
 *        {
 *            // Check rate limit
 *            if (!await _rateLimitService.CheckLimitAsync(req.userId, "otp_generation", 5, TimeSpan.FromHours(1)))
 *                return Ok(new { success = false, message = "Too many OTP requests. Try again later." });
 *
 *            var otp = _otpService.GenerateOtp();
 *            var encrypted = _otpService.EncryptOtp(otp, _config["Encryption:OtpKey"]);
 *
 *            await _otpService.StoreOtpAsync(req.userId, encrypted, req.channel);
 *
 *            // Send via communication controller
 *            await _communicationService.SendOtpAsync(
 *                req.userId,
 *                otp,
 *                req.channel,
 *                req.email,
 *                req.contactPhone
 *            );
 *
 *            return Ok(new { 
 *                success = true, 
 *                message = "OTP sent successfully",
 *                expiresIn = 600 // 10 minutes in seconds
 *            });
 *        }
 *        catch (Exception ex)
 *        {
 *            return Ok(new { success = false, message = ex.Message });
 *        }
 *    }
 *
 *    [HttpPost("verify-otp-v2")]
 *    public async Task<IActionResult> VerifyOtpV2([FromBody] VerifyOtpRequest req)
 *    {
 *        var (valid, msg) = await _otpService.VerifyOtpAsync(
 *            req.userId,
 *            req.code,
 *            _config["Encryption:OtpKey"]
 *        );
 *
 *        if (!valid)
 *            return Ok(new { success = false, message = msg });
 *
 *        // Generate JWT token
 *        var token = _tokenService.GenerateToken(req.userId);
 *        return Ok(new { success = true, message = "OTP verified", token });
 *    }
 *
 *    [HttpPost("resend-otp-v2")]
 *    public async Task<IActionResult> ResendOtpV2([FromBody] ResendOtpRequest req)
 *    {
 *        // Re-generate and store new OTP (deletes old one)
 *        await _otpService.StoreOtpAsync(...);
 *        await _communicationService.SendOtpAsync(...);
 *
 *        return Ok(new { success = true, message = "OTP resent", expiresIn = 600 });
 *    }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * FOR NODE.JS (Express) BACKEND:
 * ──────────────────────────────
 *
 * 1. Install packages:
 *    npm install redis crypto-js ioredis
 *
 * 2. Create otpManager.js:
 *
 *    const crypto = require('crypto');
 *    const redis = require('redis');
 *    const CryptoJS = require('crypto-js');
 *
 *    class OtpManager {
 *        constructor(redisClient, encryptionKey) {
 *            this.redis = redisClient;
 *            this.encryptionKey = encryptionKey;
 *            this.OTP_EXPIRATION = 600; // 10 minutes
 *            this.ATTEMPT_LIMIT = 3;
 *            this.LOCKOUT_TIME = 900; // 15 minutes
 *        }
 *
 *        generateOtp() {
 *            return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
 *        }
 *
 *        encryptOtp(plainOtp) {
 *            return CryptoJS.AES.encrypt(plainOtp, this.encryptionKey).toString();
 *        }
 *
 *        decryptOtp(encryptedOtp) {
 *            const bytes = CryptoJS.AES.decrypt(encryptedOtp, this.encryptionKey);
 *            return bytes.toString(CryptoJS.enc.Utf8);
 *        }
 *
 *        async storeOtp(userId, plainOtp, channel) {
 *            const encrypted = this.encryptOtp(plainOtp);
 *            const cacheEntry = {
 *                encryptedCode: encrypted,
 *                userId,
 *                channel,
 *                timestamp: Date.now(),
 *                expiresAt: Date.now() + (this.OTP_EXPIRATION * 1000),
 *                attempts: 0,
 *                locked: false
 *            };
 *
 *            await this.redis.setex(
 *                `otp:${userId}`,
 *                this.OTP_EXPIRATION,
 *                JSON.stringify(cacheEntry)
 *            );
 *        }
 *
 *        async verifyOtp(userId, submittedCode) {
 *            const cached = await this.redis.get(`otp:${userId}`);
 *
 *            if (!cached) {
 *                return { valid: false, message: 'OTP expired or not found' };
 *            }
 *
 *            const entry = JSON.parse(cached);
 *
 *            if (entry.locked) {
 *                return { valid: false, message: 'Account locked due to wrong attempts' };
 *            }
 *
 *            const decrypted = this.decryptOtp(entry.encryptedCode);
 *
 *            if (decrypted === submittedCode) {
 *                await this.redis.del(`otp:${userId}`); // Single-use
 *                return { valid: true, message: 'OTP verified' };
 *            }
 *
 *            // Wrong attempt
 *            entry.attempts++;
 *            if (entry.attempts >= this.ATTEMPT_LIMIT) {
 *                entry.locked = true;
 *                entry.lockedUntil = Date.now() + (this.LOCKOUT_TIME * 1000);
 *            }
 *
 *            await this.redis.setex(
 *                `otp:${userId}`,
 *                this.OTP_EXPIRATION,
 *                JSON.stringify(entry)
 *            );
 *
 *            return { valid: false, message: 'Invalid OTP' };
 *        }
 *    }
 *
 *    module.exports = OtpManager;
 *
 * 3. In your login routes:
 *
 *    const express = require('express');
 *    const router = express.Router();
 *    const OtpManager = require('./otpManager');
 *
 *    const otpManager = new OtpManager(redisClient, process.env.ENCRYPTION_KEY);
 *
 *    router.post('/generate-otp-v2', async (req, res) => {
 *        try {
 *            const { userId, channel, email, contactPhone } = req.body;
 *
 *            // Check rate limit
 *            const attempts = await redis.incr(`otp_attempts:${userId}`);
 *            if (attempts === 1) {
 *                await redis.expire(`otp_attempts:${userId}`, 3600);
 *            }
 *            if (attempts > 5) {
 *                return res.json({ success: false, message: 'Too many OTP requests' });
 *            }
 *
 *            const plainOtp = otpManager.generateOtp();
 *            await otpManager.storeOtp(userId, plainOtp, channel);
 *
 *            // Send OTP via email/SMS
 *            await communicationService.sendOtp(userId, plainOtp, channel, email, contactPhone);
 *
 *            res.json({ 
 *                success: true, 
 *                message: 'OTP sent successfully',
 *                expiresIn: 600
 *            });
 *        } catch (error) {
 *            res.json({ success: false, message: error.message });
 *        }
 *    });
 *
 *    router.post('/verify-otp-v2', async (req, res) => {
 *        const { userId, code } = req.body;
 *        const result = await otpManager.verifyOtp(userId, code);
 *
 *        if (!result.valid) {
 *            return res.json({ success: false, message: result.message });
 *        }
 *
 *        const token = generateJWTToken(userId);
 *        res.json({ success: true, message: 'Verified', token });
 *    });
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * SECURITY BEST PRACTICES:
 *
 * ✓ OTPs are 6-digit random numbers (1,000,000 combinations)
 * ✓ OTPs are encrypted with AES-256 before storage
 * ✓ OTPs are stored in-memory ONLY (Redis/distributed cache, NOT database)
 * ✓ OTPs expire after 10 minutes
 * ✓ OTPs are single-use (deleted after verification)
 * ✓ Encryption keys are stored in environment variables, NOT in code
 * ✓ Rate limiting: max 5 OTP requests per user per hour
 * ✓ Attempt limiting: max 3 wrong attempts, then 15-min lockout
 * ✓ No OTP history is kept in the database
 * ✓ No plaintext OTPs are stored anywhere
 *
 * ═════════════════════════════════════════════════════════════════════════════
 */
