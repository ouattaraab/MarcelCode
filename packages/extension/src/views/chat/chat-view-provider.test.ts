import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { ChatViewProvider } from './chat-view-provider';
import { PluginRegistry } from '../../plugin';
import { WorkspaceScanner } from '../../services/workspace-scanner';
import { StreamingEditorManager } from '../../services/streaming-editor';
import { _setMockConfig, _resetMockConfig } from '../../__mocks__/vscode';

// ── Helpers ──

function mockRootFolder() {
  return { uri: vscode.Uri.file('/workspace'), name: 'test', index: 0 } as any;
}

/** SSE stream that immediately fires 'done' — no text, no tools */
function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode('event: message_stop\ndata: {}\n\n'));
      controller.close();
    },
  });
}

/** SSE stream that sends a single text delta then stops */
function textStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      // content_block_start
      controller.enqueue(enc.encode('event: content_block_start\ndata: {"index":0,"content_block":{"type":"text","text":""}}\n\n'));
      // text delta
      const delta = JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text },
      });
      controller.enqueue(enc.encode(`event: content_block_delta\ndata: ${delta}\n\n`));
      // content_block_stop
      controller.enqueue(enc.encode('event: content_block_stop\ndata: {"index":0}\n\n'));
      // message_delta with stop_reason
      controller.enqueue(enc.encode('event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":10}}\n\n'));
      // message_stop
      controller.enqueue(enc.encode('event: message_stop\ndata: {}\n\n'));
      controller.close();
    },
  });
}

// ── Factory ──

function makeProvider() {
  const extensionUri = vscode.Uri.file('/ext');

  const mockAuthProvider = {
    isSignedIn: vi.fn().mockReturnValue(true),
    ensureAuthenticated: vi.fn().mockResolvedValue(true),
    onDidChange: vi.fn().mockReturnValue({ dispose: () => {} }),
    getAccessToken: vi.fn().mockResolvedValue('token'),
    signIn: vi.fn().mockResolvedValue(undefined),
  } as any;

  const mockApiClient = {
    postStream: vi.fn().mockResolvedValue(emptyStream()),
  } as any;

  const pluginRegistry = new PluginRegistry();

  const provider = new ChatViewProvider(
    extensionUri,
    mockApiClient,
    mockAuthProvider,
    pluginRegistry,
  );

  return { provider, mockApiClient, mockAuthProvider, pluginRegistry };
}

// ── Tests ──

describe('ChatViewProvider', () => {
  beforeEach(() => {
    _resetMockConfig();
    _setMockConfig('devMode', true);
    _setMockConfig('toolConfirmation', 'none');
    _setMockConfig('workspaceContextEnabled', false);

    // Spy on WorkspaceScanner prototype methods
    vi.spyOn(WorkspaceScanner.prototype, 'getRootFolder').mockReturnValue(mockRootFolder());
    vi.spyOn(WorkspaceScanner.prototype, 'getFileTree').mockResolvedValue(null);
    vi.spyOn(WorkspaceScanner.prototype, 'readFile').mockResolvedValue(null);
    vi.spyOn(WorkspaceScanner.prototype, 'writeFile').mockResolvedValue(true);
    vi.spyOn(WorkspaceScanner.prototype, 'editFile').mockResolvedValue(true);
    vi.spyOn(WorkspaceScanner.prototype, 'createDirectory').mockResolvedValue(true);
    vi.spyOn(WorkspaceScanner.prototype, 'listFiles').mockResolvedValue([]);

    // Spy on StreamingEditorManager prototype methods
    vi.spyOn(StreamingEditorManager.prototype, 'openForStreaming').mockResolvedValue(true);
    vi.spyOn(StreamingEditorManager.prototype, 'appendContent').mockImplementation(() => {});
    vi.spyOn(StreamingEditorManager.prototype, 'finalize').mockResolvedValue(undefined);
    vi.spyOn(StreamingEditorManager.prototype, 'revert').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── trimHistory ──

  describe('trimHistory()', () => {
    it('does nothing when history has <= 50 messages', () => {
      const { provider } = makeProvider();
      const hist: any[] = (provider as any).history;
      for (let i = 0; i < 50; i++) hist.push({ role: 'user', content: `msg-${i}` });
      (provider as any).trimHistory();
      expect(hist).toHaveLength(50);
    });

    it('truncates tool_result content in older messages beyond cutoff', () => {
      const { provider } = makeProvider();
      const hist: any[] = (provider as any).history;
      const longContent = 'x'.repeat(3000);
      hist.push({ role: 'user', content: [{ type: 'tool_result', content: longContent }] });
      for (let i = 0; i < 50; i++) hist.push({ role: 'user', content: 'msg' });
      (provider as any).trimHistory();
      const oldMsg = hist[0];
      expect(oldMsg.content[0].content).toContain('[...tronqué]');
      expect(oldMsg.content[0].content.length).toBeLessThan(longContent.length);
    });

    it('drops oldest messages when history exceeds 2x MAX_HISTORY_MESSAGES', () => {
      const { provider } = makeProvider();
      for (let i = 0; i < 101; i++) {
        (provider as any).history.push({ role: 'user', content: `msg-${i}` });
      }
      (provider as any).trimHistory();
      // trimHistory creates a new array via slice — re-read the reference
      const hist = (provider as any).history;
      expect(hist).toHaveLength(50);
      expect(hist[0].content).toBe('msg-51');
    });

    it('leaves non-tool_result blocks unchanged', () => {
      const { provider } = makeProvider();
      const hist: any[] = (provider as any).history;
      hist.push({ role: 'assistant', content: [{ type: 'text', text: 'hello world' }] });
      for (let i = 0; i < 50; i++) hist.push({ role: 'user', content: 'msg' });
      (provider as any).trimHistory();
      expect(hist[0].content[0].text).toBe('hello world');
    });
  });

  // ── executeTool ──

  describe('executeTool()', () => {
    it('read_file — returns file content on success', async () => {
      const { provider } = makeProvider();
      vi.spyOn(WorkspaceScanner.prototype, 'readFile').mockResolvedValue({
        path: 'src/foo.ts', language: 'typescript', content: 'const x = 1;', lines: 1,
      });
      const result = await (provider as any).executeTool({
        id: 't1', name: 'read_file', input: { path: 'src/foo.ts' },
      });
      expect(result.content).toBe('const x = 1;');
      expect(result.isError).toBeUndefined();
    });

    it('read_file — returns error when file not found', async () => {
      const { provider } = makeProvider();
      vi.spyOn(WorkspaceScanner.prototype, 'readFile').mockResolvedValue(null);
      const result = await (provider as any).executeTool({
        id: 't2', name: 'read_file', input: { path: 'missing.ts' },
      });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('file not found');
    });

    it('write_file — writes file when confirmation is disabled', async () => {
      const { provider } = makeProvider();
      _setMockConfig('toolConfirmation', 'none');
      const result = await (provider as any).executeTool({
        id: 't3', name: 'write_file', input: { path: 'out.ts', content: 'hello' },
      });
      expect(result.content).toContain('written successfully');
    });

    it('write_file — denied when requestInlineConfirmation returns false', async () => {
      const { provider } = makeProvider();
      _setMockConfig('toolConfirmation', 'write-only');
      vi.spyOn(provider as any, 'requestInlineConfirmation').mockResolvedValue(false);
      const result = await (provider as any).executeTool({
        id: 't4', name: 'write_file', input: { path: 'out.ts', content: 'hello' },
      });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('denied');
    });

    it('edit_file — applies edit and returns success', async () => {
      const { provider } = makeProvider();
      _setMockConfig('toolConfirmation', 'none');
      const result = await (provider as any).executeTool({
        id: 't5', name: 'edit_file', input: { path: 'src/a.ts', old_text: 'old', new_text: 'new' },
      });
      expect(result.content).toContain('edited successfully');
    });

    it('create_directory — creates directory', async () => {
      const { provider } = makeProvider();
      const result = await (provider as any).executeTool({
        id: 't6', name: 'create_directory', input: { path: 'src/new-dir' },
      });
      expect(result.content).toContain('Directory created');
    });

    it('list_files — returns file list', async () => {
      const { provider } = makeProvider();
      vi.spyOn(WorkspaceScanner.prototype, 'listFiles').mockResolvedValue(['a.ts', 'b.ts']);
      const result = await (provider as any).executeTool({
        id: 't7', name: 'list_files', input: { path: 'src' },
      });
      expect(result.content).toBe('a.ts\nb.ts');
    });

    it('plugin tool — calls plugin registry', async () => {
      const { provider, pluginRegistry } = makeProvider();
      pluginRegistry.tools.register({
        schema: { name: 'my_tool', description: 'Test', input_schema: { type: 'object', properties: {} } },
        handler: async () => ({ content: 'plugin-result' }),
      });
      const result = await (provider as any).executeTool({
        id: 't8', name: 'my_tool', input: {},
      });
      expect(result.content).toBe('plugin-result');
    });

    it('unknown tool — returns error', async () => {
      const { provider } = makeProvider();
      const result = await (provider as any).executeTool({
        id: 't9', name: 'nonexistent_tool', input: {},
      });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Unknown tool');
    });
  });

  // ── requestInlineConfirmation ──

  describe('requestInlineConfirmation()', () => {
    it('resolves true when approved', async () => {
      const { provider } = makeProvider();
      const confirmPromise = (provider as any).requestInlineConfirmation('tool-1', 'Écrire: foo.ts');
      // Simulate webview approval
      (provider as any).pendingConfirmations.get('tool-1').resolve(true);
      const result = await confirmPromise;
      expect(result).toBe(true);
    });

    it('resolves false when denied', async () => {
      const { provider } = makeProvider();
      const confirmPromise = (provider as any).requestInlineConfirmation('tool-2', 'action');
      (provider as any).pendingConfirmations.get('tool-2').resolve(false);
      expect(await confirmPromise).toBe(false);
    });

    it('auto-denies after 60 seconds timeout', async () => {
      vi.useFakeTimers();
      const { provider } = makeProvider();
      const confirmPromise = (provider as any).requestInlineConfirmation('tool-3', 'action');
      vi.advanceTimersByTime(60001);
      const result = await confirmPromise;
      expect(result).toBe(false);
      expect((provider as any).pendingConfirmations.has('tool-3')).toBe(false);
      vi.useRealTimers();
    });

    it('posts toolConfirmationExpired to webview on timeout (L2)', async () => {
      vi.useFakeTimers();
      const { provider } = makeProvider();
      const postSpy = vi.spyOn(provider as any, 'postToWebview');
      const confirmPromise = (provider as any).requestInlineConfirmation('tool-x', 'action');
      vi.advanceTimersByTime(60001);
      await confirmPromise;
      expect(postSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'toolConfirmationExpired',
        toolId: 'tool-x',
      }));
      vi.useRealTimers();
    });
  });

  // ── handleUserMessage ──

  describe('handleUserMessage()', () => {
    it('shows login screen when not authenticated in non-dev mode', async () => {
      const { provider, mockAuthProvider } = makeProvider();
      _setMockConfig('devMode', false);
      mockAuthProvider.isSignedIn.mockReturnValue(false);
      const postSpy = vi.spyOn(provider as any, 'postToWebview');
      await (provider as any).handleUserMessage('hello');
      expect(postSpy).toHaveBeenCalledWith({ type: 'showLoginScreen' });
    });

    it('dispatches slash command via registry', async () => {
      const { provider, mockApiClient, pluginRegistry } = makeProvider();
      mockApiClient.postStream.mockResolvedValue(emptyStream());
      const executeSpy = vi.spyOn(pluginRegistry.slashCommands, 'execute');
      await (provider as any).handleUserMessage('/test some code');
      expect(executeSpy).toHaveBeenCalledWith('/test', 'some code');
    });

    it('pushes user message to history', async () => {
      const { provider, mockApiClient } = makeProvider();
      mockApiClient.postStream.mockResolvedValue(emptyStream());
      await (provider as any).handleUserMessage('bonjour');
      const hist: any[] = (provider as any).history;
      expect(hist.length).toBeGreaterThanOrEqual(1);
      expect(hist[0]).toMatchObject({ role: 'user' });
    });

    it('sends assistantStart and assistantDone to webview', async () => {
      const { provider, mockApiClient } = makeProvider();
      mockApiClient.postStream.mockResolvedValue(emptyStream());
      const postSpy = vi.spyOn(provider as any, 'postToWebview');
      await (provider as any).handleUserMessage('hello');
      expect(postSpy).toHaveBeenCalledWith({ type: 'assistantStart' });
      expect(postSpy).toHaveBeenCalledWith({ type: 'assistantDone' });
    });

    it('posts error message on API failure', async () => {
      const { provider, mockApiClient } = makeProvider();
      mockApiClient.postStream.mockRejectedValue(new Error('Network error'));
      const postSpy = vi.spyOn(provider as any, 'postToWebview');
      await (provider as any).handleUserMessage('hello');
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', text: 'Network error' }),
      );
    });

    it('redirects to login on 401 error', async () => {
      const { provider, mockApiClient } = makeProvider();
      mockApiClient.postStream.mockRejectedValue(new Error('401 Unauthorized'));
      const postSpy = vi.spyOn(provider as any, 'postToWebview');
      await (provider as any).handleUserMessage('hello');
      expect(postSpy).toHaveBeenCalledWith({ type: 'showLoginScreen' });
    });
  });

  // ── streamWithToolLoop ──

  describe('streamWithToolLoop()', () => {
    it('stops at MAX_TOOL_ROUNDS (20) and posts limit message', async () => {
      const { provider } = makeProvider();
      const postSpy = vi.spyOn(provider as any, 'postToWebview');
      await (provider as any).streamWithToolLoop('system', undefined, 20);
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'assistantDelta',
          text: expect.stringContaining('Limite'),
        }),
      );
      expect(postSpy).toHaveBeenCalledWith({ type: 'assistantDone' });
    });

    it('sends assistantDone on end_turn', async () => {
      const { provider, mockApiClient } = makeProvider();
      mockApiClient.postStream.mockResolvedValue(textStream('Bonjour'));
      const postSpy = vi.spyOn(provider as any, 'postToWebview');
      await (provider as any).streamWithToolLoop('system', undefined, 0);
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'assistantDelta', text: 'Bonjour' }),
      );
      expect(postSpy).toHaveBeenCalledWith({ type: 'assistantDone' });
    });
  });
});
