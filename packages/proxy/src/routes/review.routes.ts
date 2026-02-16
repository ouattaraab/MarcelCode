import { Router, Request, Response } from 'express';
import { ReviewRequest, SYSTEM_PROMPTS, ReviewIssue } from '@marcelia/shared';
import { createMessage } from '../services/foundry.service';
import { routeRequest } from '../services/router.service';
import { trackUsage } from '../services/usage.service';
import { logger } from '../config';

export const reviewRoutes = Router();

reviewRoutes.post('/', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  const user = (req as any).user;
  const body = req.body as ReviewRequest;

  try {
    const model = routeRequest('review', undefined, user);
    const startTime = Date.now();

    const prompt = `Review the following ${body.language} code from file "${body.filePath}":
${body.context ? `\nContext: ${body.context}` : ''}
${body.reviewType ? `\nFocus on: ${body.reviewType}` : ''}

\`\`\`${body.language}
${body.code}
\`\`\`

Respond with a JSON object containing:
- "review": a markdown summary of the review
- "issues": an array of objects with { "severity": "info"|"warning"|"error"|"critical", "line": number|null, "message": string, "suggestion": string|null }`;

    const response = await createMessage({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
      systemPrompt: SYSTEM_PROMPTS.review,
    });

    const content =
      response.content[0].type === 'text' ? response.content[0].text : '';

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    };

    // Parse JSON response
    let review = content;
    let issues: ReviewIssue[] = [];
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        review = parsed.review || content;
        issues = parsed.issues || [];
      }
    } catch {
      // If JSON parsing fails, use raw content as review
    }

    trackUsage({
      userId: user.id,
      requestType: 'review',
      model,
      ...usage,
      latencyMs: Date.now() - startTime,
      cached: false,
      requestId,
    }).catch((err) => logger.error({ err }, 'Usage tracking failed'));

    res.json({
      id: response.id,
      review,
      model,
      usage,
      issues,
    });
  } catch (err) {
    logger.error({ err, requestId }, 'Review request failed');
    res.status(500).json({ error: 'Review failed', code: 'REVIEW_ERROR', requestId });
  }
});
