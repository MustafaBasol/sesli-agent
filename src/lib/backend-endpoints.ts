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

// --- Customers (Phase 6 backend API, Phase 12 beta UI) ---
// The backend's customer detail endpoint embeds raw reservation-request and
// conversation rows, which include internal fields (rawPayload, stateJson)
// not meant for this beta UI. The summary types below deliberately omit
// those fields — see AGENTS.md Phase 12.

export type CustomerRecord = {
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

export type CustomerListItem = {
  id: string;
  fullName: string | null;
  phoneNumber: string | null;
  normalizedPhone: string | null;
  email: string | null;
  totalReservations: number;
  lastVisitAt: string | null;
  createdAt: string;
  reservationRequestCount: number;
  conversationCount: number;
  lastContactAt: string | null;
};

export type CustomerListParams = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export type CustomerListResponse = {
  data: CustomerListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export function listCustomers(
  restaurantId: string,
  token: string,
  params: CustomerListParams = {}
): Promise<CustomerListResponse> {
  return backendRequest<CustomerListResponse>(`/restaurants/${restaurantId}/customers`, {
    token,
    query: {
      search: params.search,
      page: params.page,
      pageSize: params.pageSize,
    },
  });
}

export type CustomerReservationRequestSummary = {
  id: string;
  status: ReservationRequestStatus;
  channel: string;
  provider: string | null;
  requestType: string;
  customerName: string | null;
  phoneNumber: string | null;
  partySize: number | null;
  reservationDate: string | null;
  reservationTime: string | null;
  language: string | null;
  specialRequest: string | null;
  internalNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerConversationSummary = {
  id: string;
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

export type CustomerDetail = CustomerRecord & {
  reservationRequests: CustomerReservationRequestSummary[];
  conversations: CustomerConversationSummary[];
};

export function getCustomerDetail(
  restaurantId: string,
  token: string,
  customerId: string
): Promise<CustomerDetail> {
  return backendRequest<CustomerDetail>(`/restaurants/${restaurantId}/customers/${customerId}`, { token });
}

export type UpdateCustomerPayload = {
  fullName?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  notes?: string | null;
};

export function updateCustomer(
  restaurantId: string,
  token: string,
  customerId: string,
  payload: UpdateCustomerPayload
): Promise<CustomerRecord> {
  return backendRequest<CustomerRecord>(`/restaurants/${restaurantId}/customers/${customerId}`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

// --- Conversations & messages (Phase 6 backend API, Phase 13 beta UI) ---
// This beta UI never sends includeRawPayload and never renders rawPayload or
// stateJson — the types below deliberately omit them. See AGENTS.md Phase 13.

export const CONVERSATION_STATUSES = ['open', 'pending', 'closed', 'archived'] as const;

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export type ConversationListItem = {
  id: string;
  channel: string;
  provider: string | null;
  externalThreadId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerHandle: string | null;
  status: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
  customer: CustomerLite | null;
  messageCount: number;
  reservationRequestCount: number;
};

export type ConversationListParams = {
  channel?: string;
  provider?: string;
  customerId?: string;
  status?: ConversationStatus;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type ConversationListResponse = {
  data: ConversationListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export function listConversations(
  restaurantId: string,
  token: string,
  params: ConversationListParams = {}
): Promise<ConversationListResponse> {
  return backendRequest<ConversationListResponse>(`/restaurants/${restaurantId}/conversations`, {
    token,
    query: {
      channel: params.channel,
      provider: params.provider,
      customerId: params.customerId,
      status: params.status,
      search: params.search,
      page: params.page,
      pageSize: params.pageSize,
    },
  });
}

export type ConversationMessage = {
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

export type ConversationMessagesPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  order: 'asc' | 'desc';
};

export type ConversationDetail = {
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
  customer: ReservationRequestCustomerDetail | null;
  messages: ConversationMessage[];
  messagesPagination: ConversationMessagesPagination;
};

export function getConversationDetail(
  restaurantId: string,
  token: string,
  conversationId: string
): Promise<ConversationDetail> {
  return backendRequest<ConversationDetail>(`/restaurants/${restaurantId}/conversations/${conversationId}`, {
    token,
  });
}

export type MessageListParams = {
  page?: number;
  pageSize?: number;
  order?: 'asc' | 'desc';
};

export type MessageListResponse = {
  data: ConversationMessage[];
  pagination: ConversationMessagesPagination;
};

// Deliberately has no includeRawPayload parameter — this beta UI never
// requests raw provider payloads (see AGENTS.md Phase 13).
export function listConversationMessages(
  restaurantId: string,
  token: string,
  conversationId: string,
  params: MessageListParams = {}
): Promise<MessageListResponse> {
  return backendRequest<MessageListResponse>(
    `/restaurants/${restaurantId}/conversations/${conversationId}/messages`,
    {
      token,
      query: {
        page: params.page,
        pageSize: params.pageSize,
        order: params.order,
      },
    }
  );
}
