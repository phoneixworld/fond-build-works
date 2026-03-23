/**
 * Auth Types — shared across all auth templates.
 */

export interface AuthUser {
  id: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  role?: string;
  created_at?: string;
}

export interface AuthSession {
  user: AuthUser;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

export type AuthEvent =
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY";
