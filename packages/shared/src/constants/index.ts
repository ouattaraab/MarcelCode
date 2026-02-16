export const API_VERSION = 'v1';
export const API_BASE_PATH = `/api/${API_VERSION}`;

export const DEFAULT_MAX_TOKENS = 4096;
export const DEFAULT_RATE_LIMIT = 20; // requests per minute
export const DEFAULT_DAILY_TOKEN_LIMIT = 500_000;
export const DEFAULT_MONTHLY_TOKEN_LIMIT = 10_000_000;

export const COMPLETION_DEBOUNCE_MS = 300;
export const CACHE_TTL_SECONDS = 3600; // 1 hour

export const QUOTA_ALERT_THRESHOLDS = [50, 75, 90, 100];

export const SYSTEM_PROMPTS = {
  review: `You are an expert code reviewer. Analyze the provided code for:
1. Security vulnerabilities
2. Performance issues
3. Code quality and maintainability
4. Best practices adherence

Format your response as structured JSON with an "issues" array and a "review" summary in markdown.`,

  completion: `You are an expert code completion assistant. Complete the code based on the context provided.
Return ONLY the completion text, no explanations or markdown.`,

  explain: `You are a senior developer explaining code to a colleague.
Explain the code clearly and concisely, highlighting key patterns and potential improvements.`,

  generateTests: `You are an expert test engineer. Generate comprehensive unit tests for the provided code.
Use the appropriate testing framework for the language.`,

  generateDocs: `You are a technical writer. Generate clear, comprehensive documentation for the provided code.
Include JSDoc/TSDoc annotations where appropriate.`,
};
