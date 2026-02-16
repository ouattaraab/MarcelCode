import * as vscode from 'vscode';

const MICROSOFT_PROVIDER_ID = 'microsoft';
const SCOPES = ['openid', 'profile', 'email', 'offline_access'];

export class AuthProvider {
  private session: vscode.AuthenticationSession | undefined;
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChange = this.onDidChangeEmitter.event;

  async signIn(): Promise<vscode.AuthenticationSession | undefined> {
    try {
      this.session = await vscode.authentication.getSession(MICROSOFT_PROVIDER_ID, SCOPES, {
        createIfNone: true,
      });
      this.onDidChangeEmitter.fire();
      vscode.window.showInformationMessage(
        `Marcel'IA: Connecté en tant que ${this.session.account.label}`,
      );
      return this.session;
    } catch (err) {
      vscode.window.showErrorMessage(`Marcel'IA: Échec de la connexion - ${err}`);
      return undefined;
    }
  }

  async signOut(): Promise<void> {
    this.session = undefined;
    this.onDidChangeEmitter.fire();
    vscode.window.showInformationMessage("Marcel'IA: Déconnecté");
  }

  async getSession(): Promise<vscode.AuthenticationSession | undefined> {
    if (this.session) {
      return this.session;
    }

    // Try silent auth
    try {
      this.session = await vscode.authentication.getSession(MICROSOFT_PROVIDER_ID, SCOPES, {
        createIfNone: false,
      });
      return this.session;
    } catch {
      return undefined;
    }
  }

  async getAccessToken(): Promise<string | undefined> {
    const session = await this.getSession();
    return session?.accessToken;
  }

  isSignedIn(): boolean {
    return this.session !== undefined;
  }

  getAccountName(): string | undefined {
    return this.session?.account.label;
  }
}
