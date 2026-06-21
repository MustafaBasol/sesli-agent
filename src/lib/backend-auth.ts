/**
 * Session helpers for the new backend's email/password auth (Phase 9).
 * Deliberately separate from the existing Supabase/admin-cookie session in
 * src/lib/security/admin-session.ts — nothing here replaces that flow yet.
 * Token is kept in localStorage for now; this is a dev/beta surface, not the
 * production admin login.
 */
import { loginBackend, type BackendLoginResponse, type BackendUser } from './backend-endpoints';

const TOKEN_KEY = 'backend-auth-token';
const USER_KEY = 'backend-auth-user';
const RESTAURANTS_KEY = 'backend-auth-restaurant-ids';
const SELECTED_RESTAURANT_KEY = 'backend-auth-selected-restaurant-id';

export const backendAuth = {
  async login(email: string, password: string): Promise<BackendLoginResponse> {
    const result = await loginBackend(email, password);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TOKEN_KEY, result.token);
      window.localStorage.setItem(USER_KEY, JSON.stringify(result.user));
      window.localStorage.setItem(RESTAURANTS_KEY, JSON.stringify(result.accessibleRestaurantIds));
    }
    return result;
  },

  logout(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem(RESTAURANTS_KEY);
    window.localStorage.removeItem(SELECTED_RESTAURANT_KEY);
  },

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(TOKEN_KEY);
  },

  getUser(): BackendUser | null {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as BackendUser) : null;
  },

  getAccessibleRestaurantIds(): string[] {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(RESTAURANTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  },

  setSelectedRestaurantId(restaurantId: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SELECTED_RESTAURANT_KEY, restaurantId);
  },

  getSelectedRestaurantId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(SELECTED_RESTAURANT_KEY);
  },
};
