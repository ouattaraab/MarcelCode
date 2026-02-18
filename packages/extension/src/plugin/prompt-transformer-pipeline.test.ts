import { describe, it, expect, beforeEach } from 'vitest';
import { PromptTransformerPipeline } from './prompt-transformer-pipeline';

describe('PromptTransformerPipeline', () => {
  let pipeline: PromptTransformerPipeline;

  beforeEach(() => {
    pipeline = new PromptTransformerPipeline();
  });

  it('returns prompt unchanged with no transformers', () => {
    const result = pipeline.transform('Hello', {});
    expect(result).toBe('Hello');
  });

  it('applies a single transformer', () => {
    pipeline.register((prompt) => prompt + ' [enhanced]');
    const result = pipeline.transform('Base prompt', {});
    expect(result).toBe('Base prompt [enhanced]');
  });

  it('chains transformers in priority order', () => {
    pipeline.register((prompt) => prompt + ' [third]', 300);
    pipeline.register((prompt) => prompt + ' [first]', 100);
    pipeline.register((prompt) => prompt + ' [second]', 200);
    const result = pipeline.transform('Start', {});
    expect(result).toBe('Start [first] [second] [third]');
  });

  it('passes context to transformers', () => {
    pipeline.register((prompt, ctx) => {
      if (ctx.codebaseContext) {
        return prompt + ` [workspace: ${ctx.codebaseContext.rootName}]`;
      }
      return prompt;
    });
    const result = pipeline.transform('Prompt', {
      codebaseContext: { rootName: 'my-project', fileTree: '' },
    });
    expect(result).toBe('Prompt [workspace: my-project]');
  });

  it('unregisters via disposable', () => {
    const disposable = pipeline.register((prompt) => prompt + ' [removed]');
    disposable.dispose();
    const result = pipeline.transform('Base', {});
    expect(result).toBe('Base');
  });

  it('dispose clears all transformers', () => {
    pipeline.register((prompt) => prompt + ' [a]');
    pipeline.register((prompt) => prompt + ' [b]');
    pipeline.dispose();
    const result = pipeline.transform('Clean', {});
    expect(result).toBe('Clean');
  });
});
