import { Request, Response, NextFunction } from 'express';
import { logger } from '../config';

const PII_PATTERNS = [
  { name: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: 'phone_fr', pattern: /(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g },
  { name: 'phone_ci', pattern: /(?:\+225)\s*\d{2}(?:[\s.-]*\d{2}){3}/g },
  { name: 'iban', pattern: /[A-Z]{2}\d{2}[\s]?[\dA-Z]{4}(?:[\s]?[\dA-Z]{4}){2,7}(?:[\s]?[\dA-Z]{1,4})?/g },
  { name: 'api_key', pattern: /(?:sk|pk|api|key|token|secret|password)[_-]?[a-zA-Z0-9]{20,}/gi },
  { name: 'aws_key', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'private_key', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
];

interface ScanResult {
  hasPII: boolean;
  detections: Array<{ type: string; count: number }>;
}

function scanText(text: string): ScanResult {
  const detections: Array<{ type: string; count: number }> = [];

  for (const { name, pattern } of PII_PATTERNS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      detections.push({ type: name, count: matches.length });
    }
  }

  return { hasPII: detections.length > 0, detections };
}

function redactText(text: string): string {
  let redacted = text;
  for (const { pattern } of PII_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

export function piiScanner(req: Request, res: Response, next: NextFunction) {
  if (!req.body) return next();

  const bodyStr = JSON.stringify(req.body);
  const result = scanText(bodyStr);

  if (result.hasPII) {
    const requestId = req.headers['x-request-id'] as string;
    logger.warn(
      { requestId, detections: result.detections },
      'PII detected in request, redacting',
    );

    // Redact PII from message content
    if (req.body.messages) {
      req.body.messages = req.body.messages.map((msg: any) => ({
        ...msg,
        content: typeof msg.content === 'string' ? redactText(msg.content) : msg.content,
      }));
    }
    if (req.body.code) {
      req.body.code = redactText(req.body.code);
    }
    if (req.body.prompt) {
      req.body.prompt = redactText(req.body.prompt);
    }
    if (req.body.prefix) {
      req.body.prefix = redactText(req.body.prefix);
    }
    if (req.body.suffix) {
      req.body.suffix = redactText(req.body.suffix);
    }

    res.setHeader('X-PII-Redacted', 'true');
  }

  next();
}
