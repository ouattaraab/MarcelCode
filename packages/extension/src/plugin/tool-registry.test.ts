import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from './tool-registry';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('registers a tool and returns disposable', () => {
    const disposable = registry.register({
      schema: { name: 'test_tool', description: 'Test', input_schema: { type: 'object', properties: {} } },
      handler: async () => ({ content: 'ok' }),
    });
    expect(registry.has('test_tool')).toBe(true);
    expect(disposable).toBeDefined();
  });

  it('unregisters tool via disposable', () => {
    const disposable = registry.register({
      schema: { name: 'test_tool', description: 'Test', input_schema: { type: 'object', properties: {} } },
      handler: async () => ({ content: 'ok' }),
    });
    disposable.dispose();
    expect(registry.has('test_tool')).toBe(false);
  });

  it('rejects built-in tool names', () => {
    expect(() => registry.register({
      schema: { name: 'read_file', description: 'Fake', input_schema: { type: 'object', properties: {} } },
      handler: async () => ({ content: 'ok' }),
    })).toThrow('reserved for built-in');
  });

  it('rejects duplicate tool names', () => {
    registry.register({
      schema: { name: 'my_tool', description: 'First', input_schema: { type: 'object', properties: {} } },
      handler: async () => ({ content: 'ok' }),
    });
    expect(() => registry.register({
      schema: { name: 'my_tool', description: 'Second', input_schema: { type: 'object', properties: {} } },
      handler: async () => ({ content: 'ok' }),
    })).toThrow('already registered');
  });

  it('getSchemas returns all registered tool schemas', () => {
    registry.register({
      schema: { name: 'tool_a', description: 'A', input_schema: { type: 'object', properties: {} } },
      handler: async () => ({ content: 'a' }),
    });
    registry.register({
      schema: { name: 'tool_b', description: 'B', input_schema: { type: 'object', properties: {} } },
      handler: async () => ({ content: 'b' }),
    });
    const schemas = registry.getSchemas();
    expect(schemas).toHaveLength(2);
    expect(schemas.map((s) => s.name)).toEqual(['tool_a', 'tool_b']);
  });

  it('executes a tool handler', async () => {
    registry.register({
      schema: { name: 'greet', description: 'Greet', input_schema: { type: 'object', properties: {} } },
      handler: async (input) => ({ content: `Hello ${input.name}` }),
    });
    const result = await registry.execute('greet', { name: 'World' });
    expect(result.content).toBe('Hello World');
    expect(result.isError).toBeUndefined();
  });

  it('returns error for unknown tool', async () => {
    const result = await registry.execute('nonexistent', {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Unknown plugin tool');
  });

  it('catches handler errors', async () => {
    registry.register({
      schema: { name: 'fail', description: 'Fails', input_schema: { type: 'object', properties: {} } },
      handler: async () => { throw new Error('Boom'); },
    });
    const result = await registry.execute('fail', {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Boom');
  });

  it('dispose clears all tools', () => {
    registry.register({
      schema: { name: 'tool_x', description: 'X', input_schema: { type: 'object', properties: {} } },
      handler: async () => ({ content: 'x' }),
    });
    registry.dispose();
    expect(registry.has('tool_x')).toBe(false);
    expect(registry.getSchemas()).toHaveLength(0);
  });
});
