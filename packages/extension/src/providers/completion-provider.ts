import * as vscode from 'vscode';
import { ApiClient } from '../services/api-client';

export class MarceliaCompletionProvider implements vscode.InlineCompletionItemProvider {
  private debounceTimer: NodeJS.Timeout | undefined;
  private lastRequestAbort: AbortController | undefined;

  constructor(private readonly apiClient: ApiClient) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    // Clear previous debounce
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.lastRequestAbort) {
      this.lastRequestAbort.abort();
    }

    const debounceMs = vscode.workspace
      .getConfiguration('marcelia')
      .get('completionDebounceMs', 300);

    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        if (token.isCancellationRequested) {
          resolve(undefined);
          return;
        }

        try {
          const prefixRange = new vscode.Range(
            new vscode.Position(Math.max(0, position.line - 50), 0),
            position,
          );
          const suffixRange = new vscode.Range(
            position,
            new vscode.Position(Math.min(document.lineCount - 1, position.line + 20), 0),
          );

          const prefix = document.getText(prefixRange);
          const suffix = document.getText(suffixRange);

          // Skip if line is empty or too short
          const currentLine = document.lineAt(position.line).text;
          if (currentLine.trim().length < 2) {
            resolve(undefined);
            return;
          }

          const response = await this.apiClient.post<{ completion: string }>('/completion', {
            prompt: currentLine,
            prefix,
            suffix,
            language: document.languageId,
            filePath: vscode.workspace.asRelativePath(document.uri),
            maxTokens: 256,
          });

          if (token.isCancellationRequested || !response.completion) {
            resolve(undefined);
            return;
          }

          const item = new vscode.InlineCompletionItem(
            response.completion,
            new vscode.Range(position, position),
          );

          resolve([item]);
        } catch {
          resolve(undefined);
        }
      }, debounceMs);
    });
  }
}
