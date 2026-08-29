import { validateEnv } from './env';

/**
 * The environment schema's job is to fail at boot rather than at the first
 * request that needed the value. These tests are about the cases where that
 * distinction has teeth — the upload switch, whose consequences show up only
 * when someone tries to upload.
 */
describe('validateEnv', () => {
  it('defaults to local uploads', () => {
    expect(validateEnv({})).toMatchObject({
      S3_UPLOAD: false,
      UPLOADS_DIR: './uploads',
      S3_KEY_PREFIX: 'hero-images',
    });
  });

  /**
   * The reason for `z.stringbool()`. An environment variable is always a
   * string, and under JavaScript truthiness `"false"` is `true` — so plain
   * coercion would turn "S3 is off" into "S3 is on" for anyone who wrote it
   * out longhand.
   */
  it.each([
    ['false', false],
    ['0', false],
    ['no', false],
    ['true', true],
    ['1', true],
    ['yes', true],
  ])('reads S3_UPLOAD=%s as %s', (raw, expected) => {
    const env = validateEnv({
      S3_UPLOAD: raw,
      S3_BUCKET: 'bucket',
      S3_REGION: 'us-east-1',
    });

    expect(env.S3_UPLOAD).toBe(expected);
  });

  it('accepts a complete S3 configuration', () => {
    expect(
      validateEnv({
        S3_UPLOAD: 'true',
        S3_BUCKET: 'event-forge-media',
        S3_REGION: 'sa-east-1',
      }),
    ).toMatchObject({ S3_UPLOAD: true, S3_BUCKET: 'event-forge-media' });
  });

  it.each(['S3_BUCKET', 'S3_REGION'])(
    'refuses to boot with S3_UPLOAD on and %s missing',
    (missing) => {
      const config: Record<string, unknown> = {
        S3_UPLOAD: 'true',
        S3_BUCKET: 'event-forge-media',
        S3_REGION: 'sa-east-1',
      };
      delete config[missing];

      // Named, not merely rejected: the whole point of validating here is that
      // the log says which variable to set.
      expect(() => validateEnv(config)).toThrow(missing);
    },
  );

  it('ignores incomplete S3 settings while the switch is off', () => {
    // Half-filled S3 variables are how a deployment looks mid-migration, and
    // they are harmless until something actually reads them.
    expect(() =>
      validateEnv({ S3_UPLOAD: 'false', S3_BUCKET: 'event-forge-media' }),
    ).not.toThrow();
  });

  it('rejects a PUBLIC_BASE_URL that is not a URL', () => {
    expect(() => validateEnv({ PUBLIC_BASE_URL: 'localhost:3001' })).toThrow(
      'PUBLIC_BASE_URL',
    );
  });
});
