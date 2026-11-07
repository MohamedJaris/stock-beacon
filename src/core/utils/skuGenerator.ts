/**
 * Generates a RFC-4122-compatible UUID v4 string without requiring external native crypto modules.
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generates a clean, readable SKU from product name, category, and optional variant attributes.
 */
export function generateSku(
  productName: string,
  categoryName?: string,
  variantSuffix?: string,
  existingCount = 1
): string {
  const cleanPart = (text: string, maxLen = 4): string =>
    text
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, maxLen) || 'ITEM';

  const catPart = categoryName ? cleanPart(categoryName, 3) : 'GEN';
  const prodPart = cleanPart(productName, 4);
  const seqPart = String(existingCount).padStart(3, '0');

  if (variantSuffix) {
    const varPart = variantSuffix
      .split('/')
      .map((s) => cleanPart(s.trim(), 3))
      .join('-');
    return `${catPart}-${prodPart}-${varPart}-${seqPart}`;
  }

  return `${catPart}-${prodPart}-${seqPart}`;
}

/**
 * Computes a deterministic FNV-1a 32-bit hex checksum for backup integrity verification.
 */
export function computeChecksum(payload: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
