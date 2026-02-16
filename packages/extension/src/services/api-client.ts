import * as vscode from 'vscode';
import { AuthProvider } from '../auth/auth-provider';

export class ApiClient {
  private baseUrl: string;

  constructor(private readonly authProvider: AuthProvider) {
    this.baseUrl = vscode.workspace.getConfiguration('marcelia').get('proxyUrl', 'http://localhost:3000');

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('marcelia.proxyUrl')) {
        this.baseUrl = vscode.workspace.getConfiguration('marcelia').get('proxyUrl', 'http://localhost:3000');
      }
    });
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const token = await this.authProvider.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated. Please sign in first.');
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
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
