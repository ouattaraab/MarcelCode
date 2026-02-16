import { Router, Request, Response } from 'express';
import { CompletionRequest, SYSTEM_PROMPTS, ModelId } from '@marcelia/shared';
import { createMessage } from '../services/foundry.service';
import { routeRequest } from '../services/router.service';
import { trackUsage } from '../services/usage.service';
import { logger } from '../config';

export const completionRoutes = Router();

completionRoutes.post('/', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  const user = (req as any).user;
  const body = req.body as CompletionRequest;

  try {
    const model = routeRequest('completion', undefined, user);
    const startTime = Date.now();

    const prompt = `Language: ${body.language}
File: ${body.filePath}

Code before cursor:
\`\`\`
${body.prefix}
\`\`\`

Code after cursor:
\`\`\`
${body.suffix}
\`\`\`

Complete the code at the cursor position. Return ONLY the completion text.`;

    const response = await createMessage({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: body.maxTokens || 256,
      systemPrompt: SYSTEM_PROMPTS.completion,
    });

    const content =
      response.content[0].type === 'text' ? response.content[0].text : '';

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    };

    trackUsage({
      userId: user.id,
      requestType: 'completion',
      model,
      ...usage,
      latencyMs: Date.now() - startTime,
      cached: false,
      requestId,
    }).catch((err) => logger.error({ err }, 'Usage tracking failed'));

    res.json({
      id: response.id,
      completion: content,
      model,
      usage,
    });
  } catch (err) {
    logger.error({ err, requestId }, 'Completion request failed');
    res.status(500).json({ error: 'Completion failed', code: 'COMPLETION_ERROR', requestId });
  }
});
