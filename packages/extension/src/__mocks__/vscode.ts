export class Disposable {
  private disposeFn: () => void;
  constructor(callOnDispose: () => void) {
    this.disposeFn = callOnDispose;
  }
  dispose() {
    this.disposeFn();
  }
}

// --- Uri ---

export class Uri {
  readonly scheme: string;
  readonly path: string;
  readonly fsPath: string;

  private constructor(scheme: string, path: string) {
    this.scheme = scheme;
    this.path = path;
    this.fsPath = path;
  }

  static file(path: string): Uri {
    return new Uri('file', path);
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    const joined = [base.path, ...segments].join('/').replace(/\/+/g, '/');
    return new Uri(base.scheme, joined);
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

// --- Position / Range ---

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
  constructor(
    public readonly startLine: number,
    public readonly startCharacter: number,
    public readonly endLine: number,
    public readonly endCharacter: number,
  ) {}
}

// --- WorkspaceEdit ---

export class WorkspaceEdit {
  private edits: Array<{ uri: Uri; position: Position; text: string }> = [];

  insert(uri: Uri, position: Position, text: string): void {
    this.edits.push({ uri, position, text });
  }

  getEdits() {
    return this.edits;
  }
}

// --- Enums ---

export const ViewColumn = {
  Beside: 2,
};

export const TextEditorRevealType = {
  InCenter: 2,
};

// --- Mock filesystem (in-memory) ---

const _mockFs = new Map<string, Uint8Array>();

export function _resetMockFs(): void {
  _mockFs.clear();
}

export function _getMockFs(): Map<string, Uint8Array> {
  return _mockFs;
}

// --- Mock workspace ---

const _mockApplyEditFn = async (_edit: WorkspaceEdit): Promise<boolean> => true;

export const workspace = {
  fs: {
    createDirectory: async (_uri: Uri): Promise<void> => {},
    writeFile: async (uri: Uri, content: Uint8Array): Promise<void> => {
      _mockFs.set(uri.path, content);
    },
    readFile: async (uri: Uri): Promise<Uint8Array> => {
      const data = _mockFs.get(uri.path);
      if (!data) throw new Error('File not found');
      return data;
    },
    delete: async (uri: Uri): Promise<void> => {
      _mockFs.delete(uri.path);
    },
  },
  openTextDocument: async (uri: Uri) => {
    return {
      uri,
      isUntitled: false,
      getText: () => {
        const data = _mockFs.get(uri.path);
        return data ? new TextDecoder().decode(data) : '';
      },
      positionAt: (offset: number) => {
        const data = _mockFs.get(uri.path);
        const text = data ? new TextDecoder().decode(data) : '';
        const before = text.slice(0, offset);
        const lines = before.split('\n');
        return new Position(lines.length - 1, lines[lines.length - 1].length);
      },
      lineCount: (() => {
        const data = _mockFs.get(uri.path);
        const text = data ? new TextDecoder().decode(data) : '';
        return text.split('\n').length;
      })(),
      lineAt: (line: number) => {
        const data = _mockFs.get(uri.path);
        const text = data ? new TextDecoder().decode(data) : '';
        const lines = text.split('\n');
        return { text: lines[line] || '' };
      },
      save: async () => true,
    };
  },
  applyEdit: _mockApplyEditFn,
};

// --- Mock window ---

const _mockRevealRangeFn = (_range: Range, _type: number) => {};

export const window = {
  showTextDocument: async (doc: any, _options?: any) => {
    return {
      document: doc,
      revealRange: _mockRevealRangeFn,
    };
  },
};
