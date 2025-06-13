import crypto from 'crypto';

/**
 * Decrypts media buffer using provided WhatsApp message info.
 */
export function decryptMedia(encryptedData: Buffer, mediaKeyBase64: string, type: string): Buffer {
  const HKDF_KEY = Buffer.from(mediaKeyBase64, 'base64');

  const mediaKeyExpanded = hkdf(HKDF_KEY, 112, Buffer.from(type, 'utf-8'));
  const iv = mediaKeyExpanded.slice(0, 16);
  const cipherKey = mediaKeyExpanded.slice(16, 48);
  const macKey = mediaKeyExpanded.slice(48, 80);

  const fileData = encryptedData.slice(0, encryptedData.length - 10);
  const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
  decipher.setAutoPadding(false);

  const decrypted = Buffer.concat([decipher.update(fileData), decipher.final()]);
  return decrypted;
}

/**
 * HKDF key expansion (used by WhatsApp for media encryption).
 */
function hkdf(mediaKey: Buffer, length: number, info: Buffer): Buffer {
    const salt = Buffer.alloc(32);
    const PRK = crypto.createHmac('sha256', salt).update(mediaKey).digest();
    let prev: Buffer = Buffer.alloc(0);
    const output: Buffer[] = [];
    const iterations = Math.ceil(length / 32);
  
    for (let i = 0; i < iterations; i++) {
      const hmac = crypto.createHmac('sha256', PRK);
      hmac.update(prev);
      hmac.update(info);
      hmac.update(Buffer.from([i + 1]));
      prev = hmac.digest();
      output.push(prev);
    }
  
    return Buffer.concat(output).slice(0, length);
  }
  