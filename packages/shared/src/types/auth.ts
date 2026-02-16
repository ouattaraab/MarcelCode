export enum UserRole {
  DEVELOPER = 'developer',
  TEAM_LEAD = 'team_lead',
  ADMIN = 'admin',
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  teamId: string | null;
  entraObjectId: string;
}

export interface JwtPayload {
  oid: string;
  preferred_username: string;
  name: string;
  email?: string;
  roles?: string[];
  tid: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
}
