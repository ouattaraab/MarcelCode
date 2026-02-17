import Anthropic from '@anthropic-ai/sdk';
import { env, logger } from '../config';
import { ModelId } from '@marcelia/shared';

let client: Anthropic;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });
    logger.info('Anthropic client initialized (direct API)');
  }
  return client;
}

export interface FoundryStreamOptions {
  model: ModelId;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens: number;
  systemPrompt?: string;
}

export async function createStream(options: FoundryStreamOptions) {
  const anthropic = getClient();

  const stream = anthropic.messages.stream({
    model: options.model,
    max_tokens: options.maxTokens,
    system: options.systemPrompt || undefined,
    messages: options.messages,
  });

  return stream;
}

export async function createMessage(options: FoundryStreamOptions) {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: options.model,
    max_tokens: options.maxTokens,
    system: options.systemPrompt || undefined,
    messages: options.messages,
  });

  return response;
}
