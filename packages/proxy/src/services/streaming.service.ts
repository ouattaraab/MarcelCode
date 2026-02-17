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
  stopReason: string | null;
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
  let stopReason: string | null = null;

  try {
    for await (const event of stream) {
      sendSSEEvent(res, event.type, event);

      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        fullContent += event.delta.text;
      }
      if (event.type === 'message_start' && event.message?.id) {
        messageId = event.message.id;
      }
      if (event.type === 'message_delta') {
        if (event.usage) {
          outputTokens = event.usage.output_tokens || 0;
        }
        if (event.delta?.stop_reason) {
          stopReason = event.delta.stop_reason;
        }
      }
      if (event.type === 'message_start' && event.message?.usage) {
        inputTokens = event.message.usage.input_tokens || 0;
      }
    }

    sendSSEDone(res);

    return {
      content: fullContent,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      messageId,
      stopReason,
    };
  } catch (err) {
    logger.error({ err, requestId }, 'Streaming error');
    sendSSEError(res, 'Streaming error occurred');
    throw err;
  }
}
