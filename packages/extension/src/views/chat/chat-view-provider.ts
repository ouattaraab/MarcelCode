import * as vscode from 'vscode';
import { ApiClient } from '../../services/api-client';
import { parseSSEStream, ToolCallData } from '../../services/streaming-client';
import { collectContext } from '../../services/context-collector';
import { WorkspaceScanner } from '../../services/workspace-scanner';
import { JsonContentExtractor } from '../../services/json-content-extractor';
import { StreamingEditorManager } from '../../services/streaming-editor';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | any[];
}

interface PendingToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

const SLASH_COMMANDS: Record<string, string> = {
  '/test': 'Génère des tests unitaires pour ce code :',
  '/doc': 'Génère la documentation pour ce code :',
  '/review': 'Fais une revue de ce code et identifie les problèmes :',
  '/explain': 'Explique ce code en détail :',
};

const MAX_TOOL_ROUNDS = 20;

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private webviewView?: vscode.WebviewView;
  private history: ChatMessage[] = [];
  private workspaceScanner: WorkspaceScanner;
  private streamingEditor: StreamingEditorManager;
  private activeExtractors: Map<string, JsonContentExtractor> = new Map();
  private pendingConfirmations: Map<string, { resolve: (approved: boolean) => void }> = new Map();
  private streamedToolPaths: Map<string, string> = new Map();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly apiClient: ApiClient,
  ) {
    this.workspaceScanner = new WorkspaceScanner();
    this.streamingEditor = new StreamingEditorManager();
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'sendMessage':
          await this.handleUserMessage(message.text);
          break;
        case 'clearHistory':
          this.history = [];
          break;
        case 'toolApproval': {
          const pending = this.pendingConfirmations.get(message.toolId);
          if (pending) {
            this.pendingConfirmations.delete(message.toolId);
            pending.resolve(message.approved);
          }
          break;
        }
      }
    });
  }

  async sendMessageToChat(text: string) {
    if (this.webviewView) {
      this.webviewView.webview.postMessage({ type: 'setInput', text });
    }
  }

  private async handleUserMessage(text: string) {
    let processedText = text;
    for (const [cmd, prompt] of Object.entries(SLASH_COMMANDS)) {
      if (text.startsWith(cmd)) {
        processedText = `${prompt}\n${text.slice(cmd.length).trim()}`;
        break;
      }
    }

    const ctx = collectContext();
    let systemInfo = '';
    if (ctx.currentFile) {
      systemInfo = `[Current file: ${ctx.currentFile}, Language: ${ctx.currentLanguage}]`;
    }

    this.history.push({ role: 'user', content: processedText });

    this.postToWebview({ type: 'userMessage', text });
    this.postToWebview({ type: 'assistantStart' });

    try {
      const config = vscode.workspace.getConfiguration('marcelia');
      const workspaceEnabled = config.get<boolean>('workspaceContextEnabled', true);
      let codebaseContext: any = undefined;

      if (workspaceEnabled) {
        const treeCtx = await this.workspaceScanner.getFileTree();
        if (treeCtx) {
          const activeFiles: Array<{ path: string; language: string; content: string }> = [];

          if (ctx.currentFile) {
            const relPath = vscode.workspace.asRelativePath(ctx.currentFile, false);
            const fileContent = await this.workspaceScanner.readFile(relPath);
            if (fileContent) {
              activeFiles.push({
                path: fileContent.path,
                language: fileContent.language,
                content: fileContent.content,
              });
            }
          }

          codebaseContext = {
            rootName: treeCtx.rootName,
            fileTree: treeCtx.fileTree,
            files: activeFiles.length > 0 ? activeFiles : undefined,
          };

          this.postToWebview({
            type: 'workspaceInfo',
            text: `Workspace: ${treeCtx.rootName} (${treeCtx.totalFiles} fichiers)`,
          });
        }
      }

      const systemPrompt = systemInfo
        ? `Tu es Marcel'IA, un assistant IA de développement pour les développeurs ERANOVE/GS2E. Réponds toujours en français. ${systemInfo}`
        : "Tu es Marcel'IA, un assistant IA de développement pour les développeurs ERANOVE/GS2E. Réponds toujours en français.";

      await this.streamWithToolLoop(systemPrompt, codebaseContext);

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      this.postToWebview({ type: 'error', text: errMsg });
    }
  }

  private async streamWithToolLoop(
    systemPrompt: string,
    codebaseContext: any,
    round: number = 0,
  ): Promise<void> {
    if (round >= MAX_TOOL_ROUNDS) {
      this.postToWebview({ type: 'assistantDelta', text: '\n\n[Limite de tours atteinte]' });
      this.postToWebview({ type: 'assistantDone' });
      return;
    }

    const requestBody: any = {
      messages: this.history,
      systemPrompt,
      codebaseContext,
    };

    const stream = await this.apiClient.postStream('/chat', requestBody);

    let fullResponse = '';
    const pendingToolCalls: ToolCallData[] = [];
    let stopReason = 'end_turn';

    await parseSSEStream(stream, {
      onText: (text) => {
        fullResponse += text;
        this.postToWebview({ type: 'assistantDelta', text });
      },

      onToolStart: (toolId, toolName) => {
        this.postToWebview({ type: 'toolStart', toolId, toolName });

        // For write_file, set up real-time content extraction
        if (toolName === 'write_file') {
          const extractor = new JsonContentExtractor({
            watchKeys: ['path', 'content'],
            streamKey: 'content',
            onEvent: (event) => {
              if (event.type === 'key_value' && event.key === 'path') {
                this.streamedToolPaths.set(toolId, event.value);
                this.postToWebview({ type: 'toolPath', toolId, path: event.value });
                this.startStreamingToEditor(event.value);
              } else if (event.type === 'content_chunk') {
                this.streamingEditor.appendContent(event.value);
              } else if (event.type === 'content_done') {
                this.streamingEditor.finalize();
                this.postToWebview({ type: 'toolContentDone', toolId });
              }
            },
          });
          this.activeExtractors.set(toolId, extractor);
        }
      },

      onToolInputDelta: (toolId, _toolName, partialJson) => {
        const extractor = this.activeExtractors.get(toolId);
        if (extractor) {
          extractor.feed(partialJson);
        }
      },

      onToolUse: (toolCall) => {
        this.activeExtractors.delete(toolCall.id);
        pendingToolCalls.push(toolCall);
        this.postToWebview({
          type: 'toolAction',
          toolId: toolCall.id,
          tool: toolCall.name,
          path: toolCall.input.path || '',
        });
      },

      onStopReason: (reason) => {
        stopReason = reason;
      },
      onDone: () => {},
      onError: (error) => {
        this.postToWebview({ type: 'error', text: error });
      },
    });

    if (stopReason === 'tool_use' && pendingToolCalls.length > 0) {
      const assistantContent: any[] = [];
      if (fullResponse) {
        assistantContent.push({ type: 'text', text: fullResponse });
      }
      for (const tc of pendingToolCalls) {
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }
      this.history.push({ role: 'assistant', content: assistantContent });

      const toolResultBlocks: any[] = [];
      for (const toolCall of pendingToolCalls) {
        const result = await this.executeTool(toolCall);
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: result.toolCallId,
          content: result.content,
          is_error: result.isError || false,
        });
      }

      this.history.push({ role: 'user', content: toolResultBlocks });
      await this.streamWithToolLoop(systemPrompt, codebaseContext, round + 1);
    } else {
      this.history.push({ role: 'assistant', content: fullResponse });
      this.postToWebview({ type: 'assistantDone' });
    }
  }

  private async startStreamingToEditor(relativePath: string): Promise<void> {
    const rootFolder = this.workspaceScanner.getRootFolder();
    if (!rootFolder) return;
    await this.streamingEditor.openForStreaming(rootFolder, relativePath);
  }

  private async executeTool(toolCall: ToolCallData): Promise<PendingToolResult> {
    const { id, name, input } = toolCall;
    const config = vscode.workspace.getConfiguration('marcelia');
    const confirmLevel = config.get<string>('toolConfirmation', 'write-only');
    const rootFolder = this.workspaceScanner.getRootFolder();

    try {
      switch (name) {
        case 'read_file': {
          const file = await this.workspaceScanner.readFile(input.path);
          if (!file) {
            return { toolCallId: id, content: `Error: file not found: ${input.path}`, isError: true };
          }
          this.postToWebview({ type: 'toolStatus', toolId: id, status: 'done', label: `Lu: ${input.path}` });
          return { toolCallId: id, content: file.content };
        }

        case 'write_file': {
          const wasStreamed = this.streamedToolPaths.has(id);
          this.streamedToolPaths.delete(id);

          // Ensure any streaming session is finalized before proceeding
          await this.streamingEditor.finalize();

          if (confirmLevel === 'always' || confirmLevel === 'write-only') {
            const confirmed = await this.requestInlineConfirmation(id, `Créer/écrire: ${input.path}`);
            if (!confirmed) {
              if (wasStreamed && rootFolder) {
                await this.streamingEditor.revert(rootFolder, input.path);
              }
              this.postToWebview({ type: 'toolStatus', toolId: id, status: 'denied', label: `Refusé: ${input.path}` });
              return { toolCallId: id, content: 'User denied the file write operation.', isError: true };
            }
          }

          // Always write the full content to ensure the file is complete,
          // even if streaming partially succeeded
          const success = await this.workspaceScanner.writeFile(input.path, input.content);
          if (!success) {
            return { toolCallId: id, content: `Error: could not write file: ${input.path}`, isError: true };
          }

          // If not already open in editor (streaming opened it), open now
          if (!wasStreamed) {
            await this.openFileInEditor(input.path);
          }

          this.postToWebview({ type: 'toolStatus', toolId: id, status: 'done', label: `Créé: ${input.path}` });
          return { toolCallId: id, content: `File written successfully: ${input.path}` };
        }

        case 'edit_file': {
          if (confirmLevel === 'always' || confirmLevel === 'write-only') {
            const confirmed = await this.requestInlineConfirmation(id, `Modifier: ${input.path}`);
            if (!confirmed) {
              this.postToWebview({ type: 'toolStatus', toolId: id, status: 'denied', label: `Refusé: ${input.path}` });
              return { toolCallId: id, content: 'User denied the file edit operation.', isError: true };
            }
          }
          const success = await this.workspaceScanner.editFile(input.path, input.old_text, input.new_text);
          if (!success) {
            return { toolCallId: id, content: `Error: could not edit file (text not found): ${input.path}`, isError: true };
          }
          await this.openFileInEditor(input.path);
          this.postToWebview({ type: 'toolStatus', toolId: id, status: 'done', label: `Modifié: ${input.path}` });
          return { toolCallId: id, content: `File edited successfully: ${input.path}` };
        }

        case 'create_directory': {
          const success = await this.workspaceScanner.createDirectory(input.path);
          if (!success) {
            return { toolCallId: id, content: `Error: could not create directory: ${input.path}`, isError: true };
          }
          this.postToWebview({ type: 'toolStatus', toolId: id, status: 'done', label: `Dossier créé: ${input.path}` });
          return { toolCallId: id, content: `Directory created: ${input.path}` };
        }

        case 'list_files': {
          const files = await this.workspaceScanner.listFiles(input.path, input.pattern);
          this.postToWebview({ type: 'toolStatus', toolId: id, status: 'done', label: `${files.length} fichiers listés` });
          return { toolCallId: id, content: files.join('\n') || 'No files found.' };
        }

        default:
          return { toolCallId: id, content: `Unknown tool: ${name}`, isError: true };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tool execution error';
      return { toolCallId: id, content: `Error: ${msg}`, isError: true };
    }
  }

  private requestInlineConfirmation(toolId: string, action: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.pendingConfirmations.set(toolId, { resolve });
      this.postToWebview({ type: 'toolConfirmation', toolId, action });

      // Auto-deny after 60 seconds
      setTimeout(() => {
        if (this.pendingConfirmations.has(toolId)) {
          this.pendingConfirmations.delete(toolId);
          resolve(false);
        }
      }, 60000);
    });
  }

  private async openFileInEditor(relativePath: string): Promise<void> {
    const rootFolder = this.workspaceScanner.getRootFolder();
    if (!rootFolder) return;
    const uri = vscode.Uri.joinPath(rootFolder.uri, relativePath);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, {
          preview: false,
          preserveFocus: true,
          viewColumn: vscode.ViewColumn.Beside,
        });
        return;
      } catch {
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }
  }

  private postToWebview(message: any) {
    this.webviewView?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    #chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }
    .message {
      margin-bottom: 16px;
      padding: 8px 12px;
      border-radius: 8px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .message.user {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
    }
    .message.assistant {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-editorWidget-border);
    }
    .message .role {
      font-weight: bold;
      font-size: 0.85em;
      margin-bottom: 4px;
      color: var(--vscode-descriptionForeground);
    }
    .message code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 4px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
    }
    .message pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 8px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 8px 0;
    }
    .message pre code {
      background: none;
      padding: 0;
    }
    .typing-indicator {
      opacity: 0.6;
      font-style: italic;
    }
    #input-container {
      padding: 8px 12px;
      border-top: 1px solid var(--vscode-editorWidget-border);
      display: flex;
      gap: 8px;
    }
    #message-input {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 8px;
      font-family: inherit;
      font-size: inherit;
      resize: none;
      min-height: 36px;
      max-height: 120px;
    }
    #message-input:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    #send-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 8px 16px;
      cursor: pointer;
      font-size: inherit;
    }
    #send-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    #send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .toolbar {
      padding: 4px 12px;
      display: flex;
      justify-content: flex-end;
    }
    .toolbar button {
      background: none;
      border: none;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      font-size: 0.85em;
      padding: 2px 8px;
    }
    .toolbar button:hover {
      color: var(--vscode-foreground);
    }
    .error-msg {
      color: var(--vscode-errorForeground);
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      padding: 8px;
      border-radius: 4px;
      margin-bottom: 16px;
    }
    #workspace-info {
      padding: 4px 12px;
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-editorWidget-border);
      display: none;
    }
    .tool-card {
      margin: 8px 0;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--vscode-editorWidget-border);
      background: var(--vscode-editor-background);
      font-size: 0.9em;
      white-space: normal;
    }
    .tool-card .tool-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
      margin-bottom: 2px;
    }
    .tool-card .tool-path {
      color: var(--vscode-textLink-foreground);
      font-family: var(--vscode-editor-font-family);
      font-size: 0.85em;
      margin-bottom: 2px;
    }
    .tool-card .tool-status {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
    .tool-card .tool-status.writing {
      color: var(--vscode-charts-yellow, #cca700);
    }
    .tool-card .tool-status.done {
      color: var(--vscode-charts-green, #388a34);
    }
    .tool-card .tool-status.denied {
      color: var(--vscode-errorForeground);
    }
    .tool-card .tool-progress {
      height: 2px;
      background: var(--vscode-progressBar-background);
      margin-top: 4px;
      border-radius: 1px;
      animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 1; }
    }
    .tool-card .confirm-btns {
      display: flex;
      gap: 8px;
      margin-top: 6px;
      align-items: center;
    }
    .tool-card .confirm-btns .confirm-label {
      font-size: 0.85em;
      flex: 1;
    }
    .tool-card .confirm-btns button {
      padding: 3px 10px;
      border-radius: 3px;
      border: none;
      cursor: pointer;
      font-size: 0.85em;
    }
    .tool-card .btn-approve {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .tool-card .btn-approve:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .tool-card .btn-deny {
      background: var(--vscode-button-secondaryBackground, #333);
      color: var(--vscode-button-secondaryForeground, #fff);
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="clear-btn" title="Effacer l'historique">Effacer</button>
  </div>
  <div id="workspace-info"></div>
  <div id="chat-container"></div>
  <div id="input-container">
    <textarea id="message-input" placeholder="Posez une question... (/test, /doc, /review, /explain)" rows="1"></textarea>
    <button id="send-btn">Envoyer</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const chatContainer = document.getElementById('chat-container');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const clearBtn = document.getElementById('clear-btn');
    let currentAssistantEl = null;
    let isStreaming = false;

    const TOOL_ICONS = {
      'write_file': '\\u{1F4DD}',
      'read_file': '\\u{1F4D6}',
      'edit_file': '\\u270F\\uFE0F',
      'create_directory': '\\u{1F4C1}',
      'list_files': '\\u{1F4CB}',
    };

    const TOOL_LABELS = {
      'write_file': 'Cr\\u00e9ation de fichier',
      'read_file': 'Lecture de fichier',
      'edit_file': 'Modification de fichier',
      'create_directory': 'Cr\\u00e9ation de dossier',
      'list_files': 'Liste des fichiers',
    };

    function addMessage(role, text) {
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.innerHTML = '<div class="role">' + (role === 'user' ? 'Vous' : "Marcel'IA") + '</div><div class="content">' + escapeHtml(text) + '</div>';
      chatContainer.appendChild(div);
      chatContainer.scrollTop = chatContainer.scrollHeight;
      return div;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function getOrCreateToolCard(toolId, toolName) {
      let card = document.getElementById('tool-' + toolId);
      if (card) return card;

      // Make sure typing indicator is removed
      if (currentAssistantEl) {
        const content = currentAssistantEl.querySelector('.content');
        const typing = content.querySelector('.typing-indicator');
        if (typing) typing.remove();
      }

      card = document.createElement('div');
      card.className = 'tool-card';
      card.id = 'tool-' + toolId;

      const icon = TOOL_ICONS[toolName] || '\\u{1F527}';
      const label = TOOL_LABELS[toolName] || toolName;

      card.innerHTML =
        '<div class="tool-header"><span>' + icon + '</span><span>' + label + '</span></div>' +
        '<div class="tool-path"></div>' +
        '<div class="tool-status writing">En cours...</div>' +
        '<div class="tool-progress"></div>';

      if (currentAssistantEl) {
        currentAssistantEl.querySelector('.content').appendChild(card);
      } else {
        chatContainer.appendChild(card);
      }
      chatContainer.scrollTop = chatContainer.scrollHeight;
      return card;
    }

    function sendMessage() {
      const text = messageInput.value.trim();
      if (!text || isStreaming) return;
      vscode.postMessage({ type: 'sendMessage', text });
      messageInput.value = '';
      messageInput.style.height = 'auto';
    }

    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    messageInput.addEventListener('input', () => {
      messageInput.style.height = 'auto';
      messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    });

    clearBtn.addEventListener('click', () => {
      chatContainer.innerHTML = '';
      vscode.postMessage({ type: 'clearHistory' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'userMessage':
          addMessage('user', msg.text);
          break;
        case 'assistantStart':
          isStreaming = true;
          sendBtn.disabled = true;
          currentAssistantEl = addMessage('assistant', '');
          currentAssistantEl.querySelector('.content').innerHTML = '<span class="typing-indicator">En train de r\\u00e9fl\\u00e9chir...</span>';
          break;
        case 'assistantDelta':
          if (currentAssistantEl) {
            const content = currentAssistantEl.querySelector('.content');
            const typing = content.querySelector('.typing-indicator');
            if (typing) typing.remove();
            content.appendChild(document.createTextNode(msg.text));
          }
          chatContainer.scrollTop = chatContainer.scrollHeight;
          break;
        case 'assistantDone':
          isStreaming = false;
          sendBtn.disabled = false;
          currentAssistantEl = null;
          break;

        // Tool lifecycle events
        case 'toolStart': {
          getOrCreateToolCard(msg.toolId, msg.toolName);
          break;
        }
        case 'toolPath': {
          const card = document.getElementById('tool-' + msg.toolId);
          if (card) {
            card.querySelector('.tool-path').textContent = msg.path;
          }
          chatContainer.scrollTop = chatContainer.scrollHeight;
          break;
        }
        case 'toolContentDone': {
          const card = document.getElementById('tool-' + msg.toolId);
          if (card) {
            const status = card.querySelector('.tool-status');
            status.textContent = '\\u00c9criture termin\\u00e9e';
            status.className = 'tool-status done';
            const bar = card.querySelector('.tool-progress');
            if (bar) bar.remove();
          }
          break;
        }
        case 'toolAction': {
          const card = getOrCreateToolCard(msg.toolId || msg.tool, msg.tool);
          if (msg.path && card) {
            card.querySelector('.tool-path').textContent = msg.path;
          }
          break;
        }
        case 'toolStatus': {
          const card = document.getElementById('tool-' + msg.toolId);
          if (card) {
            const status = card.querySelector('.tool-status');
            status.textContent = msg.label;
            status.className = 'tool-status ' + msg.status;
            const bar = card.querySelector('.tool-progress');
            if (bar) bar.remove();
          }
          break;
        }
        case 'toolConfirmation': {
          const card = document.getElementById('tool-' + msg.toolId);
          const target = card || currentAssistantEl?.querySelector('.content');
          if (!target) break;

          // Remove progress bar during confirmation
          if (card) {
            const bar = card.querySelector('.tool-progress');
            if (bar) bar.remove();
            const status = card.querySelector('.tool-status');
            if (status) status.textContent = 'En attente de confirmation...';
          }

          const btns = document.createElement('div');
          btns.className = 'confirm-btns';
          btns.innerHTML =
            '<span class="confirm-label">' + escapeHtml(msg.action) + '</span>' +
            '<button class="btn-approve">Autoriser</button>' +
            '<button class="btn-deny">Refuser</button>';

          btns.querySelector('.btn-approve').addEventListener('click', () => {
            vscode.postMessage({ type: 'toolApproval', toolId: msg.toolId, approved: true });
            btns.innerHTML = '<span class="tool-status done">Autoris\\u00e9</span>';
          });
          btns.querySelector('.btn-deny').addEventListener('click', () => {
            vscode.postMessage({ type: 'toolApproval', toolId: msg.toolId, approved: false });
            btns.innerHTML = '<span class="tool-status denied">Refus\\u00e9</span>';
          });

          (card || target).appendChild(btns);
          chatContainer.scrollTop = chatContainer.scrollHeight;
          break;
        }

        case 'error':
          isStreaming = false;
          sendBtn.disabled = false;
          const errDiv = document.createElement('div');
          errDiv.className = 'error-msg';
          errDiv.textContent = 'Erreur: ' + msg.text;
          chatContainer.appendChild(errDiv);
          chatContainer.scrollTop = chatContainer.scrollHeight;
          break;
        case 'workspaceInfo':
          const wsInfo = document.getElementById('workspace-info');
          wsInfo.textContent = msg.text;
          wsInfo.style.display = 'block';
          break;
        case 'setInput':
          messageInput.value = msg.text;
          messageInput.style.height = 'auto';
          messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
