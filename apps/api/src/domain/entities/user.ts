export type UserRole = "developer" | "recruiter" | "team_lead" | "admin";

export interface User {
  id: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  isEmailVerified: boolean;
  mfaEnabled: boolean;
}
