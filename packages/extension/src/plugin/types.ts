import * as vscode from 'vscode';
import {
  MarceliaToolSchema,
  MarceliaToolResult,
  MarceliaSlashCommand,
  MarceliaPromptTransformer,
  MarceliaMessagePreprocessor,
  MarceliaMessagePostprocessor,
} from '@marcelia/shared';

export interface RegisteredTool {
  schema: MarceliaToolSchema;
  handler: (input: Record<string, any>) => Promise<MarceliaToolResult>;
}

export interface RegisteredSlashCommand extends MarceliaSlashCommand {
  handler: (args: string) => string;
}

export interface MarceliaPluginAPI {
  tools: {
    register: (tool: RegisteredTool) => vscode.Disposable;
  };
  slashCommands: {
    register: (command: RegisteredSlashCommand) => vscode.Disposable;
  };
  promptTransformers: {
    register: (transformer: MarceliaPromptTransformer, priority?: number) => vscode.Disposable;
  };
  messagePipeline: {
    registerPreprocessor: (fn: MarceliaMessagePreprocessor, priority?: number) => vscode.Disposable;
    registerPostprocessor: (fn: MarceliaMessagePostprocessor, priority?: number) => vscode.Disposable;
  };
}
