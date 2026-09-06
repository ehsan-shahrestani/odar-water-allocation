export type UserRole = 'admin' | 'representative' | 'farmer';

export interface UserProfile {
  id: string;
  full_name: string;
  phone: string;
  role: UserRole;
  is_active: boolean;
}
