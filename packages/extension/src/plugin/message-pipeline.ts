import * as vscode from 'vscode';
import { MarceliaMessagePreprocessor, MarceliaMessagePostprocessor } from '@marcelia/shared';

interface PrioritizedFn<T> {
  fn: T;
  priority: number;
}

const DEFAULT_PRIORITY = 100;

export class MessagePipeline {
  private preprocessors: PrioritizedFn<MarceliaMessagePreprocessor>[] = [];
  private postprocessors: PrioritizedFn<MarceliaMessagePostprocessor>[] = [];

  registerPreprocessor(fn: MarceliaMessagePreprocessor, priority: number = DEFAULT_PRIORITY): vscode.Disposable {
    const entry: PrioritizedFn<MarceliaMessagePreprocessor> = { fn, priority };
    this.preprocessors.push(entry);
    this.preprocessors.sort((a, b) => a.priority - b.priority);

    return new vscode.Disposable(() => {
      const idx = this.preprocessors.indexOf(entry);
      if (idx >= 0) {
        this.preprocessors.splice(idx, 1);
      }
    });
  }

  registerPostprocessor(fn: MarceliaMessagePostprocessor, priority: number = DEFAULT_PRIORITY): vscode.Disposable {
    const entry: PrioritizedFn<MarceliaMessagePostprocessor> = { fn, priority };
    this.postprocessors.push(entry);
    this.postprocessors.sort((a, b) => a.priority - b.priority);

    return new vscode.Disposable(() => {
      const idx = this.postprocessors.indexOf(entry);
      if (idx >= 0) {
        this.postprocessors.splice(idx, 1);
      }
    });
  }

  preprocess(message: string): string {
    let result = message;
    for (const { fn } of this.preprocessors) {
      result = fn(result);
    }
    return result;
  }

  postprocess(response: string): string {
    let result = response;
    for (const { fn } of this.postprocessors) {
      result = fn(result);
    }
    return result;
  }

  dispose(): void {
    this.preprocessors = [];
    this.postprocessors = [];
  }
}
