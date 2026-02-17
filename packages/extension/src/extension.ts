import * as vscode from 'vscode';
import { AuthProvider } from './auth/auth-provider';
import { ApiClient } from './services/api-client';
import { ChatViewProvider } from './views/chat/chat-view-provider';
import { MarceliaCompletionProvider } from './providers/completion-provider';
import { MarceliaCodeActionProvider } from './providers/code-action-provider';
import { registerCommands } from './commands';

let authProvider: AuthProvider;
let apiClient: ApiClient;

export function activate(context: vscode.ExtensionContext) {
  // Initialize auth & API client
  authProvider = new AuthProvider();
  apiClient = new ApiClient(authProvider);

  // Register chat webview
  const chatViewProvider = new ChatViewProvider(context.extensionUri, apiClient);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('marcelia.chatView', chatViewProvider),
  );

  // Register inline completion provider
  const completionEnabled = vscode.workspace
    .getConfiguration('marcelia')
    .get('completionEnabled', true);

  if (completionEnabled) {
    const completionProvider = new MarceliaCompletionProvider(apiClient);
    context.subscriptions.push(
      vscode.languages.registerInlineCompletionItemProvider(
        { pattern: '**' },
        completionProvider,
      ),
    );
  }

  // Register code action provider
  const codeActionProvider = new MarceliaCodeActionProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider('*', codeActionProvider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
  );

  // Register commands
  registerCommands(context, authProvider, apiClient, chatViewProvider);

  // Auto-sign in silently (skip in devMode)
  const devMode = vscode.workspace.getConfiguration('marcelia').get('devMode', false);
  if (devMode) {
    vscode.window.showInformationMessage("Marcel'IA: Mode développement activé (proxy local)");
  } else {
    authProvider.getSession().then((session) => {
      if (session) {
        vscode.window.showInformationMessage(
          `Marcel'IA: Connecté en tant que ${session.account.label}`,
        );
      }
    }).catch(() => {
      // Silent auth failed, user can sign in manually
    });
  }

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = "$(hubot) Marcel'IA";
  statusBar.command = 'marcelia.chat';
  statusBar.tooltip = "Ouvrir le chat Marcel'IA";
  statusBar.show();
  context.subscriptions.push(statusBar);

  console.log("Marcel'IA extension activated");
}

export function deactivate() {
  console.log("Marcel'IA extension deactivated");
}
