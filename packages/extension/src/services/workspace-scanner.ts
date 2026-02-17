import * as vscode from 'vscode';

export interface FileTreeContext {
  rootName: string;
  fileTree: string;
  totalFiles: number;
}

export interface FileContent {
  path: string;
  language: string;
  content: string;
  lines: number;
}

const MAX_FILE_LINES = 500;
const TRUNCATE_HEAD = 200;
const TRUNCATE_TAIL = 100;

const EXCLUDE_PATTERN = '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/out/**,**/.next/**,**/.nuxt/**,**/coverage/**,**/__pycache__/**,**/.venv/**,**/venv/**,**/*.min.js,**/*.min.css,**/*.map,**/*.lock,**/package-lock.json,**/yarn.lock,**/pnpm-lock.yaml,**/*.png,**/*.jpg,**/*.jpeg,**/*.gif,**/*.ico,**/*.svg,**/*.woff,**/*.woff2,**/*.ttf,**/*.eot,**/*.mp3,**/*.mp4,**/*.wav,**/*.pdf,**/*.zip,**/*.tar,**/*.gz,**/*.exe,**/*.dll,**/*.so,**/*.dylib,**/*.bin,**/*.dat,**/*.db,**/*.sqlite}';

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
  py: 'python', java: 'java', go: 'go', rs: 'rust', rb: 'ruby', cs: 'csharp',
  cpp: 'cpp', c: 'c', php: 'php', swift: 'swift', kt: 'kotlin',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
  html: 'html', css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql', graphql: 'graphql', proto: 'protobuf',
  dockerfile: 'dockerfile', makefile: 'makefile',
};

export class WorkspaceScanner {
  private treeCache: FileTreeContext | null = null;
  private treeCacheValid = false;
  private allPaths: string[] = [];
  private disposables: vscode.Disposable[] = [];

  constructor() {
    const watcher = vscode.workspace.onDidSaveTextDocument(() => {
      this.treeCacheValid = false;
    });
    const createWatcher = vscode.workspace.onDidCreateFiles(() => {
      this.treeCacheValid = false;
    });
    const deleteWatcher = vscode.workspace.onDidDeleteFiles(() => {
      this.treeCacheValid = false;
    });
    this.disposables.push(watcher, createWatcher, deleteWatcher);
  }

  getRootFolder(): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.workspaceFolders?.[0];
  }

  async getFileTree(): Promise<FileTreeContext | null> {
    const rootFolder = this.getRootFolder();
    if (!rootFolder) return null;

    if (this.treeCache && this.treeCacheValid) {
      return this.treeCache;
    }

    const uris = await vscode.workspace.findFiles('**/*', EXCLUDE_PATTERN, 1000);
    this.allPaths = uris.map(uri => vscode.workspace.asRelativePath(uri, false)).sort();

    const fileTree = this.buildFileTree(this.allPaths);

    this.treeCache = {
      rootName: rootFolder.name,
      fileTree,
      totalFiles: this.allPaths.length,
    };
    this.treeCacheValid = true;
    return this.treeCache;
  }

  async readFile(relativePath: string): Promise<FileContent | null> {
    const rootFolder = this.getRootFolder();
    if (!rootFolder) return null;

    const uri = vscode.Uri.joinPath(rootFolder.uri, relativePath);
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      let content = new TextDecoder('utf-8').decode(raw);

      if (this.isBinaryContent(content)) return null;

      const lines = content.split('\n');
      const lineCount = lines.length;

      if (lineCount > MAX_FILE_LINES) {
        const head = lines.slice(0, TRUNCATE_HEAD).join('\n');
        const tail = lines.slice(-TRUNCATE_TAIL).join('\n');
        content = `${head}\n\n[... ${lineCount - TRUNCATE_HEAD - TRUNCATE_TAIL} lines truncated ...]\n\n${tail}`;
      }

      return {
        path: relativePath,
        language: this.detectLanguage(relativePath),
        content,
        lines: lineCount,
      };
    } catch {
      return null;
    }
  }

  async writeFile(relativePath: string, content: string): Promise<boolean> {
    const rootFolder = this.getRootFolder();
    if (!rootFolder) return false;

    const uri = vscode.Uri.joinPath(rootFolder.uri, relativePath);
    try {
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
      this.treeCacheValid = false;
      return true;
    } catch {
      return false;
    }
  }

  async editFile(relativePath: string, oldText: string, newText: string): Promise<boolean> {
    const rootFolder = this.getRootFolder();
    if (!rootFolder) return false;

    const uri = vscode.Uri.joinPath(rootFolder.uri, relativePath);
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const current = new TextDecoder('utf-8').decode(raw);
      if (!current.includes(oldText)) return false;
      const updated = current.replace(oldText, newText);
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(updated));
      return true;
    } catch {
      return false;
    }
  }

  async createDirectory(relativePath: string): Promise<boolean> {
    const rootFolder = this.getRootFolder();
    if (!rootFolder) return false;

    const uri = vscode.Uri.joinPath(rootFolder.uri, relativePath);
    try {
      await vscode.workspace.fs.createDirectory(uri);
      this.treeCacheValid = false;
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(relativePath?: string, pattern?: string): Promise<string[]> {
    const rootFolder = this.getRootFolder();
    if (!rootFolder) return [];

    const searchPattern = pattern
      ? (relativePath ? `${relativePath}/${pattern}` : pattern)
      : (relativePath ? `${relativePath}/**/*` : '**/*');

    const uris = await vscode.workspace.findFiles(searchPattern, EXCLUDE_PATTERN, 200);
    return uris.map(uri => vscode.workspace.asRelativePath(uri, false)).sort();
  }

  private buildFileTree(paths: string[]): string {
    const tree: Record<string, any> = {};
    for (const p of paths) {
      const parts = p.split('/');
      let current = tree;
      for (const part of parts) {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    }
    return this.renderTree(tree, '', true);
  }

  private renderTree(node: Record<string, any>, prefix: string, isRoot: boolean): string {
    const entries = Object.keys(node).sort((a, b) => {
      const aIsDir = Object.keys(node[a]).length > 0;
      const bIsDir = Object.keys(node[b]).length > 0;
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.localeCompare(b);
    });

    let result = '';
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const isLast = i === entries.length - 1;
      const connector = isRoot ? '' : (isLast ? '└── ' : '├── ');
      const childPrefix = isRoot ? '' : (isLast ? '    ' : '│   ');
      result += `${prefix}${connector}${entry}\n`;
      if (Object.keys(node[entry]).length > 0) {
        result += this.renderTree(node[entry], `${prefix}${childPrefix}`, false);
      }
    }
    return result;
  }

  private detectLanguage(filePath: string): string {
    const fileName = filePath.split('/').pop()?.toLowerCase() || '';
    if (fileName === 'dockerfile') return 'dockerfile';
    if (fileName === 'makefile') return 'makefile';
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (!ext) return 'text';
    return LANG_MAP[ext] || ext;
  }

  private isBinaryContent(content: string): boolean {
    const sample = content.slice(0, 512);
    let nullCount = 0;
    for (let i = 0; i < sample.length; i++) {
      if (sample.charCodeAt(i) === 0) nullCount++;
    }
    return nullCount > 4;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
