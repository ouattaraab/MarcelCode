import { Router, Request, Response } from 'express';
import { ChatRequest, DEFAULT_MAX_TOKENS } from '@marcelia/shared';
import { createStream } from '../services/foundry.service';
import { forwardFoundryStream } from '../services/streaming.service';
import { routeRequest } from '../services/router.service';
import { getCachedResponse, setCachedResponse } from '../services/cache.service';
import { trackUsage } from '../services/usage.service';
import { logger } from '../config';

export const chatRoutes = Router();

chatRoutes.post('/', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  const user = (req as any).user;
  const body = req.body as ChatRequest;

  try {
    const model = routeRequest('chat', body.model, user);

    // Check cache
    const cached = await getCachedResponse('chat', body.messages, model);
    if (cached) {
      res.setHeader('X-Cached', 'true');
      res.json({ ...cached, cached: true });
      return;
    }

    const startTime = Date.now();

    // Build enriched system prompt with codebase context
    let systemPrompt = body.systemPrompt || '';
    if (body.codebaseContext) {
      const { rootName, fileTree, files } = body.codebaseContext;
      let codebaseSection = `\nYou have access to the user's workspace "${rootName}".\n\nFile tree:\n${fileTree}\n\nFile contents:\n`;
      for (const file of files) {
        codebaseSection += `--- ${file.path} (${file.language}) ---\n${file.content}\n--- end ---\n\n`;
      }
      codebaseSection += 'Answer questions about this codebase. Reference specific files and line numbers when relevant.';
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n${codebaseSection}`
        : `You are Marcel'IA, an AI coding assistant for ERANOVE/GS2E developers.\n${codebaseSection}`;
    }

    const stream = await createStream({
      model,
      messages: body.messages,
      maxTokens: body.maxTokens || DEFAULT_MAX_TOKENS,
      systemPrompt: systemPrompt || body.systemPrompt,
    });

    const result = await forwardFoundryStream(stream, res, requestId);

    // Track usage async
    trackUsage({
      userId: user.id,
      requestType: 'chat',
      model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      latencyMs: Date.now() - startTime,
      cached: false,
      requestId,
    }).catch((err) => logger.error({ err }, 'Usage tracking failed'));

    // Cache async
    setCachedResponse('chat', body.messages, model, {
      id: result.messageId,
      content: result.content,
      model,
      usage: result.usage,
      cached: false,
    }).catch((err) => logger.error({ err }, 'Cache write failed'));
  } catch (err) {
    logger.error({ err, requestId }, 'Chat request failed');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Chat request failed', code: 'CHAT_ERROR', requestId });
    }
  }
});
