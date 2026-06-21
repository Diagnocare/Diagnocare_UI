import { Injectable } from '@angular/core';

/**
 * Symmetric encryption service for localStorage values.
 *
 * Algorithm: XOR stream cipher with a 64-byte key + base64url encoding.
 * - Each byte of plaintext is XORed with a repeating key byte.
 * - The result is base64-encoded for safe localStorage storage.
 *
 * This prevents casual inspection of localStorage data.
 * The key is compiled into the bundle; change CIPHER_KEY to rotate all stored data.
 */
@Injectable({ providedIn: 'root' })
export class StorageEncryptionService {

  /** Change this key to invalidate all previously encrypted localStorage entries. */
  private static readonly CIPHER_KEY =
    'Diagnocare@2024#SecureLocalStorage$XorKey!PathologyMgmt%v1^&*()_+';

  private static readonly KEY_BYTES: Uint8Array = (() => {
    const enc = new TextEncoder();
    return enc.encode(StorageEncryptionService.CIPHER_KEY);
  })();

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Encrypts a plaintext string and returns a base64-encoded ciphertext.
   * Safe to store in localStorage.
   */
  encrypt(plaintext: string): string {
    const ptBytes  = new TextEncoder().encode(plaintext);
    const key      = StorageEncryptionService.KEY_BYTES;
    const cipher   = new Uint8Array(ptBytes.length);
    for (let i = 0; i < ptBytes.length; i++) {
      cipher[i] = ptBytes[i] ^ key[i % key.length];
    }
    return this.bytesToBase64(cipher);
  }

  /**
   * Decrypts a base64-encoded ciphertext produced by `encrypt()`.
   * Returns null if the value is empty, null, or malformed.
   */
  decrypt(ciphertext: string | null): string | null {
    if (!ciphertext) return null;
    try {
      const cipher = this.base64ToBytes(ciphertext);
      const key    = StorageEncryptionService.KEY_BYTES;
      const plain  = new Uint8Array(cipher.length);
      for (let i = 0; i < cipher.length; i++) {
        plain[i] = cipher[i] ^ key[i % key.length];
      }
      return new TextDecoder().decode(plain);
    } catch {
      return null;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToBytes(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
