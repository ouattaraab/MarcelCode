import * as vscode from 'vscode';

/**
 * Manages progressive writing of content into a VS Code editor document.
 * Opens a file, appends content as it streams, and saves when done.
 */
export class StreamingEditorManager {
  private activeDoc: vscode.TextDocument | null = null;
  private activeEditor: vscode.TextEditor | null = null;
  private pendingContent = '';
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;
  private activePath = '';

  /**
   * Create/open a file and prepare for progressive content writing.
   * The file is opened in a column beside the chat panel.
   */
  async openForStreaming(rootFolder: vscode.WorkspaceFolder, relativePath: string): Promise<boolean> {
    // Finalize any previous streaming session
    await this.finalize();

    this.activePath = relativePath;
    const uri = vscode.Uri.joinPath(rootFolder.uri, relativePath);

    try {
      // Ensure parent directories exist
      const parentPath = relativePath.split('/').slice(0, -1).join('/');
      if (parentPath) {
        const parentUri = vscode.Uri.joinPath(rootFolder.uri, parentPath);
        await vscode.workspace.fs.createDirectory(parentUri);
      }

      // Create an empty file
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(''));

      // Open in editor beside the chat
      this.activeDoc = await vscode.workspace.openTextDocument(uri);
      this.activeEditor = await vscode.window.showTextDocument(this.activeDoc, {
        preview: false,
        preserveFocus: true,
        viewColumn: vscode.ViewColumn.Beside,
      });

      this.pendingContent = '';
      return true;
    } catch {
      this.activeDoc = null;
      this.activeEditor = null;
      return false;
    }
  }

  /**
   * Append a chunk of content to the open document.
   * Writes are throttled (batched every 30ms) to avoid overwhelming the editor.
   */
  appendContent(chunk: string): void {
    if (!this.activeDoc) return;
    this.pendingContent += chunk;

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, 30);
    }
  }

  private async flush(): Promise<void> {
    if (!this.activeDoc || !this.pendingContent || this.isFlushing) return;

    this.isFlushing = true;
    const text = this.pendingContent;
    this.pendingContent = '';

    try {
      const edit = new vscode.WorkspaceEdit();
      const endPos = this.activeDoc.positionAt(this.activeDoc.getText().length);
      edit.insert(this.activeDoc.uri, endPos, text);
      await vscode.workspace.applyEdit(edit);

      // Auto-scroll to follow the writing
      if (this.activeEditor) {
        const lastLine = this.activeDoc.lineCount - 1;
        const lastChar = this.activeDoc.lineAt(lastLine).text.length;
        this.activeEditor.revealRange(
          new vscode.Range(lastLine, lastChar, lastLine, lastChar),
          vscode.TextEditorRevealType.InCenter,
        );
      }
    } catch {
      // Editor may have been closed by user
    }

    this.isFlushing = false;

    // If more content arrived while flushing, flush again
    if (this.pendingContent) {
      this.flush();
    }
  }

  /**
   * Finalize the current file: flush remaining content and save.
   */
  async finalize(): Promise<void> {
    if (!this.activeDoc) return;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush remaining content
    if (this.pendingContent) {
      await this.flush();
    }

    // Save the file
    try {
      if (!this.activeDoc.isUntitled) {
        await this.activeDoc.save();
      }
    } catch {
      // Ignore save errors
    }

    this.activeDoc = null;
    this.activeEditor = null;
    this.activePath = '';
  }

  /**
   * Revert: cancel streaming and delete the file (used when user denies).
   */
  async revert(rootFolder: vscode.WorkspaceFolder, relativePath: string): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    this.pendingContent = '';
    this.activeDoc = null;
    this.activeEditor = null;
    this.activePath = '';

    try {
      const uri = vscode.Uri.joinPath(rootFolder.uri, relativePath);
      await vscode.workspace.fs.delete(uri);
    } catch {
      // File may not exist
    }
  }

  /** Whether a streaming session is currently active */
  get isActive(): boolean {
    return this.activeDoc !== null;
  }

  get currentPath(): string {
    return this.activePath;
  }
}
