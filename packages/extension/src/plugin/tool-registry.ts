import * as vscode from 'vscode';
import { MarceliaToolSchema, MarceliaToolResult } from '@marcelia/shared';
import { RegisteredTool } from './types';

const BUILT_IN_TOOLS = new Set([
  'read_file',
  'write_file',
  'edit_file',
  'create_directory',
  'list_files',
]);

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool): vscode.Disposable {
    const name = tool.schema.name;
    if (BUILT_IN_TOOLS.has(name)) {
      throw new Error(`Cannot register tool "${name}": name is reserved for built-in tools`);
    }
    if (this.tools.has(name)) {
      throw new Error(`Tool "${name}" is already registered`);
    }
    this.tools.set(name, tool);

    return new vscode.Disposable(() => {
      this.unregister(name);
    });
  }

  unregister(toolName: string): void {
    this.tools.delete(toolName);
  }

  getSchemas(): MarceliaToolSchema[] {
    return Array.from(this.tools.values()).map((t) => t.schema);
  }

  async execute(name: string, input: Record<string, any>): Promise<MarceliaToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { content: `Unknown plugin tool: ${name}`, isError: true };
    }
    try {
      return await tool.handler(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Plugin tool execution error';
      return { content: `Error: ${msg}`, isError: true };
    }
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  dispose(): void {
    this.tools.clear();
  }
}
