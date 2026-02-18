import * as vscode from 'vscode';
import { MarceliaPromptTransformer, PromptContext } from '@marcelia/shared';

interface PrioritizedTransformer {
  transformer: MarceliaPromptTransformer;
  priority: number;
}

const DEFAULT_PRIORITY = 100;

export class PromptTransformerPipeline {
  private transformers: PrioritizedTransformer[] = [];

  register(transformer: MarceliaPromptTransformer, priority: number = DEFAULT_PRIORITY): vscode.Disposable {
    const entry: PrioritizedTransformer = { transformer, priority };
    this.transformers.push(entry);
    this.transformers.sort((a, b) => a.priority - b.priority);

    return new vscode.Disposable(() => {
      const idx = this.transformers.indexOf(entry);
      if (idx >= 0) {
        this.transformers.splice(idx, 1);
      }
    });
  }

  transform(prompt: string, context: PromptContext): string {
    let result = prompt;
    for (const { transformer } of this.transformers) {
      result = transformer(result, context);
    }
    return result;
  }

  dispose(): void {
    this.transformers = [];
  }
}
