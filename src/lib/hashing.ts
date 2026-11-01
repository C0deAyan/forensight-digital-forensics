export type Digests = { sha256: string; sha512: string };

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

export async function computeDigests(bytes: ArrayBuffer): Promise<Digests> {
  const [sha256, sha512] = await Promise.all([
    crypto.subtle.digest('SHA-256', bytes),
    crypto.subtle.digest('SHA-512', bytes),
  ]);
  return { sha256: toHex(sha256), sha512: toHex(sha512) };
}
