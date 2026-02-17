import * as vscode from 'vscode';

interface WorkspaceFile {
  path: string;
  language: string;
  content: string;
  lines: number;
}

export interface WorkspaceContext {
  rootName: string;
  fileTree: string;
  files: WorkspaceFile[];
  totalFiles: number;
  includedFiles: number;
}

const MAX_CONTEXT_BYTES = 300 * 1024; // 300KB
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

const CONFIG_FILES = new Set([
  'package.json', 'tsconfig.json', 'tsconfig.base.json',
  '.eslintrc.json', '.eslintrc.js', '.prettierrc',
  'webpack.config.js', 'webpack.config.ts', 'vite.config.ts', 'vite.config.js',
  'docker-compose.yml', 'docker-compose.yaml', 'Dockerfile',
  'Makefile', '.env.example', 'README.md',
  'cargo.toml', 'go.mod', 'requirements.txt', 'pyproject.toml',
]);

export class WorkspaceScanner {
  private cache: WorkspaceContext | null = null;
  private cacheValid = false;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    const watcher = vscode.workspace.onDidSaveTextDocument(() => {
      this.cacheValid = false;
    });
    const createWatcher = vscode.workspace.onDidCreateFiles(() => {
      this.cacheValid = false;
    });
    const deleteWatcher = vscode.workspace.onDidDeleteFiles(() => {
      this.cacheValid = false;
    });
    this.disposables.push(watcher, createWatcher, deleteWatcher);
  }

  async getContext(): Promise<WorkspaceContext | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    if (this.cache && this.cacheValid) {
      return this.cache;
    }

    const rootFolder = workspaceFolders[0];
    const rootName = rootFolder.name;

    const uris = await vscode.workspace.findFiles('**/*', EXCLUDE_PATTERN, 500);

    const relativePaths = uris.map(uri =>
      vscode.workspace.asRelativePath(uri, false)
    ).sort();

    const fileTree = this.buildFileTree(relativePaths);

    const prioritized = this.prioritizeFiles(relativePaths);

    const files: WorkspaceFile[] = [];
    let totalBytes = 0;

    for (const relPath of prioritized) {
      if (totalBytes >= MAX_CONTEXT_BYTES) break;

      const uri = vscode.Uri.joinPath(rootFolder.uri, relPath);
      try {
        const raw = await vscode.workspace.fs.readFile(uri);
        let content = new TextDecoder('utf-8').decode(raw);

        if (this.isBinaryContent(content)) continue;

        const lines = content.split('\n');
        const lineCount = lines.length;

        if (lineCount > MAX_FILE_LINES) {
          const head = lines.slice(0, TRUNCATE_HEAD).join('\n');
          const tail = lines.slice(-TRUNCATE_TAIL).join('\n');
          content = `${head}\n\n[... ${lineCount - TRUNCATE_HEAD - TRUNCATE_TAIL} lignes tronquées ...]\n\n${tail}`;
        }

        const contentBytes = new TextEncoder().encode(content).length;
        if (totalBytes + contentBytes > MAX_CONTEXT_BYTES) continue;

        totalBytes += contentBytes;
        files.push({
          path: relPath,
          language: this.detectLanguage(relPath),
          content,
          lines: lineCount,
        });
      } catch {
        // Skip unreadable files
      }
    }

    const context: WorkspaceContext = {
      rootName,
      fileTree,
      files,
      totalFiles: relativePaths.length,
      includedFiles: files.length,
    };

    this.cache = context;
    this.cacheValid = true;
    return context;
  }

  private buildFileTree(paths: string[]): string {
    const tree: Record<string, any> = {};

    for (const p of paths) {
      const parts = p.split('/');
      let current = tree;
      for (const part of parts) {
        if (!current[part]) {
          current[part] = {};
        }
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

      const children = Object.keys(node[entry]);
      if (children.length > 0) {
        result += this.renderTree(node[entry], `${prefix}${childPrefix}`, false);
      }
    }
    return result;
  }

  private prioritizeFiles(paths: string[]): string[] {
    const configFiles: string[] = [];
    const srcFiles: string[] = [];
    const otherFiles: string[] = [];

    for (const p of paths) {
      const fileName = p.split('/').pop() || '';
      if (CONFIG_FILES.has(fileName) || CONFIG_FILES.has(fileName.toLowerCase())) {
        configFiles.push(p);
      } else if (p.startsWith('src/') || p.includes('/src/')) {
        srcFiles.push(p);
      } else {
        otherFiles.push(p);
      }
    }

    return [...configFiles, ...srcFiles, ...otherFiles];
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
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
