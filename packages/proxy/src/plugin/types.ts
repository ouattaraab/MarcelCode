import { Router } from 'express';
import { MarceliaToolSchema } from '@marcelia/shared';

export interface ProxyPlugin {
  name: string;
  routes?: (router: Router) => void;
  middleware?: (router: Router) => void;
  tools?: MarceliaToolSchema[];
  promptExtension?: string;
}

export interface ProxyPluginRegistry {
  registerPlugin(plugin: ProxyPlugin): void;
  getTools(): MarceliaToolSchema[];
  getPromptExtensions(): string[];
  applyRoutes(router: Router): void;
  applyMiddleware(router: Router): void;
  clear(): void;
}
