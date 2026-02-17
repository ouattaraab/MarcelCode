import * as vscode from 'vscode';

/**
 * Manages progressive writing of content into a VS Code editor document.
 * Opens a file, appends content as it streams, and saves when done.
 *
 * Content chunks can arrive BEFORE the editor is open (due to async timing).
 * They are buffered internally and flushed once the editor is ready.
 */
export class StreamingEditorManager {
  private activeDoc: vscode.TextDocument | null = null;
  private activeEditor: vscode.TextEditor | null = null;
  private pendingContent = '';
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;
  private activePath = '';
  private editorReady = false;

  /**
   * Create/open a file and prepare for progressive content writing.
   * Any content chunks received before this completes are buffered and flushed.
   */
  async openForStreaming(rootFolder: vscode.WorkspaceFolder, relativePath: string): Promise<boolean> {
    // Finalize any previous streaming session
    await this.finalize();

    this.activePath = relativePath;
    this.editorReady = false;
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

      this.editorReady = true;

      // Flush any content that arrived while the editor was opening
      if (this.pendingContent) {
        await this.flush();
      }

      return true;
    } catch {
      this.activeDoc = null;
      this.activeEditor = null;
      this.editorReady = false;
      return false;
    }
  }

  /**
   * Append a chunk of content. Always buffers, even if editor isn't open yet.
   * Content is flushed to the editor in batches every 30ms once the editor is ready.
   */
  appendContent(chunk: string): void {
    this.pendingContent += chunk;

    // Only schedule flush if editor is ready
    if (this.editorReady && !this.flushTimer) {
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
    if (this.pendingContent && this.editorReady) {
      await this.flush();
    }
  }

  /**
   * Finalize the current file: flush remaining content and save.
   */
  async finalize(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // If editor isn't ready yet but we have content, we can't flush to editor.
    // Write directly to disk as fallback.
    if (!this.activeDoc && this.pendingContent && this.activePath) {
      // Content arrived but editor never opened — handled by executeTool fallback
      this.pendingContent = '';
      this.activePath = '';
      return;
    }

    if (!this.activeDoc) return;

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
    this.editorReady = false;
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
    this.editorReady = false;

    try {
      const uri = vscode.Uri.joinPath(rootFolder.uri, relativePath);
      await vscode.workspace.fs.delete(uri);
    } catch {
      // File may not exist
    }
  }

  /** Whether a streaming session is currently active */
  get isActive(): boolean {
    return this.activePath !== '';
  }

  get currentPath(): string {
    return this.activePath;
  }
}
