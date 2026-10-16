import { PasswordHasher } from './password-hasher';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('verifies the password it hashed', async () => {
    const stored = await hasher.hash('correct horse battery staple');

    await expect(
      hasher.verify('correct horse battery staple', stored),
    ).resolves.toBe(true);
  });

  it('rejects a different password', async () => {
    const stored = await hasher.hash('correct horse battery staple');

    await expect(
      hasher.verify('Correct horse battery staple', stored),
    ).resolves.toBe(false);
  });

  it('salts every hash, so one password never stores the same way twice', async () => {
    const [a, b] = await Promise.all([
      hasher.hash('same password'),
      hasher.hash('same password'),
    ]);

    expect(a).not.toBe(b);
  });

  it('stores its parameters, so a later cost change does not break old hashes', async () => {
    const stored = await hasher.hash('whatever');

    expect(stored).toMatch(/^scrypt\$32768\$8\$1\$[^$]+\$[^$]+$/);
  });

  it.each([
    ['an empty string', ''],
    ['an unknown scheme', 'bcrypt$2b$10$abc'],
    ['a truncated hash', 'scrypt$32768$8$1$'],
    ['nonsense parameters', 'scrypt$x$y$z$c2FsdA==$a2V5'],
  ])('answers false, not a throw, for %s', async (_label, stored) => {
    await expect(hasher.verify('whatever', stored)).resolves.toBe(false);
  });
});
