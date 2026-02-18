import { describe, it, expect, beforeEach } from 'vitest';
import { SlashCommandRegistry } from './slash-command-registry';

describe('SlashCommandRegistry', () => {
  let registry: SlashCommandRegistry;

  beforeEach(() => {
    registry = new SlashCommandRegistry();
  });

  it('registers a slash command', () => {
    registry.register({
      trigger: '/test',
      description: 'Run tests',
      handler: (args) => `Run tests: ${args}`,
    });
    expect(registry.has('/test')).toBe(true);
  });

  it('executes a slash command', () => {
    registry.register({
      trigger: '/lint',
      description: 'Lint code',
      handler: (args) => `Lint: ${args}`,
    });
    const result = registry.execute('/lint', 'src/');
    expect(result).toBe('Lint: src/');
  });

  it('returns null for unknown command', () => {
    const result = registry.execute('/unknown', 'args');
    expect(result).toBeNull();
  });

  it('rejects duplicate triggers', () => {
    registry.register({ trigger: '/cmd', description: 'A', handler: () => 'a' });
    expect(() =>
      registry.register({ trigger: '/cmd', description: 'B', handler: () => 'b' }),
    ).toThrow('already registered');
  });

  it('unregisters via disposable', () => {
    const disposable = registry.register({
      trigger: '/temp',
      description: 'Temp',
      handler: () => 'temp',
    });
    disposable.dispose();
    expect(registry.has('/temp')).toBe(false);
  });

  it('getAll returns a copy of registered commands', () => {
    registry.register({ trigger: '/a', description: 'A', handler: () => 'a' });
    registry.register({ trigger: '/b', description: 'B', handler: () => 'b' });
    const all = registry.getAll();
    expect(all.size).toBe(2);
    expect(all.has('/a')).toBe(true);
    expect(all.has('/b')).toBe(true);
  });

  it('dispose clears all commands', () => {
    registry.register({ trigger: '/x', description: 'X', handler: () => 'x' });
    registry.dispose();
    expect(registry.has('/x')).toBe(false);
  });
});
