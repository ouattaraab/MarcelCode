import { describe, it, expect, beforeEach } from 'vitest';
import { pluginRegistry } from './plugin-registry';

// Reset module state between tests by re-importing
// Since pluginRegistry is a singleton, we test its methods directly

describe('ProxyPluginRegistry', () => {
  describe('getTools', () => {
    it('returns empty array when no plugins registered', () => {
      expect(pluginRegistry.getTools()).toEqual([]);
    });

    it('returns tools from registered plugins', () => {
      pluginRegistry.registerPlugin({
        name: 'test-plugin',
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool',
            input_schema: { type: 'object', properties: { msg: { type: 'string' } } },
          },
        ],
      });
      const tools = pluginRegistry.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test_tool');
    });

    it('merges tools from multiple plugins', () => {
      pluginRegistry.registerPlugin({
        name: 'plugin-b',
        tools: [
          {
            name: 'tool_b',
            description: 'Tool B',
            input_schema: { type: 'object', properties: {} },
          },
        ],
      });
      const tools = pluginRegistry.getTools();
      expect(tools.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getPromptExtensions', () => {
    it('returns prompt extensions from plugins', () => {
      pluginRegistry.registerPlugin({
        name: 'prompt-plugin',
        promptExtension: 'Tu parles aussi anglais.',
      });
      const extensions = pluginRegistry.getPromptExtensions();
      expect(extensions).toContain('Tu parles aussi anglais.');
    });

    it('skips plugins without promptExtension', () => {
      const extensions = pluginRegistry.getPromptExtensions();
      // Not all plugins have promptExtension — should not throw
      expect(Array.isArray(extensions)).toBe(true);
    });
  });

  describe('applyRoutes', () => {
    it('calls routes function for each plugin with routes', () => {
      let routesCalled = false;
      pluginRegistry.registerPlugin({
        name: 'routes-plugin',
        routes: () => {
          routesCalled = true;
        },
      });
      pluginRegistry.applyRoutes({} as any);
      expect(routesCalled).toBe(true);
    });
  });

  describe('applyMiddleware', () => {
    it('calls middleware function for each plugin with middleware', () => {
      let middlewareCalled = false;
      pluginRegistry.registerPlugin({
        name: 'middleware-plugin',
        middleware: () => {
          middlewareCalled = true;
        },
      });
      pluginRegistry.applyMiddleware({} as any);
      expect(middlewareCalled).toBe(true);
    });
  });
});
