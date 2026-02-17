import { ModelId } from './models';

export interface Message {
  role: 'user' | 'assistant';
  content: string | any[];  // string for text, array for content blocks (tool_use, tool_result)
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface ChatRequest {
  messages: Message[];
  model?: ModelId;
  maxTokens?: number;
  systemPrompt?: string;
  stream?: boolean;
  codebaseContext?: {
    rootName: string;
    fileTree: string;
    files?: Array<{
      path: string;
      language: string;
      content: string;
    }>;
  };
  toolResults?: ToolResult[];
}

export interface CompletionRequest {
  prompt: string;
  prefix: string;
  suffix: string;
  language: string;
  filePath: string;
  maxTokens?: number;
}

export interface ReviewRequest {
  code: string;
  language: string;
  filePath: string;
  context?: string;
  reviewType?: 'security' | 'performance' | 'quality' | 'full';
}

export interface ChatResponse {
  id: string;
  content: string;
  model: ModelId;
  usage: TokenUsage;
  cached: boolean;
}

export interface CompletionResponse {
  id: string;
  completion: string;
  model: ModelId;
  usage: TokenUsage;
}

export interface ReviewResponse {
  id: string;
  review: string;
  model: ModelId;
  usage: TokenUsage;
  issues: ReviewIssue[];
}

export interface ReviewIssue {
  severity: 'info' | 'warning' | 'error' | 'critical';
  line?: number;
  message: string;
  suggestion?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ApiError {
  error: string;
  code: string;
  statusCode: number;
  requestId?: string;
}
