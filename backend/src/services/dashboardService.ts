import { prisma } from "../prisma/client";
import { getThisWeekRangeUTC, getTodayRangeUTC, toCountMap } from "./dashboardQuery";
import { loadCustomerSummaries, type CustomerSummary } from "./customerService";

const MESSAGING_CHANNELS = ["sms", "whatsapp", "instagram"];

/**
 * Aggregate counters for the admin dashboard landing screen. Every query is
 * scoped by restaurantId — this is the only function that may answer
 * cross-section dashboard questions, so the tenant filter must never be
 * dropped from any branch.
 */
export async function getDashboardSummary(restaurantId: string) {
  const now = new Date();
  const todayRange = getTodayRangeUTC(now);
  const weekRange = getThisWeekRangeUTC(now);

  const [
    requestStatusGroups,
    requestTotal,
    todayRequestCount,
    upcomingRequestCount,
    customerTotal,
    newCustomersToday,
    newCustomersThisWeek,
    customersWithPhone,
    conversationStatusGroups,
    conversationTotal,
    todayMessagesCount,
    integrationStatusGroups,
    integrationChannelGroups,
    integrationTotal,
    activeVapiIntegration,
    activeMessagingIntegration,
    lastInboundMessage,
  ] = await Promise.all([
    prisma.reservationRequest.groupBy({ by: ["status"], where: { restaurantId }, _count: { _all: true } }),
    prisma.reservationRequest.count({ where: { restaurantId } }),
    prisma.reservationRequest.count({
      where: { restaurantId, createdAt: { gte: todayRange.start, lt: todayRange.end } },
    }),
    prisma.reservationRequest.count({
      where: {
        restaurantId,
        reservationDate: { gte: todayRange.start },
        status: { in: ["new", "pending_info", "confirmed"] },
      },
    }),
    prisma.customer.count({ where: { restaurantId } }),
    prisma.customer.count({ where: { restaurantId, createdAt: { gte: todayRange.start, lt: todayRange.end } } }),
    prisma.customer.count({ where: { restaurantId, createdAt: { gte: weekRange.start, lt: weekRange.end } } }),
    prisma.customer.count({ where: { restaurantId, phoneNumber: { not: null } } }),
    prisma.conversation.groupBy({ by: ["status"], where: { restaurantId }, _count: { _all: true } }),
    prisma.conversation.count({ where: { restaurantId } }),
    prisma.message.count({ where: { restaurantId, createdAt: { gte: todayRange.start, lt: todayRange.end } } }),
    prisma.integrationConnection.groupBy({ by: ["status"], where: { restaurantId }, _count: { _all: true } }),
    prisma.integrationConnection.groupBy({ by: ["channel"], where: { restaurantId }, _count: { _all: true } }),
    prisma.integrationConnection.count({ where: { restaurantId } }),
    prisma.integrationConnection.findFirst({
      where: { restaurantId, channel: "vapi", status: "active" },
      select: { id: true },
    }),
    prisma.integrationConnection.findFirst({
      where: { restaurantId, channel: { in: MESSAGING_CHANNELS }, status: "active" },
      select: { id: true },
    }),
    prisma.message.findFirst({
      where: { restaurantId, direction: "inbound" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const requestStatusCounts = toCountMap(requestStatusGroups, "status");
  const conversationStatusCounts = toCountMap(conversationStatusGroups, "status");
  const integrationStatusCounts = toCountMap(integrationStatusGroups, "status");
  const integrationChannelCounts = toCountMap(integrationChannelGroups, "channel");

  return {
    reservationRequests: {
      total: requestTotal,
      new: requestStatusCounts.new ?? 0,
      pendingInfo: requestStatusCounts.pending_info ?? 0,
      confirmed: requestStatusCounts.confirmed ?? 0,
      rejected: requestStatusCounts.rejected ?? 0,
      cancelled: requestStatusCounts.cancelled ?? 0,
      done: requestStatusCounts.done ?? 0,
      todayCount: todayRequestCount,
      upcomingCount: upcomingRequestCount,
    },
    customers: {
      total: customerTotal,
      newToday: newCustomersToday,
      newThisWeek: newCustomersThisWeek,
      withPhoneCount: customersWithPhone,
    },
    conversations: {
      total: conversationTotal,
      open: conversationStatusCounts.open ?? 0,
      closed: conversationStatusCounts.closed ?? 0,
      todayMessagesCount,
      // unreadCount omitted: Message/Conversation models have no read-state column.
    },
    integrations: {
      total: integrationTotal,
      active: integrationStatusCounts.active ?? 0,
      inactive: integrationStatusCounts.inactive ?? 0,
      error: integrationStatusCounts.error ?? 0,
      byChannel: integrationChannelCounts,
    },
    health: {
      hasActiveVapiIntegration: Boolean(activeVapiIntegration),
      hasAnyActiveMessagingIntegration: Boolean(activeMessagingIntegration),
      lastInboundAt: lastInboundMessage?.createdAt ?? null,
    },
  };
}

interface CustomerLite {
  id: string | null;
  fullName: string | null;
  phoneNumber: string | null;
  email: string | null;
}

function resolveCustomerSummary(
  customerId: string | null,
  fallbackName: string | null,
  fallbackPhone: string | null,
  summaries: Map<string, CustomerSummary>
): CustomerLite {
  if (customerId) {
    const summary = summaries.get(customerId);
    if (summary) return summary;
  }
  return { id: customerId, fullName: fallbackName, phoneNumber: fallbackPhone, email: null };
}

/**
 * Recent-activity lists for the dashboard. Each list is capped at `limit`
 * (1-10, validated by the route) and scoped to restaurantId.
 */
export async function getDashboardRecent(restaurantId: string, limit: number) {
  const [requests, customers, conversations] = await Promise.all([
    prisma.reservationRequest.findMany({ where: { restaurantId }, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.customer.findMany({ where: { restaurantId }, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.conversation.findMany({ where: { restaurantId }, orderBy: { updatedAt: "desc" }, take: limit }),
  ]);

  const customerIds = [
    ...new Set(
      [...requests.map((r) => r.customerId), ...conversations.map((c) => c.customerId)].filter(
        (id): id is string => !!id
      )
    ),
  ];
  const customerSummaries = await loadCustomerSummaries(customerIds);

  return {
    recentReservationRequests: requests.map((r) => ({
      id: r.id,
      status: r.status,
      customer: resolveCustomerSummary(r.customerId, r.customerName, r.phoneNumber, customerSummaries),
      reservationDate: r.reservationDate,
      reservationTime: r.reservationTime,
      partySize: r.partySize,
      channel: r.channel,
      provider: r.provider,
      createdAt: r.createdAt,
    })),
    recentCustomers: customers.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      phoneNumber: c.phoneNumber,
      email: c.email,
      createdAt: c.createdAt,
    })),
    recentConversations: conversations.map((c) => ({
      id: c.id,
      customer: resolveCustomerSummary(c.customerId, c.customerName, c.customerPhone, customerSummaries),
      channel: c.channel,
      provider: c.provider,
      status: c.status,
      lastMessageSummary: c.lastMessagePreview,
      lastMessageAt: c.lastMessageAt,
      updatedAt: c.updatedAt,
    })),
  };
}

/**
 * Lightweight badge counters for a future sidebar/header — intentionally
 * cheaper than getDashboardSummary (no groupBy, no recent lists).
 */
export async function getDashboardCounts(restaurantId: string) {
  const todayRange = getTodayRangeUTC();

  const [newReservationRequests, pendingInfoReservationRequests, openConversations, integrationErrors, todayMessages] =
    await Promise.all([
      prisma.reservationRequest.count({ where: { restaurantId, status: "new" } }),
      prisma.reservationRequest.count({ where: { restaurantId, status: "pending_info" } }),
      prisma.conversation.count({ where: { restaurantId, status: "open" } }),
      prisma.integrationConnection.count({ where: { restaurantId, status: "error" } }),
      prisma.message.count({ where: { restaurantId, createdAt: { gte: todayRange.start, lt: todayRange.end } } }),
    ]);

  return {
    newReservationRequests,
    pendingInfoReservationRequests,
    openConversations,
    integrationErrors,
    todayMessages,
  };
}
