import { Injectable } from '@nestjs/common';
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

const scrypt = (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });

/**
 * scrypt parameters. N=2^15 with r=8 is OWASP's floor for scrypt, and costs
 * around 32 MiB and ~50 ms per hash. `maxmem` has to be raised to allow it:
 * Node's default ceiling is exactly 32 MiB, and scrypt needs a little over.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const MAX_MEM = 64 * 1024 * 1024;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Passwords, hashed with scrypt from `node:crypto`.
 *
 * scrypt rather than argon2 or bcrypt for one reason: both of those are native
 * modules, and this API is bundled by esbuild into a single file for Lambda.
 * A native addon is a `.node` binary per platform that esbuild cannot inline,
 * and getting it wrong fails at runtime, not at build. scrypt is memory-hard,
 * on OWASP's list, and ships with Node — no dependency at all.
 *
 * The stored string carries its own parameters
 * (`scrypt$N$r$p$salt$hash`), so raising the cost later does not invalidate a
 * single existing password: old hashes verify with the parameters they were
 * made with.
 */
@Injectable()
export class PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await scrypt(password, salt, KEY_LENGTH, {
      ...PARAMS,
      maxmem: MAX_MEM,
    });

    return [
      'scrypt',
      PARAMS.N,
      PARAMS.r,
      PARAMS.p,
      salt.toString('base64'),
      key.toString('base64'),
    ].join('$');
  }

  /**
   * Never throws on a malformed hash — it answers `false`. A corrupted row
   * should lock one account out, not turn a login into a 500.
   */
  async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, n, r, p, salt, key] = stored.split('$');

    if (scheme !== 'scrypt' || !salt || !key) return false;

    const expected = Buffer.from(key, 'base64');
    const actual = await scrypt(
      password,
      Buffer.from(salt, 'base64'),
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: MAX_MEM },
    ).catch(() => null);

    // timingSafeEqual throws on a length mismatch, which the scrypt call above
    // rules out by deriving exactly `expected.length` bytes.
    return actual !== null && timingSafeEqual(actual, expected);
  }
}
