import * as vscode from 'vscode';
import { RegisteredSlashCommand } from './types';

export class SlashCommandRegistry {
  private commands = new Map<string, RegisteredSlashCommand>();

  register(command: RegisteredSlashCommand): vscode.Disposable {
    const trigger = command.trigger;
    if (this.commands.has(trigger)) {
      throw new Error(`Slash command "${trigger}" is already registered`);
    }
    this.commands.set(trigger, command);

    return new vscode.Disposable(() => {
      this.unregister(trigger);
    });
  }

  unregister(trigger: string): void {
    this.commands.delete(trigger);
  }

  getAll(): Map<string, RegisteredSlashCommand> {
    return new Map(this.commands);
  }

  execute(trigger: string, args: string): string | null {
    const command = this.commands.get(trigger);
    if (!command) {
      return null;
    }
    return command.handler(args);
  }

  has(trigger: string): boolean {
    return this.commands.has(trigger);
  }

  dispose(): void {
    this.commands.clear();
  }
}
