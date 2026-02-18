import * as vscode from 'vscode';
import { AuthProvider } from '../auth/auth-provider';

export class ApiClient {
  private baseUrl: string;
  private headerMiddleware: Array<(headers: Record<string, string>) => Promise<Record<string, string>>> = [];

  constructor(private readonly authProvider: AuthProvider) {
    this.baseUrl = vscode.workspace.getConfiguration('marcelia').get('proxyUrl', 'http://localhost:3000');

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('marcelia.proxyUrl')) {
        this.baseUrl = vscode.workspace.getConfiguration('marcelia').get('proxyUrl', 'http://localhost:3000');
      }
    });
  }

  addHeaderMiddleware(fn: (headers: Record<string, string>) => Promise<Record<string, string>>): void {
    this.headerMiddleware.push(fn);
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const devMode = vscode.workspace.getConfiguration('marcelia').get('devMode', false);
    let headers: Record<string, string>;

    if (devMode) {
      headers = { 'Content-Type': 'application/json' };
    } else {
      const token = await this.authProvider.getAccessToken();
      if (!token) {
        throw new Error('Authentification requise. Veuillez vous connecter avec votre compte ERANOVE.');
      }
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
    }

    // Apply header middleware from plugins (protect critical headers)
    const protectedContentType = headers['Content-Type'];
    const protectedAuth = headers['Authorization'];
    for (const middleware of this.headerMiddleware) {
      headers = await middleware(headers);
    }
    headers['Content-Type'] = protectedContentType;
    if (protectedAuth) {
      headers['Authorization'] = protectedAuth;
    }
    return headers;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const headers = await this.getHeaders();
    const url = `${this.baseUrl}/api/v1${path}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`API error ${response.status}: ${(error as any).error || response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async postStream(path: string, body: unknown): Promise<ReadableStream<Uint8Array>> {
    const headers = await this.getHeaders();
    const url = `${this.baseUrl}/api/v1${path}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`API error ${response.status}: ${(error as any).error || response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    return response.body;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
