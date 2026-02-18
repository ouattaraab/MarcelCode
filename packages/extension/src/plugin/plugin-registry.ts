import { ToolRegistry } from './tool-registry';
import { SlashCommandRegistry } from './slash-command-registry';
import { PromptTransformerPipeline } from './prompt-transformer-pipeline';
import { MessagePipeline } from './message-pipeline';
import { MarceliaPluginAPI } from './types';

export class PluginRegistry {
  readonly tools = new ToolRegistry();
  readonly slashCommands = new SlashCommandRegistry();
  readonly promptTransformers = new PromptTransformerPipeline();
  readonly messagePipeline = new MessagePipeline();

  getPublicAPI(): MarceliaPluginAPI {
    return {
      tools: {
        register: (tool) => this.tools.register(tool),
      },
      slashCommands: {
        register: (command) => this.slashCommands.register(command),
      },
      promptTransformers: {
        register: (transformer, priority?) => this.promptTransformers.register(transformer, priority),
      },
      messagePipeline: {
        registerPreprocessor: (fn, priority?) => this.messagePipeline.registerPreprocessor(fn, priority),
        registerPostprocessor: (fn, priority?) => this.messagePipeline.registerPostprocessor(fn, priority),
      },
    };
  }

  dispose(): void {
    this.tools.dispose();
    this.slashCommands.dispose();
    this.promptTransformers.dispose();
    this.messagePipeline.dispose();
  }
}
