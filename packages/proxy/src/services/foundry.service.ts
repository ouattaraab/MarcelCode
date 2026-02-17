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
  messages: Array<{ role: string; content: any }>;
  maxTokens: number;
  systemPrompt?: string;
  tools?: Array<{ name: string; description: string; input_schema: any }>;
}

export async function createStream(options: FoundryStreamOptions) {
  const anthropic = getClient();

  const params: any = {
    model: options.model,
    max_tokens: options.maxTokens,
    system: options.systemPrompt || undefined,
    messages: options.messages,
  };

  if (options.tools && options.tools.length > 0) {
    params.tools = options.tools;
  }

  const stream = anthropic.messages.stream(params);

  return stream;
}

export async function createMessage(options: FoundryStreamOptions) {
  const anthropic = getClient();

  const params: any = {
    model: options.model,
    max_tokens: options.maxTokens,
    system: options.systemPrompt || undefined,
    messages: options.messages,
  };

  if (options.tools && options.tools.length > 0) {
    params.tools = options.tools;
  }

  const response = await anthropic.messages.create(params);

  return response;
}
