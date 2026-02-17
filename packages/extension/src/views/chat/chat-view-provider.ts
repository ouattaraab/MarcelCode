import * as vscode from 'vscode';
import { ApiClient } from '../../services/api-client';
import { parseSSEStream } from '../../services/streaming-client';
import { collectContext } from '../../services/context-collector';
import { WorkspaceScanner } from '../../services/workspace-scanner';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SLASH_COMMANDS: Record<string, string> = {
  '/test': 'Generate unit tests for this code:',
  '/doc': 'Generate documentation for this code:',
  '/review': 'Review this code for issues:',
  '/explain': 'Explain this code in detail:',
};

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private webviewView?: vscode.WebviewView;
  private history: ChatMessage[] = [];
  private workspaceScanner: WorkspaceScanner;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly apiClient: ApiClient,
  ) {
    this.workspaceScanner = new WorkspaceScanner();
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
      }
    });
  }

  async sendMessageToChat(text: string) {
    if (this.webviewView) {
      this.webviewView.webview.postMessage({ type: 'setInput', text });
    }
  }

  private async handleUserMessage(text: string) {
    // Parse slash commands
    let processedText = text;
    for (const [cmd, prompt] of Object.entries(SLASH_COMMANDS)) {
      if (text.startsWith(cmd)) {
        processedText = `${prompt}\n${text.slice(cmd.length).trim()}`;
        break;
      }
    }

    // Add context info
    const ctx = collectContext();
    let systemInfo = '';
    if (ctx.currentFile) {
      systemInfo = `[Current file: ${ctx.currentFile}, Language: ${ctx.currentLanguage}]`;
    }

    this.history.push({ role: 'user', content: processedText });

    // Show user message in webview
    this.postToWebview({ type: 'userMessage', text });

    // Show typing indicator
    this.postToWebview({ type: 'assistantStart' });

    try {
      // Build workspace context if enabled
      const config = vscode.workspace.getConfiguration('marcelia');
      const workspaceEnabled = config.get<boolean>('workspaceContextEnabled', true);
      let codebaseContext: any = undefined;

      if (workspaceEnabled) {
        const wsContext = await this.workspaceScanner.getContext();
        if (wsContext) {
          codebaseContext = {
            rootName: wsContext.rootName,
            fileTree: wsContext.fileTree,
            files: wsContext.files.map(f => ({
              path: f.path,
              language: f.language,
              content: f.content,
            })),
          };
          this.postToWebview({
            type: 'workspaceInfo',
            text: `Contexte workspace: ${wsContext.includedFiles}/${wsContext.totalFiles} fichiers`,
          });
        }
      }

      const stream = await this.apiClient.postStream('/chat', {
        messages: this.history,
        systemPrompt: systemInfo
          ? `You are Marcel'IA, an AI coding assistant for ERANOVE/GS2E developers. ${systemInfo}`
          : "You are Marcel'IA, an AI coding assistant for ERANOVE/GS2E developers.",
        codebaseContext,
      });

      let fullResponse = '';

      await parseSSEStream(stream, {
        onText: (text) => {
          fullResponse += text;
          this.postToWebview({ type: 'assistantDelta', text });
        },
        onDone: () => {
          this.history.push({ role: 'assistant', content: fullResponse });
          this.postToWebview({ type: 'assistantDone' });
        },
        onError: (error) => {
          this.postToWebview({ type: 'error', text: error });
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      this.postToWebview({ type: 'error', text: errMsg });
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
          currentAssistantEl.querySelector('.content').innerHTML = '<span class="typing-indicator">En train de réfléchir...</span>';
          break;
        case 'assistantDelta':
          if (currentAssistantEl) {
            const content = currentAssistantEl.querySelector('.content');
            const typing = content.querySelector('.typing-indicator');
            if (typing) typing.remove();
            content.textContent += msg.text;
          }
          chatContainer.scrollTop = chatContainer.scrollHeight;
          break;
        case 'assistantDone':
          isStreaming = false;
          sendBtn.disabled = false;
          currentAssistantEl = null;
          break;
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
