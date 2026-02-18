import { describe, it, expect, beforeEach } from 'vitest';
import { JsonContentExtractor, ExtractorEvent } from './json-content-extractor';

describe('JsonContentExtractor', () => {
  let events: ExtractorEvent[];
  let extractor: JsonContentExtractor;

  function createExtractor(opts?: { watchKeys?: string[]; streamKey?: string }) {
    events = [];
    extractor = new JsonContentExtractor({
      watchKeys: opts?.watchKeys ?? ['path', 'content'],
      streamKey: opts?.streamKey ?? 'content',
      onEvent: (e) => events.push(e),
    });
    return extractor;
  }

  beforeEach(() => {
    createExtractor();
  });

  describe('key_value extraction', () => {
    it('extracts a simple string key', () => {
      extractor.feed('{"path": "src/index.ts"}');
      expect(events).toEqual([{ type: 'key_value', key: 'path', value: 'src/index.ts' }]);
    });

    it('extracts a key with no spaces around colon', () => {
      extractor.feed('{"path":"hello.txt"}');
      expect(events).toEqual([{ type: 'key_value', key: 'path', value: 'hello.txt' }]);
    });

    it('extracts multiple watched keys', () => {
      extractor.feed('{"path": "a.ts", "other": 123, "content": "code"}');
      const keyValues = events.filter((e) => e.type === 'key_value');
      expect(keyValues).toEqual([{ type: 'key_value', key: 'path', value: 'a.ts' }]);
      // content is the streamKey — it emits content_chunk + content_done, not key_value
    });

    it('ignores non-watched keys', () => {
      extractor.feed('{"unknown": "value", "path": "ok.ts"}');
      expect(events).toEqual([{ type: 'key_value', key: 'path', value: 'ok.ts' }]);
    });
  });

  describe('content streaming', () => {
    it('streams content as chunks and emits content_done', () => {
      extractor.feed('{"content": "hello"}');
      expect(events).toEqual([
        { type: 'content_chunk', value: 'h' },
        { type: 'content_chunk', value: 'e' },
        { type: 'content_chunk', value: 'l' },
        { type: 'content_chunk', value: 'l' },
        { type: 'content_chunk', value: 'o' },
        { type: 'content_done' },
      ]);
    });

    it('streams content across multiple feed calls', () => {
      extractor.feed('{"content": "he');
      extractor.feed('llo"}');
      const chunks = events.filter((e) => e.type === 'content_chunk').map((e) => (e as any).value);
      expect(chunks.join('')).toBe('hello');
      expect(events[events.length - 1]).toEqual({ type: 'content_done' });
    });

    it('handles path before content', () => {
      extractor.feed('{"path": "test.ts", "content": "abc"}');
      expect(events[0]).toEqual({ type: 'key_value', key: 'path', value: 'test.ts' });
      const chunks = events.filter((e) => e.type === 'content_chunk').map((e) => (e as any).value);
      expect(chunks.join('')).toBe('abc');
      expect(events[events.length - 1]).toEqual({ type: 'content_done' });
    });
  });

  describe('JSON escape handling', () => {
    it('decodes \\n as newline', () => {
      extractor.feed('{"content": "a\\nb"}');
      const chunks = events.filter((e) => e.type === 'content_chunk').map((e) => (e as any).value);
      expect(chunks.join('')).toBe('a\nb');
    });

    it('decodes \\\\ as backslash', () => {
      extractor.feed('{"content": "a\\\\b"}');
      const chunks = events.filter((e) => e.type === 'content_chunk').map((e) => (e as any).value);
      expect(chunks.join('')).toBe('a\\b');
    });

    it('decodes \\" as quote', () => {
      extractor.feed('{"content": "a\\"b"}');
      const chunks = events.filter((e) => e.type === 'content_chunk').map((e) => (e as any).value);
      expect(chunks.join('')).toBe('a"b');
    });

    it('decodes \\t as tab', () => {
      extractor.feed('{"content": "a\\tb"}');
      const chunks = events.filter((e) => e.type === 'content_chunk').map((e) => (e as any).value);
      expect(chunks.join('')).toBe('a\tb');
    });

    it('decodes \\uXXXX unicode escape', () => {
      extractor.feed('{"content": "\\u0041"}');
      const chunks = events.filter((e) => e.type === 'content_chunk').map((e) => (e as any).value);
      expect(chunks.join('')).toBe('A');
    });

    it('handles escape split across fragments', () => {
      extractor.feed('{"content": "a\\');
      extractor.feed('nb"}');
      const chunks = events.filter((e) => e.type === 'content_chunk').map((e) => (e as any).value);
      expect(chunks.join('')).toBe('a\nb');
    });

    it('handles unicode escape split across fragments', () => {
      extractor.feed('{"content": "\\u00');
      extractor.feed('41"}');
      const chunks = events.filter((e) => e.type === 'content_chunk').map((e) => (e as any).value);
      expect(chunks.join('')).toBe('A');
    });
  });

  describe('fragment splitting', () => {
    it('handles key split across fragments', () => {
      extractor.feed('{"pa');
      extractor.feed('th": "ok.ts"}');
      expect(events).toEqual([{ type: 'key_value', key: 'path', value: 'ok.ts' }]);
    });

    it('handles colon in next fragment', () => {
      extractor.feed('{"path"');
      extractor.feed(': "file.ts"}');
      expect(events).toEqual([{ type: 'key_value', key: 'path', value: 'file.ts' }]);
    });

    it('handles very small fragments (char by char)', () => {
      const json = '{"path": "x.ts"}';
      for (const ch of json) {
        extractor.feed(ch);
      }
      expect(events).toEqual([{ type: 'key_value', key: 'path', value: 'x.ts' }]);
    });
  });

  describe('non-string values', () => {
    it('skips numeric values and continues', () => {
      extractor.feed('{"count": 42, "path": "a.ts"}');
      expect(events).toEqual([{ type: 'key_value', key: 'path', value: 'a.ts' }]);
    });

    it('skips boolean values and continues', () => {
      extractor.feed('{"enabled": true, "path": "b.ts"}');
      expect(events).toEqual([{ type: 'key_value', key: 'path', value: 'b.ts' }]);
    });
  });

  describe('reset', () => {
    it('resets state for reuse', () => {
      extractor.feed('{"path": "first.ts"}');
      expect(events).toHaveLength(1);

      extractor.reset();
      events = [];
      extractor = new JsonContentExtractor({
        watchKeys: ['path', 'content'],
        streamKey: 'content',
        onEvent: (e) => events.push(e),
      });

      extractor.feed('{"path": "second.ts"}');
      expect(events).toEqual([{ type: 'key_value', key: 'path', value: 'second.ts' }]);
    });
  });

  describe('realistic write_file scenario', () => {
    it('extracts path then streams content from typical API fragments', () => {
      // Simulate how Anthropic API sends input_json_delta fragments
      const fragments = [
        '{"pa',
        'th": "src/com',
        'ponents/Button.tsx",',
        ' "content": "import React',
        ' from \'react\';\\n\\nexport ',
        'const Button = () => {\\n',
        '  return <button>Click</button>;\\n',
        '};\\n"}',
      ];

      for (const f of fragments) {
        extractor.feed(f);
      }

      const pathEvent = events.find((e) => e.type === 'key_value');
      expect(pathEvent).toEqual({
        type: 'key_value',
        key: 'path',
        value: 'src/components/Button.tsx',
      });

      const chunks = events
        .filter((e) => e.type === 'content_chunk')
        .map((e) => (e as any).value)
        .join('');

      expect(chunks).toBe(
        "import React from 'react';\n\nexport const Button = () => {\n  return <button>Click</button>;\n};\n",
      );

      expect(events[events.length - 1]).toEqual({ type: 'content_done' });
    });
  });
});
