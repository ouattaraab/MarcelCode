export type ExtractorEvent =
  | { type: 'key_value'; key: string; value: string }
  | { type: 'content_chunk'; value: string }
  | { type: 'content_done' };

const enum State {
  SCANNING,
  IN_KEY,
  AFTER_KEY,
  AFTER_COLON,
  IN_STRING_VALUE,
  SKIP_STRING,
}

/**
 * State machine that processes partial JSON fragments character by character
 * and extracts string values for specific keys as they stream in.
 *
 * Used to extract `path` and `content` from write_file tool input
 * as it arrives via input_json_delta SSE events.
 */
export class JsonContentExtractor {
  private state: State = State.SCANNING;
  private currentKey = '';
  private currentValue = '';
  private escapeBuffer = '';
  private isWatchedKey = false;
  private watchKeys: Set<string>;
  private streamKey: string;
  private onEvent: (event: ExtractorEvent) => void;
  private skipEscape = false;

  constructor(options: {
    watchKeys: string[];
    streamKey: string;
    onEvent: (event: ExtractorEvent) => void;
  }) {
    this.watchKeys = new Set(options.watchKeys);
    this.streamKey = options.streamKey;
    this.onEvent = options.onEvent;
  }

  feed(fragment: string): void {
    for (let i = 0; i < fragment.length; i++) {
      this.processChar(fragment[i]);
    }
  }

  private processChar(ch: string): void {
    switch (this.state) {
      case State.SCANNING:
        if (ch === '"') {
          this.state = State.IN_KEY;
          this.currentKey = '';
        }
        break;

      case State.IN_KEY:
        if (ch === '"') {
          this.state = State.AFTER_KEY;
        } else {
          this.currentKey += ch;
        }
        break;

      case State.AFTER_KEY:
        if (ch === ':') {
          this.state = State.AFTER_COLON;
          this.isWatchedKey = this.watchKeys.has(this.currentKey);
        } else if (ch === ',' || ch === '}') {
          // This was a value, not a key — reset
          this.state = State.SCANNING;
        }
        break;

      case State.AFTER_COLON:
        if (ch === '"') {
          if (this.isWatchedKey) {
            this.state = State.IN_STRING_VALUE;
            this.currentValue = '';
            this.escapeBuffer = '';
          } else {
            this.state = State.SKIP_STRING;
            this.skipEscape = false;
          }
        } else if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') {
          // Non-string value — skip back to scanning
          this.state = State.SCANNING;
        }
        break;

      case State.IN_STRING_VALUE:
        this.processStringChar(ch);
        break;

      case State.SKIP_STRING:
        if (this.skipEscape) {
          this.skipEscape = false;
        } else if (ch === '\\') {
          this.skipEscape = true;
        } else if (ch === '"') {
          this.state = State.SCANNING;
        }
        break;
    }
  }

  private processStringChar(ch: string): void {
    // Handle escape continuation from previous character
    if (this.escapeBuffer === '\\') {
      this.escapeBuffer = '';
      if (ch === 'u') {
        this.escapeBuffer = '\\u';
        return;
      }
      const decoded = this.decodeEscapeChar(ch);
      this.emitContent(decoded);
      return;
    }

    // Handle \uXXXX unicode escape
    if (this.escapeBuffer.startsWith('\\u')) {
      this.escapeBuffer += ch;
      if (this.escapeBuffer.length === 6) {
        const codePoint = parseInt(this.escapeBuffer.slice(2), 16);
        this.emitContent(isNaN(codePoint) ? '' : String.fromCharCode(codePoint));
        this.escapeBuffer = '';
      }
      return;
    }

    if (ch === '\\') {
      this.escapeBuffer = '\\';
      return;
    }

    if (ch === '"') {
      // String ended
      if (this.currentKey === this.streamKey) {
        this.onEvent({ type: 'content_done' });
      } else {
        this.onEvent({ type: 'key_value', key: this.currentKey, value: this.currentValue });
      }
      this.state = State.SCANNING;
      return;
    }

    this.emitContent(ch);
  }

  private emitContent(decoded: string): void {
    if (this.currentKey === this.streamKey) {
      this.onEvent({ type: 'content_chunk', value: decoded });
    } else {
      this.currentValue += decoded;
    }
  }

  private decodeEscapeChar(ch: string): string {
    switch (ch) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '"': return '"';
      case '\\': return '\\';
      case '/': return '/';
      case 'b': return '\b';
      case 'f': return '\f';
      default: return ch;
    }
  }

  reset(): void {
    this.state = State.SCANNING;
    this.currentKey = '';
    this.currentValue = '';
    this.escapeBuffer = '';
    this.isWatchedKey = false;
  }
}
