/**
 * What may become an event's hero image — the rules, and nothing else.
 *
 * "JPEG and PNG only" sounds like one check and is really three, because a
 * request offers three separate claims about what it is carrying: the
 * filename's extension, the `Content-Type` part header, and the bytes. A
 * client writes all three, and only the last one is a fact. So all three are
 * checked and required to agree — an accepted upload is one where what the
 * caller said matches what they actually sent.
 *
 * Pure on purpose, like `publish-event.ts`: no Nest, no `fs`, no entities.
 * Format rules are the part worth testing exhaustively and they should not
 * need a temp directory to say so.
 */

/**
 * A supported format, described by every signal that identifies it.
 *
 * The signature is the leading byte sequence every file of the format starts
 * with. JPEG's is the SOI marker plus the first byte of the next one (`FF D8
 * FF`), which is as much as is fixed across JFIF, Exif and raw variants; PNG's
 * is its full 8-byte header, whose non-ASCII bytes exist precisely so a
 * mangling transfer is detectable.
 */
export type HeroImageFormat = {
  contentType: string;
  /** Lowercase, with the dot. First entry is the canonical one for filenames. */
  extensions: readonly string[];
  signature: readonly number[];
};

export const HERO_IMAGE_FORMATS: readonly HeroImageFormat[] = [
  {
    contentType: 'image/jpeg',
    extensions: ['.jpg', '.jpeg'],
    signature: [0xff, 0xd8, 0xff],
  },
  {
    contentType: 'image/png',
    extensions: ['.png'],
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
];

/** 5 MiB, mirroring the contract. Enforced again here on the bytes we hold. */
export const HERO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** An upload as the domain sees it: two claims and the thing itself. */
export type HeroImageUpload = {
  /** As the client named it. Untrusted — a path, a lie, or empty. */
  filename: string;
  /** As the client labelled the part. Equally untrusted. */
  declaredContentType: string;
  bytes: Buffer;
};

/**
 * Why an upload is not acceptable. A tagged union rather than a message, for
 * the same reason `PublishBlocker` is one: this layer decides the rule, api/
 * decides the wording.
 */
export type HeroImageRejection =
  | { reason: 'empty' }
  | { reason: 'too_large'; size: number; limit: number }
  | { reason: 'unsupported_extension'; extension: string | null }
  | { reason: 'unsupported_content_type'; contentType: string }
  | { reason: 'unrecognized_bytes' }
  | { reason: 'mismatched_claims'; claimed: string; actual: string };

/** An upload that passed every check, with the format it actually is. */
export type AcceptedHeroImage = {
  format: HeroImageFormat;
  /** The canonical extension for the real format — `.jpg`, never `.jpeg`. */
  extension: string;
  bytes: Buffer;
};

/**
 * The first reason this upload cannot become a hero image, or null if it can.
 *
 * Ordered cheapest and most fundamental first, like `publishBlocker`: there is
 * nothing useful to say about the extension of a file that arrived empty.
 *
 * The last check is the one that matters. The two before it reject the honest
 * mistake — someone picking a `.webp` — with a message naming what they picked.
 * This one rejects the rename: a `.exe` called `.png` announced as `image/png`
 * satisfies both of them and still is not an image. Only the bytes settle it,
 * which is why they are read last and trusted most.
 */
export function heroImageRejection(
  upload: HeroImageUpload,
): HeroImageRejection | null {
  if (upload.bytes.length === 0) {
    return { reason: 'empty' };
  }

  if (upload.bytes.length > HERO_IMAGE_MAX_BYTES) {
    return {
      reason: 'too_large',
      size: upload.bytes.length,
      limit: HERO_IMAGE_MAX_BYTES,
    };
  }

  const extension = fileExtension(upload.filename);
  const byExtension = HERO_IMAGE_FORMATS.find((format) =>
    format.extensions.includes(extension ?? ''),
  );

  if (!byExtension) {
    return { reason: 'unsupported_extension', extension };
  }

  const contentType = baseContentType(upload.declaredContentType);
  const byContentType = HERO_IMAGE_FORMATS.find(
    (format) => format.contentType === contentType,
  );

  if (!byContentType) {
    return { reason: 'unsupported_content_type', contentType };
  }

  const actual = HERO_IMAGE_FORMATS.find((format) =>
    startsWith(upload.bytes, format.signature),
  );

  if (!actual) {
    return { reason: 'unrecognized_bytes' };
  }

  // Three signals, one format, or it does not go in. Comparing the two claims
  // against `actual` rather than against each other is what makes a `.png`
  // announced as `image/png` that holds JPEG bytes fail here.
  if (byExtension !== actual || byContentType !== actual) {
    return {
      reason: 'mismatched_claims',
      claimed: (byExtension === actual ? byContentType : byExtension)
        .contentType,
      actual: actual.contentType,
    };
  }

  return null;
}

/**
 * The upload, judged.
 *
 * A companion to `heroImageRejection` so a caller gets the accepted format
 * back rather than having to re-derive it — and so the accepted case is a
 * value that cannot be constructed without passing the rules.
 */
export function acceptHeroImage(
  upload: HeroImageUpload,
):
  | { ok: true; image: AcceptedHeroImage }
  | { ok: false; rejection: HeroImageRejection } {
  const rejection = heroImageRejection(upload);

  if (rejection) return { ok: false, rejection };

  // Safe: reaching here means the signature matched one of the formats.
  const format = HERO_IMAGE_FORMATS.find((candidate) =>
    startsWith(upload.bytes, candidate.signature),
  )!;

  return {
    ok: true,
    image: { format, extension: format.extensions[0], bytes: upload.bytes },
  };
}

/**
 * The lowercased extension of a filename, dot included, or null.
 *
 * Deliberately not `path.extname`: this string came off the network and may
 * carry separators from a foreign OS, so the basename is taken against both
 * `/` and `\` before the dot is looked for. A leading-dot name with no
 * extension (`.png` on its own) has no extension — `path.extname` agrees, and
 * the check here is that the dot is not the first character of the basename.
 */
export function fileExtension(filename: string): string | null {
  const basename = filename.split(/[\\/]/).pop() ?? '';
  const dot = basename.lastIndexOf('.');

  if (dot <= 0 || dot === basename.length - 1) return null;

  return basename.slice(dot).toLowerCase();
}

/** `image/png; charset=x` → `image/png`. Parameters are not part of the type. */
function baseContentType(header: string): string {
  return header.split(';')[0].trim().toLowerCase();
}

function startsWith(bytes: Buffer, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;

  return signature.every((byte, index) => bytes[index] === byte);
}
