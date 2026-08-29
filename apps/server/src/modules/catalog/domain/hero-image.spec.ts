import {
  acceptHeroImage,
  fileExtension,
  heroImageRejection,
  HERO_IMAGE_MAX_BYTES,
  type HeroImageUpload,
} from './hero-image';

/** Real leading bytes, then filler — the signature is all the rule reads. */
const jpegBytes = (size = 64): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size)]);

const pngBytes = (size = 64): Buffer =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(size),
  ]);

const upload = (overrides: Partial<HeroImageUpload> = {}): HeroImageUpload => ({
  filename: 'hero.jpg',
  declaredContentType: 'image/jpeg',
  bytes: jpegBytes(),
  ...overrides,
});

describe('heroImageRejection', () => {
  it('accepts a JPEG whose name, header and bytes agree', () => {
    expect(heroImageRejection(upload())).toBeNull();
  });

  it('accepts a PNG whose name, header and bytes agree', () => {
    expect(
      heroImageRejection(
        upload({
          filename: 'hero.png',
          declaredContentType: 'image/png',
          bytes: pngBytes(),
        }),
      ),
    ).toBeNull();
  });

  it('treats .jpeg and .jpg as the same format', () => {
    expect(heroImageRejection(upload({ filename: 'hero.jpeg' }))).toBeNull();
  });

  it('ignores case in the extension and the content type', () => {
    expect(
      heroImageRejection(
        upload({ filename: 'HERO.JPG', declaredContentType: 'IMAGE/JPEG' }),
      ),
    ).toBeNull();
  });

  it('ignores Content-Type parameters', () => {
    expect(
      heroImageRejection(
        upload({ declaredContentType: 'image/jpeg; charset=binary' }),
      ),
    ).toBeNull();
  });

  it('rejects an empty file before anything else', () => {
    expect(heroImageRejection(upload({ bytes: Buffer.alloc(0) }))).toEqual({
      reason: 'empty',
    });
  });

  it('rejects a file over the size limit', () => {
    const oversized = Buffer.concat([
      jpegBytes(),
      Buffer.alloc(HERO_IMAGE_MAX_BYTES),
    ]);

    expect(heroImageRejection(upload({ bytes: oversized }))).toEqual({
      reason: 'too_large',
      size: oversized.length,
      limit: HERO_IMAGE_MAX_BYTES,
    });
  });

  /* ---------------------------------------------------------------- *
   * "jpg and png only" — the part the endpoint exists to enforce
   * ---------------------------------------------------------------- */

  it.each(['hero.gif', 'hero.webp', 'hero.svg', 'hero.exe', 'hero.php'])(
    'rejects %s on its extension',
    (filename) => {
      expect(
        heroImageRejection(
          upload({ filename, declaredContentType: 'image/jpeg' }),
        ),
      ).toEqual({
        reason: 'unsupported_extension',
        extension: filename.slice(filename.lastIndexOf('.')),
      });
    },
  );

  it('rejects a filename with no extension at all', () => {
    expect(heroImageRejection(upload({ filename: 'hero' }))).toEqual({
      reason: 'unsupported_extension',
      extension: null,
    });
  });

  it('rejects an accepted extension announced as an unaccepted type', () => {
    expect(
      heroImageRejection(
        upload({ filename: 'hero.png', declaredContentType: 'image/webp' }),
      ),
    ).toEqual({
      reason: 'unsupported_content_type',
      contentType: 'image/webp',
    });
  });

  it('rejects the generic Content-Type a scripted client tends to send', () => {
    expect(
      heroImageRejection(
        upload({ declaredContentType: 'application/octet-stream' }),
      ),
    ).toEqual({
      reason: 'unsupported_content_type',
      contentType: 'application/octet-stream',
    });
  });

  /**
   * The rename. Both claims are perfectly acceptable and both are false — this
   * is the case a filter over the filename or the header cannot catch, and the
   * reason the bytes are read at all.
   */
  it('rejects a non-image renamed to .png and announced as image/png', () => {
    expect(
      heroImageRejection(
        upload({
          filename: 'payload.png',
          declaredContentType: 'image/png',
          bytes: Buffer.from('MZ\u0090\u0000\u0003', 'latin1'),
        }),
      ),
    ).toEqual({ reason: 'unrecognized_bytes' });
  });

  it('rejects a GIF renamed to .jpg', () => {
    expect(
      heroImageRejection(
        upload({ bytes: Buffer.from('GIF89a...........', 'latin1') }),
      ),
    ).toEqual({ reason: 'unrecognized_bytes' });
  });

  it('rejects an SVG renamed to .png, script and all', () => {
    expect(
      heroImageRejection(
        upload({
          filename: 'hero.png',
          declaredContentType: 'image/png',
          bytes: Buffer.from('<svg onload="alert(1)"></svg>'),
        }),
      ),
    ).toEqual({ reason: 'unrecognized_bytes' });
  });

  it('rejects JPEG bytes wearing a .png name and header', () => {
    expect(
      heroImageRejection(
        upload({
          filename: 'hero.png',
          declaredContentType: 'image/png',
          bytes: jpegBytes(),
        }),
      ),
    ).toEqual({
      reason: 'mismatched_claims',
      claimed: 'image/png',
      actual: 'image/jpeg',
    });
  });

  it('rejects a real PNG whose header says JPEG', () => {
    expect(
      heroImageRejection(
        upload({
          filename: 'hero.png',
          declaredContentType: 'image/jpeg',
          bytes: pngBytes(),
        }),
      ),
    ).toEqual({
      reason: 'mismatched_claims',
      claimed: 'image/jpeg',
      actual: 'image/png',
    });
  });

  it('rejects a truncated file whose bytes stop inside the signature', () => {
    expect(
      heroImageRejection(
        upload({
          filename: 'hero.png',
          declaredContentType: 'image/png',
          bytes: Buffer.from([0x89, 0x50]),
        }),
      ),
    ).toEqual({ reason: 'unrecognized_bytes' });
  });
});

describe('acceptHeroImage', () => {
  it('reports the format the bytes actually are', () => {
    const judged = acceptHeroImage(
      upload({
        filename: 'hero.png',
        declaredContentType: 'image/png',
        bytes: pngBytes(),
      }),
    );

    expect(judged).toMatchObject({
      ok: true,
      image: { extension: '.png', format: { contentType: 'image/png' } },
    });
  });

  it('canonicalises .jpeg to .jpg so stored names have one spelling', () => {
    const judged = acceptHeroImage(upload({ filename: 'hero.JPEG' }));

    expect(judged).toMatchObject({ ok: true, image: { extension: '.jpg' } });
  });

  it('carries the rejection through unchanged', () => {
    expect(acceptHeroImage(upload({ filename: 'hero.gif' }))).toEqual({
      ok: false,
      rejection: { reason: 'unsupported_extension', extension: '.gif' },
    });
  });
});

describe('fileExtension', () => {
  it.each([
    ['hero.png', '.png'],
    ['hero.tar.gz', '.gz'],
    ['HERO.PNG', '.png'],
    // A filename is client-written, so it can carry either OS's separators.
    ['C:\\Users\\me\\hero.png', '.png'],
    ['/tmp/hero.png', '.png'],
    ['hero', null],
    // A dotfile is a name, not an extension — and it is how a bare ".png"
    // would otherwise sneak past the extension check.
    ['.png', null],
    ['hero.', null],
    ['', null],
  ])('%s → %s', (filename, expected) => {
    expect(fileExtension(filename)).toBe(expected);
  });
});
