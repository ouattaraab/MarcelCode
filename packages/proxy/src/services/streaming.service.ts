import { Response } from 'express';
import { logger } from '../config';
import { TokenUsage } from '@marcelia/shared';

export function initSSE(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

export function sendSSEEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }
}

export function sendSSEDone(res: Response) {
  res.write('event: done\ndata: [DONE]\n\n');
  res.end();
}

export function sendSSEError(res: Response, error: string) {
  sendSSEEvent(res, 'error', { error });
  res.end();
}

export interface StreamResult {
  content: string;
  usage: TokenUsage;
  messageId: string;
}

export async function forwardFoundryStream(
  stream: any,
  res: Response,
  requestId: string,
): Promise<StreamResult> {
  initSSE(res);

  let fullContent = '';
  let messageId = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    stream.on('message', (event: any) => {
      sendSSEEvent(res, event.type, event);
    });

    stream.on('text', (text: string) => {
      fullContent += text;
    });

    const finalMessage = await stream.finalMessage();
    messageId = finalMessage.id;
    inputTokens = finalMessage.usage?.input_tokens || 0;
    outputTokens = finalMessage.usage?.output_tokens || 0;

    sendSSEDone(res);

    return {
      content: fullContent,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      messageId,
    };
  } catch (err) {
    logger.error({ err, requestId }, 'Streaming error');
    sendSSEError(res, 'Streaming error occurred');
    throw err;
  }
}
