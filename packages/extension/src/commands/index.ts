import * as vscode from 'vscode';
import { AuthProvider } from '../auth/auth-provider';
import { ApiClient } from '../services/api-client';
import { ChatViewProvider } from '../views/chat/chat-view-provider';
import { getSelectedCodeOrCurrentFile } from '../services/context-collector';

export function registerCommands(
  context: vscode.ExtensionContext,
  authProvider: AuthProvider,
  apiClient: ApiClient,
  chatViewProvider: ChatViewProvider,
) {
  // Sign in
  context.subscriptions.push(
    vscode.commands.registerCommand('marcelia.signIn', () => authProvider.signIn()),
  );

  // Sign out
  context.subscriptions.push(
    vscode.commands.registerCommand('marcelia.signOut', () => authProvider.signOut()),
  );

  // Open chat
  context.subscriptions.push(
    vscode.commands.registerCommand('marcelia.chat', () => {
      vscode.commands.executeCommand('marcelia.chatView.focus');
    }),
  );

  // Review code
  context.subscriptions.push(
    vscode.commands.registerCommand('marcelia.reviewCode', async () => {
      const codeInfo = getSelectedCodeOrCurrentFile();
      if (!codeInfo) {
        vscode.window.showWarningMessage("Marcel'IA: Aucun code sélectionné");
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Marcel'IA: Revue du code en cours..." },
        async () => {
          try {
            const result = await apiClient.post<{ review: string; issues: any[] }>('/review', {
              code: codeInfo.code,
              language: codeInfo.language,
              filePath: codeInfo.filePath,
              reviewType: 'full',
            });

            const doc = await vscode.workspace.openTextDocument({
              content: `# Revue de Code - ${codeInfo.filePath}\n\n${result.review}`,
              language: 'markdown',
            });
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
          } catch (err) {
            vscode.window.showErrorMessage(`Marcel'IA: ${err}`);
          }
        },
      );
    }),
  );

  // Explain code
  context.subscriptions.push(
    vscode.commands.registerCommand('marcelia.explainCode', async () => {
      const codeInfo = getSelectedCodeOrCurrentFile();
      if (!codeInfo) {
        vscode.window.showWarningMessage("Marcel'IA: Aucun code sélectionné");
        return;
      }

      chatViewProvider.sendMessageToChat(
        `/explain\n\`\`\`${codeInfo.language}\n${codeInfo.code}\n\`\`\``,
      );
      vscode.commands.executeCommand('marcelia.chatView.focus');
    }),
  );

  // Generate tests
  context.subscriptions.push(
    vscode.commands.registerCommand('marcelia.generateTests', async () => {
      const codeInfo = getSelectedCodeOrCurrentFile();
      if (!codeInfo) {
        vscode.window.showWarningMessage("Marcel'IA: Aucun code sélectionné");
        return;
      }

      chatViewProvider.sendMessageToChat(
        `/test\n\`\`\`${codeInfo.language}\n${codeInfo.code}\n\`\`\``,
      );
      vscode.commands.executeCommand('marcelia.chatView.focus');
    }),
  );

  // Generate docs
  context.subscriptions.push(
    vscode.commands.registerCommand('marcelia.generateDocs', async () => {
      const codeInfo = getSelectedCodeOrCurrentFile();
      if (!codeInfo) {
        vscode.window.showWarningMessage("Marcel'IA: Aucun code sélectionné");
        return;
      }

      chatViewProvider.sendMessageToChat(
        `/doc\n\`\`\`${codeInfo.language}\n${codeInfo.code}\n\`\`\``,
      );
      vscode.commands.executeCommand('marcelia.chatView.focus');
    }),
  );
}
