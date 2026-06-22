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

export type CustomerLite = {
  id: string | null;
  fullName: string | null;
  phoneNumber: string | null;
  email: string | null;
};

export type RecentReservationRequest = {
  id: string;
  status: string;
  customer: CustomerLite;
  reservationDate: string;
  reservationTime: string;
  partySize: number;
  channel: string;
  provider: string | null;
  createdAt: string;
};

export type RecentCustomer = {
  id: string;
  fullName: string | null;
  phoneNumber: string | null;
  email: string | null;
  createdAt: string;
};

export type RecentConversation = {
  id: string;
  customer: CustomerLite;
  channel: string;
  provider: string | null;
  status: string;
  lastMessageSummary: string | null;
  lastMessageAt: string | null;
  updatedAt: string;
};

export type DashboardRecent = {
  recentReservationRequests: RecentReservationRequest[];
  recentCustomers: RecentCustomer[];
  recentConversations: RecentConversation[];
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

// --- Reservation requests (Phase 5 backend API, Phase 11 beta UI) ---
// rawPayload is intentionally absent from every type below: the detail
// endpoint only returns it for OWNER/MANAGER with includeRawPayload=true,
// and this beta UI never requests or renders it (see AGENTS.md Phase 11).

export const RESERVATION_REQUEST_STATUSES = [
  'new',
  'pending_info',
  'confirmed',
  'rejected',
  'cancelled',
  'done',
] as const;

export type ReservationRequestStatus = (typeof RESERVATION_REQUEST_STATUSES)[number];

export type ReservationRequestBase = {
  id: string;
  restaurantId: string;
  customerId: string | null;
  conversationId: string | null;
  channel: string;
  provider: string | null;
  sourceExternalId: string | null;
  requestType: string;
  customerName: string | null;
  phoneNumber: string | null;
  normalizedPhone: string | null;
  partySize: number | null;
  reservationDate: string | null;
  reservationTime: string | null;
  language: string | null;
  specialRequest: string | null;
  status: ReservationRequestStatus;
  internalNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReservationRequestCustomerSummary = {
  id: string;
  fullName: string | null;
  phoneNumber: string | null;
  totalReservations: number;
};

export type ReservationRequestConversationSummary = {
  id: string;
  channel: string;
  provider: string | null;
  status: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
};

export type ReservationRequestListItem = ReservationRequestBase & {
  customer: ReservationRequestCustomerSummary | null;
  conversation: ReservationRequestConversationSummary | null;
};

export type ReservationRequestListParams = {
  status?: ReservationRequestStatus;
  channel?: string;
  provider?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type ReservationRequestListResponse = {
  data: ReservationRequestListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export function listReservationRequests(
  restaurantId: string,
  token: string,
  params: ReservationRequestListParams = {}
): Promise<ReservationRequestListResponse> {
  return backendRequest<ReservationRequestListResponse>(`/restaurants/${restaurantId}/reservation-requests`, {
    token,
    query: {
      status: params.status,
      channel: params.channel,
      provider: params.provider,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      search: params.search,
      page: params.page,
      pageSize: params.pageSize,
    },
  });
}

export type ReservationRequestCustomerDetail = {
  id: string;
  restaurantId: string;
  phoneNumber: string | null;
  normalizedPhone: string | null;
  fullName: string | null;
  email: string | null;
  instagramHandle: string | null;
  whatsappId: string | null;
  totalReservations: number;
  lastVisitAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReservationRequestConversationDetail = {
  id: string;
  restaurantId: string;
  customerId: string | null;
  channel: string;
  provider: string | null;
  externalThreadId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerHandle: string | null;
  status: string;
  assignedToUserId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReservationRequestMessage = {
  id: string;
  restaurantId: string;
  conversationId: string;
  customerId: string | null;
  direction: string;
  channel: string;
  provider: string | null;
  senderType: string;
  senderUserId: string | null;
  externalMessageId: string | null;
  messageText: string | null;
  status: string | null;
  createdAt: string;
};

export type ReservationRequestDetail = ReservationRequestBase & {
  customer: ReservationRequestCustomerDetail | null;
  conversation: ReservationRequestConversationDetail | null;
  messages: ReservationRequestMessage[];
};

export function getReservationRequestDetail(
  restaurantId: string,
  token: string,
  requestId: string
): Promise<ReservationRequestDetail> {
  return backendRequest<ReservationRequestDetail>(
    `/restaurants/${restaurantId}/reservation-requests/${requestId}`,
    { token }
  );
}

export type UpdateReservationRequestPayload = {
  status?: ReservationRequestStatus;
  internalNote?: string | null;
  partySize?: number;
  reservationDate?: string;
  reservationTime?: string;
  specialRequest?: string | null;
};

export function updateReservationRequest(
  restaurantId: string,
  token: string,
  requestId: string,
  payload: UpdateReservationRequestPayload
): Promise<ReservationRequestBase> {
  return backendRequest<ReservationRequestBase>(`/restaurants/${restaurantId}/reservation-requests/${requestId}`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export function confirmReservationRequest(
  restaurantId: string,
  token: string,
  requestId: string
): Promise<ReservationRequestBase> {
  return backendRequest<ReservationRequestBase>(
    `/restaurants/${restaurantId}/reservation-requests/${requestId}/confirm`,
    { method: 'POST', token }
  );
}

export function rejectReservationRequest(
  restaurantId: string,
  token: string,
  requestId: string,
  reason?: string
): Promise<ReservationRequestBase> {
  return backendRequest<ReservationRequestBase>(
    `/restaurants/${restaurantId}/reservation-requests/${requestId}/reject`,
    { method: 'POST', token, body: reason ? { reason } : {} }
  );
}
