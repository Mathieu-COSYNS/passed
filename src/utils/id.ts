const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ID_LENGTH = 24;
const ID_PATTERN = /^[A-Za-z]{24}$/;

/** Largest multiple of 52 that fits in a byte (rejection sampling). */
const UNBIASED_LIMIT = 52 * Math.floor(256 / 52);

/** 24-character id from A–Z/a–z, matching original PassED share ids. */
export function generateShareId(): string {
  const chars: string[] = [];
  const bytes = new Uint8Array(ID_LENGTH);
  while (chars.length < ID_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= UNBIASED_LIMIT) {
        continue;
      }
      chars.push(ALPHABET[byte % 52]);
      if (chars.length === ID_LENGTH) {
        break;
      }
    }
  }
  return chars.join("");
}

export function isShareId(id: string): boolean {
  return ID_PATTERN.test(id);
}
