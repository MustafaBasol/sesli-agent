/**
 * Typed wrappers over backendRequest for the backend API surfaces this phase
 * needs (auth + dashboard). Reservation/customer/conversation/integration
 * wrappers are deferred to a later phase per AGENTS.md Phase 9 scope.
 */
import { backendRequest } from './backend-api';

export type BackendUser = {
  id: string;
  email: string;
  name: string | null;
  globalRole: string | null;
};

export type BackendLoginResponse = {
  token: string;
  user: BackendUser;
  accessibleRestaurantIds: string[];
};

export function loginBackend(email: string, password: string): Promise<BackendLoginResponse> {
  return backendRequest<BackendLoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export type DashboardSummary = {
  reservationRequests: {
    total: number;
    new: number;
    pendingInfo: number;
    confirmed: number;
    rejected: number;
    cancelled: number;
    done: number;
    todayCount: number;
    upcomingCount: number;
  };
  customers: {
    total: number;
    newToday: number;
    newThisWeek: number;
    withPhoneCount: number;
  };
  conversations: {
    total: number;
    open: number;
    closed: number;
    todayMessagesCount: number;
  };
  integrations: {
    total: number;
    active: number;
    inactive: number;
    error: number;
    byChannel: Record<string, number>;
  };
  health: {
    hasActiveVapiIntegration: boolean;
    hasAnyActiveMessagingIntegration: boolean;
    lastInboundAt: string | null;
  };
};

export function getDashboardSummary(restaurantId: string, token: string): Promise<DashboardSummary> {
  return backendRequest<DashboardSummary>(`/restaurants/${restaurantId}/dashboard/summary`, { token });
}

export type DashboardRecent = {
  recentReservationRequests: unknown[];
  recentCustomers: unknown[];
  recentConversations: unknown[];
};

export function getDashboardRecent(
  restaurantId: string,
  token: string,
  limit?: number
): Promise<DashboardRecent> {
  return backendRequest<DashboardRecent>(`/restaurants/${restaurantId}/dashboard/recent`, {
    token,
    query: { limit },
  });
}

export type DashboardCounts = {
  newReservationRequests: number;
  pendingInfoReservationRequests: number;
  openConversations: number;
  integrationErrors: number;
  todayMessages: number;
};

export function getDashboardCounts(restaurantId: string, token: string): Promise<DashboardCounts> {
  return backendRequest<DashboardCounts>(`/restaurants/${restaurantId}/dashboard/counts`, { token });
}
