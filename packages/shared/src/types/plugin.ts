export interface MarceliaToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MarceliaToolResult {
  content: string;
  isError?: boolean;
}

export interface MarceliaSlashCommand {
  trigger: string;
  description: string;
}

export interface PromptContext {
  codebaseContext?: {
    rootName: string;
    fileTree: string;
  };
  model?: string;
  conversationLength?: number;
}

export type MarceliaPromptTransformer = (prompt: string, context: PromptContext) => string;

export type MarceliaMessagePreprocessor = (message: string) => string;

export type MarceliaMessagePostprocessor = (response: string) => string;

export interface MarceliaPluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description?: string;
}
