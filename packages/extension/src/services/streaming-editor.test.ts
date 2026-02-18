import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamingEditorManager } from './streaming-editor';
import * as vscode from 'vscode';

// Helper: create a mock WorkspaceFolder
function mockRootFolder(path = '/workspace') {
  return { uri: vscode.Uri.file(path), name: 'test-workspace', index: 0 } as any;
}

// Helper: wait for flush timers
function flushTimers() {
  return new Promise<void>((resolve) => setTimeout(resolve, 50));
}

describe('StreamingEditorManager', () => {
  let manager: StreamingEditorManager;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeFileSpy: any;
  let createDirSpy: any;
  let deleteSpy: any;
  let openDocSpy: any;
  let showDocSpy: any;
  let applyEditSpy: any;

  // Mock document returned by openTextDocument
  let mockDoc: any;
  let mockEditor: any;

  beforeEach(() => {
    manager = new StreamingEditorManager();

    let docContent = '';
    mockDoc = {
      uri: vscode.Uri.file('/workspace/test.ts'),
      isUntitled: false,
      getText: () => docContent,
      positionAt: (offset: number) => {
        const text = docContent.slice(0, offset);
        const lines = text.split('\n');
        return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
      },
      get lineCount() { return docContent.split('\n').length; },
      lineAt: (line: number) => ({ text: docContent.split('\n')[line] || '' }),
      save: vi.fn().mockResolvedValue(true),
    };

    mockEditor = {
      document: mockDoc,
      revealRange: vi.fn(),
    };

    writeFileSpy = vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    createDirSpy = vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);
    deleteSpy = vi.spyOn(vscode.workspace.fs, 'delete').mockResolvedValue(undefined);
    openDocSpy = vi.spyOn(vscode.workspace, 'openTextDocument').mockResolvedValue(mockDoc);
    showDocSpy = vi.spyOn(vscode.window, 'showTextDocument').mockResolvedValue(mockEditor);

    // applyEdit simulates inserting text into the document
    applyEditSpy = vi.spyOn(vscode.workspace, 'applyEdit').mockImplementation(async (edit: any) => {
      const edits = edit.getEdits?.();
      if (edits) {
        for (const e of edits) {
          docContent += e.text;
        }
      }
      return true;
    });
  });

  describe('initial state', () => {
    it('is not active initially', () => {
      expect(manager.isActive).toBe(false);
      expect(manager.currentPath).toBe('');
    });
  });

  describe('openForStreaming', () => {
    it('creates an empty file and opens the editor', async () => {
      const root = mockRootFolder();
      const result = await manager.openForStreaming(root, 'src/hello.ts');

      expect(result).toBe(true);
      expect(manager.isActive).toBe(true);
      expect(manager.currentPath).toBe('src/hello.ts');
      expect(writeFileSpy).toHaveBeenCalledOnce();
      expect(openDocSpy).toHaveBeenCalledOnce();
      expect(showDocSpy).toHaveBeenCalledOnce();
    });

    it('creates parent directories for nested paths', async () => {
      const root = mockRootFolder();
      await manager.openForStreaming(root, 'deep/nested/file.ts');

      expect(createDirSpy).toHaveBeenCalledOnce();
      // The parent URI should be for 'deep/nested'
      const calledUri = createDirSpy.mock.calls[0][0] as any;
      expect(calledUri.path).toContain('deep/nested');
    });

    it('does not create parent dir for root-level file', async () => {
      const root = mockRootFolder();
      await manager.openForStreaming(root, 'file.ts');

      expect(createDirSpy).not.toHaveBeenCalled();
    });

    it('finalizes previous session before opening new one', async () => {
      const root = mockRootFolder();
      await manager.openForStreaming(root, 'first.ts');
      expect(manager.currentPath).toBe('first.ts');

      await manager.openForStreaming(root, 'second.ts');
      expect(manager.currentPath).toBe('second.ts');
      // save() called during finalize of first session
      expect(mockDoc.save).toHaveBeenCalled();
    });

    it('returns false on error', async () => {
      writeFileSpy.mockRejectedValueOnce(new Error('disk full'));
      const root = mockRootFolder();

      const result = await manager.openForStreaming(root, 'fail.ts');
      expect(result).toBe(false);
      expect(manager.isActive).toBe(false);
    });

    it('opens with ViewColumn.Beside and preserveFocus', async () => {
      const root = mockRootFolder();
      await manager.openForStreaming(root, 'test.ts');

      expect(showDocSpy).toHaveBeenCalledWith(mockDoc, expect.objectContaining({
        preview: false,
        preserveFocus: true,
        viewColumn: vscode.ViewColumn.Beside,
      }));
    });
  });

  describe('appendContent', () => {
    it('buffers content and flushes via applyEdit', async () => {
      const root = mockRootFolder();
      await manager.openForStreaming(root, 'test.ts');

      manager.appendContent('line 1\n');
      manager.appendContent('line 2\n');

      await flushTimers();
      expect(applyEditSpy).toHaveBeenCalled();
    });

    it('does not crash when called before editor is open', () => {
      // No openForStreaming — just buffer
      expect(() => manager.appendContent('early content')).not.toThrow();
    });

    it('accumulates multiple chunks into single flush', async () => {
      const root = mockRootFolder();
      await manager.openForStreaming(root, 'test.ts');

      manager.appendContent('a');
      manager.appendContent('b');
      manager.appendContent('c');

      await flushTimers();

      // Should batch into a single applyEdit call
      expect(applyEditSpy).toHaveBeenCalledTimes(1);
    });

    it('auto-scrolls after flushing', async () => {
      const root = mockRootFolder();
      await manager.openForStreaming(root, 'test.ts');

      manager.appendContent('hello\nworld\n');
      await flushTimers();

      expect(mockEditor.revealRange).toHaveBeenCalled();
    });
  });

  describe('finalize', () => {
    it('flushes remaining content and saves', async () => {
      const root = mockRootFolder();
      await manager.openForStreaming(root, 'test.ts');

      manager.appendContent('final content');
      await manager.finalize();

      expect(applyEditSpy).toHaveBeenCalled();
      expect(mockDoc.save).toHaveBeenCalled();
      expect(manager.isActive).toBe(false);
      expect(manager.currentPath).toBe('');
    });

    it('is safe to call multiple times', async () => {
      const root = mockRootFolder();
      await manager.openForStreaming(root, 'test.ts');

      await manager.finalize();
      await manager.finalize();
      expect(manager.isActive).toBe(false);
    });

    it('is safe to call without opening first', async () => {
      await manager.finalize();
      expect(manager.isActive).toBe(false);
    });

    it('clears pending content if no doc was opened', async () => {
      // Simulate content arriving but openForStreaming failed
      manager.appendContent('orphaned content');
      await manager.finalize();
      expect(manager.isActive).toBe(false);
    });
  });

  describe('revert', () => {
    it('deletes the file and clears state', async () => {
      const root = mockRootFolder();
      await manager.openForStreaming(root, 'to-delete.ts');

      await manager.revert(root, 'to-delete.ts');
      expect(deleteSpy).toHaveBeenCalledOnce();
      expect(manager.isActive).toBe(false);
    });

    it('handles delete error gracefully', async () => {
      deleteSpy.mockRejectedValueOnce(new Error('not found'));
      const root = mockRootFolder();

      await expect(manager.revert(root, 'nonexistent.ts')).resolves.not.toThrow();
      expect(manager.isActive).toBe(false);
    });

    it('clears pending content', async () => {
      const root = mockRootFolder();
      await manager.openForStreaming(root, 'test.ts');
      manager.appendContent('should be discarded');

      await manager.revert(root, 'test.ts');
      expect(manager.isActive).toBe(false);
    });
  });

  describe('multi-file workflow', () => {
    it('handles sequential file streaming', async () => {
      const root = mockRootFolder();

      // First file
      await manager.openForStreaming(root, 'file1.ts');
      manager.appendContent('content1');
      await flushTimers();
      await manager.finalize();

      // Second file
      await manager.openForStreaming(root, 'file2.ts');
      manager.appendContent('content2');
      await flushTimers();
      await manager.finalize();

      expect(manager.isActive).toBe(false);
      // writeFile called twice (once per openForStreaming)
      expect(writeFileSpy).toHaveBeenCalledTimes(2);
      // save called: finalize of file1 + finalize from openForStreaming(file2) + finalize of file2
      expect(mockDoc.save.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
