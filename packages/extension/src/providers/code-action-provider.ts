import * as vscode from 'vscode';

export class MarceliaCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
  ): vscode.CodeAction[] | undefined {
    if (range.isEmpty) return undefined;

    const actions: vscode.CodeAction[] = [];

    const reviewAction = new vscode.CodeAction(
      "Marcel'IA: Review Code",
      vscode.CodeActionKind.QuickFix,
    );
    reviewAction.command = {
      command: 'marcelia.reviewCode',
      title: 'Review Code',
    };
    actions.push(reviewAction);

    const explainAction = new vscode.CodeAction(
      "Marcel'IA: Explain Code",
      vscode.CodeActionKind.QuickFix,
    );
    explainAction.command = {
      command: 'marcelia.explainCode',
      title: 'Explain Code',
    };
    actions.push(explainAction);

    const testAction = new vscode.CodeAction(
      "Marcel'IA: Generate Tests",
      vscode.CodeActionKind.QuickFix,
    );
    testAction.command = {
      command: 'marcelia.generateTests',
      title: 'Generate Tests',
    };
    actions.push(testAction);

    return actions;
  }
}
