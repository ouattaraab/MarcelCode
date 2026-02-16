import * as vscode from 'vscode';

export interface CodeContext {
  currentFile: string | undefined;
  currentLanguage: string | undefined;
  selection: string | undefined;
  cursorLine: number | undefined;
  openFiles: string[];
  workspaceLanguages: string[];
}

export function collectContext(): CodeContext {
  const editor = vscode.window.activeTextEditor;

  const openFiles = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .map((tab) => {
      const input = tab.input;
      if (input && typeof input === 'object' && 'uri' in input) {
        return (input as { uri: vscode.Uri }).uri.fsPath;
      }
      return undefined;
    })
    .filter((f): f is string => f !== undefined);

  const workspaceLanguages = [...new Set(openFiles.map((f) => {
    const ext = f.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
      py: 'python', java: 'java', go: 'go', rs: 'rust', rb: 'ruby', cs: 'csharp',
      cpp: 'cpp', c: 'c', php: 'php', swift: 'swift', kt: 'kotlin',
    };
    return ext ? langMap[ext] || ext : undefined;
  }).filter((l): l is string => l !== undefined))];

  return {
    currentFile: editor?.document.uri.fsPath,
    currentLanguage: editor?.document.languageId,
    selection: editor?.selection.isEmpty
      ? undefined
      : editor?.document.getText(editor.selection),
    cursorLine: editor?.selection.active.line,
    openFiles,
    workspaceLanguages,
  };
}

export function getSelectedCodeOrCurrentFile(): { code: string; language: string; filePath: string } | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;

  const selection = editor.selection;
  const code = selection.isEmpty
    ? editor.document.getText()
    : editor.document.getText(selection);

  return {
    code,
    language: editor.document.languageId,
    filePath: vscode.workspace.asRelativePath(editor.document.uri),
  };
}
