import { Router } from 'express';
import { MarceliaToolSchema } from '@marcelia/shared';
import { ProxyPlugin, ProxyPluginRegistry } from './types';

let plugins: ProxyPlugin[] = [];

export const pluginRegistry: ProxyPluginRegistry = {
  registerPlugin(plugin: ProxyPlugin): void {
    plugins.push(plugin);
  },

  getTools(): MarceliaToolSchema[] {
    const tools: MarceliaToolSchema[] = [];
    for (const plugin of plugins) {
      if (plugin.tools) {
        tools.push(...plugin.tools);
      }
    }
    return tools;
  },

  getPromptExtensions(): string[] {
    const extensions: string[] = [];
    for (const plugin of plugins) {
      if (plugin.promptExtension) {
        extensions.push(plugin.promptExtension);
      }
    }
    return extensions;
  },

  applyRoutes(router: Router): void {
    for (const plugin of plugins) {
      if (plugin.routes) {
        plugin.routes(router);
      }
    }
  },

  applyMiddleware(router: Router): void {
    for (const plugin of plugins) {
      if (plugin.middleware) {
        plugin.middleware(router);
      }
    }
  },

  clear(): void {
    plugins = [];
  },
};
