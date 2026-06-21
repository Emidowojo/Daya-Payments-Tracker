import crypto from "crypto";

export function generateWebhookSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function verifyWebhookSignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;

  const expected = generateWebhookSignature(payload, secret);

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
