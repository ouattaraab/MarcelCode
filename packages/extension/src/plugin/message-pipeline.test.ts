import { describe, it, expect, beforeEach } from 'vitest';
import { MessagePipeline } from './message-pipeline';

describe('MessagePipeline', () => {
  let pipeline: MessagePipeline;

  beforeEach(() => {
    pipeline = new MessagePipeline();
  });

  describe('preprocess', () => {
    it('returns message unchanged with no preprocessors', () => {
      expect(pipeline.preprocess('hello')).toBe('hello');
    });

    it('applies preprocessor', () => {
      pipeline.registerPreprocessor((msg) => msg.toUpperCase());
      expect(pipeline.preprocess('hello')).toBe('HELLO');
    });

    it('chains preprocessors in priority order', () => {
      pipeline.registerPreprocessor((msg) => msg + '3', 300);
      pipeline.registerPreprocessor((msg) => msg + '1', 100);
      pipeline.registerPreprocessor((msg) => msg + '2', 200);
      expect(pipeline.preprocess('0')).toBe('0123');
    });

    it('unregisters preprocessor via disposable', () => {
      const d = pipeline.registerPreprocessor((msg) => msg + '!');
      d.dispose();
      expect(pipeline.preprocess('hello')).toBe('hello');
    });
  });

  describe('postprocess', () => {
    it('returns response unchanged with no postprocessors', () => {
      expect(pipeline.postprocess('response')).toBe('response');
    });

    it('applies postprocessor', () => {
      pipeline.registerPostprocessor((msg) => msg.trim());
      expect(pipeline.postprocess('  padded  ')).toBe('padded');
    });

    it('chains postprocessors in priority order', () => {
      pipeline.registerPostprocessor((msg) => `[${msg}]`, 200);
      pipeline.registerPostprocessor((msg) => msg.toUpperCase(), 100);
      expect(pipeline.postprocess('hi')).toBe('[HI]');
    });

    it('unregisters postprocessor via disposable', () => {
      const d = pipeline.registerPostprocessor((msg) => msg + '!');
      d.dispose();
      expect(pipeline.postprocess('hello')).toBe('hello');
    });
  });

  describe('dispose', () => {
    it('clears all preprocessors and postprocessors', () => {
      pipeline.registerPreprocessor((msg) => msg + ' pre');
      pipeline.registerPostprocessor((msg) => msg + ' post');
      pipeline.dispose();
      expect(pipeline.preprocess('test')).toBe('test');
      expect(pipeline.postprocess('test')).toBe('test');
    });
  });
});
