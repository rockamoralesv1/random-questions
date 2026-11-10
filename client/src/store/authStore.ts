import { create } from 'zustand';

export interface AuthUser {
  email: string;
  role: 'admin' | 'user';
}

interface AuthState {
  status: 'loading' | 'anonymous' | 'authenticated';
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'anonymous' }),
}));

// Any API call answered with 401 (session expired / logged out elsewhere)
// sends the app back to the login screen.
export function handleUnauthorized(): void {
  useAuthStore.getState().setUser(null);
}
