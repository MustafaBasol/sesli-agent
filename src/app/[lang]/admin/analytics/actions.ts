'use server';

import { createServerSupabase } from '@/lib/supabase-server';
import { requireAdminSession } from '@/lib/security/admin-session';

function getDayKey(date = new Date()) {
  return date.toISOString().split('T')[0];
}

type AnalyticsPeriod = 'week' | 'month' | 'year';

function getPeriodRange(period: AnalyticsPeriod) {
  const now = new Date();
  const start = new Date(now);

  if (period === 'week') {
    start.setDate(now.getDate() - 6);
  } else if (period === 'month') {
    start.setMonth(now.getMonth() - 1);
  } else {
    start.setFullYear(now.getFullYear() - 1);
  }

  start.setHours(0, 0, 0, 0);

  return {
    start,
    end: now,
    startIso: start.toISOString(),
    endIso: now.toISOString(),
  };
}

function textFromCall(call: any) {
  return [
    call.summary,
    call.raw_payload?.transcript,
    call.raw_payload?.artifact?.transcript,
    JSON.stringify(call.raw_payload?.messages || ''),
    JSON.stringify(call.raw_payload?.artifact?.messages || ''),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function detectLanguage(call: any) {
  const lang = call.language?.toUpperCase();
  if (lang === 'TR' || lang === 'FR' || lang === 'EN') return lang;

  const text = textFromCall(call);
  if (text.includes('bonjour') || text.includes('merci') || text.includes('reservation')) return 'FR';
  if (text.includes('hello') || text.includes('reservation') || text.includes('thank')) return 'EN';
  if (text.includes('merhaba') || text.includes('rezervasyon') || text.includes('teşekkür') || text.includes('tesekkur')) return 'TR';
  return 'Other';
}

function hourFromDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours();
}

export async function getAnalyticsData(period: AnalyticsPeriod = 'week') {
  await requireAdminSession();
  const supabase = createServerSupabase();
  const today = getDayKey();
  const range = getPeriodRange(period);

  const [
    callsResult,
    reservationsResult,
    cancellationsResult,
    handoffsResult,
    customersResult,
  ] = await Promise.all([
    supabase.from('calls').select('*').gte('created_at', range.startIso).lte('created_at', range.endIso).order('created_at', { ascending: false }),
    supabase.from('reservation_requests').select('*').gte('created_at', range.startIso).lte('created_at', range.endIso).order('created_at', { ascending: false }),
    supabase.from('reservation_cancellations').select('*').gte('created_at', range.startIso).lte('created_at', range.endIso).order('created_at', { ascending: false }),
    supabase.from('staff_handoffs').select('*').gte('created_at', range.startIso).lte('created_at', range.endIso).order('created_at', { ascending: false }),
    supabase.from('customers').select('*').lte('created_at', range.endIso).order('created_at', { ascending: false }),
  ]);

  const calls = callsResult.data || [];
  const reservations = reservationsResult.data || [];
  const cancellations = cancellationsResult.data || [];
  const handoffs = handoffsResult.data || [];
  const customers = customersResult.data || [];

  const todayCalls = calls.filter((call) => call.created_at?.startsWith(today));
  const todayReservations = reservations.filter((reservation) => reservation.created_at?.startsWith(today));
  const confirmedReservations = reservations.filter((reservation) => reservation.status === 'confirmed');
  const cancelledReservations = [
    ...reservations.filter((reservation) => reservation.status === 'cancelled'),
    ...cancellations,
  ];

  const languages: Record<string, number> = { TR: 0, FR: 0, EN: 0, Other: 0 };
  calls.forEach((call) => {
    const language = detectLanguage(call);
    languages[language] = (languages[language] || 0) + 1;
  });

  const peakCallHours = Array(24).fill(0);
  calls.forEach((call) => {
    const hour = hourFromDate(call.started_at || call.created_at);
    if (hour !== null) peakCallHours[hour]++;
  });

  const peakResHours = Array(24).fill(0);
  reservations.forEach((reservation) => {
    if (!reservation.reservation_time) return;
    const hour = Number.parseInt(reservation.reservation_time.split(':')[0], 10);
    if (!Number.isNaN(hour) && hour >= 0 && hour < 24) peakResHours[hour]++;
  });

  const humanSupportCalls = calls.filter((call) => {
    const intent = `${call.intent || ''}`.toLowerCase();
    const outcome = `${call.outcome || ''}`.toLowerCase();
    return intent.includes('handoff') || intent.includes('human') || intent.includes('transfer') || outcome.includes('transfer');
  }).length;
  const totalHandoffs = humanSupportCalls + handoffs.length;

  const recentActivity = [
    ...calls.slice(0, 5).map((call) => ({
      type: 'Call',
      title: call.customer_name || call.caller_phone || 'Unknown caller',
      detail: call.summary || call.intent || 'Call recorded',
      created_at: call.created_at,
    })),
    ...reservations.slice(0, 5).map((reservation) => ({
      type: 'Reservation',
      title: reservation.customer_name,
      detail: `${reservation.party_size} people on ${reservation.reservation_date} at ${reservation.reservation_time}`,
      created_at: reservation.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  return {
    period: {
      key: period,
      start: range.startIso,
      end: range.endIso,
      label: period === 'week' ? 'Last 7 days' : period === 'month' ? 'Last 30 days' : 'Last 12 months',
    },
    summary: {
      totalCalls: calls.length,
      todayCalls: todayCalls.length,
      totalReservations: reservations.length,
      todayReservations: todayReservations.length,
      confirmedReservations: confirmedReservations.length,
      conversionRate: calls.length ? ((confirmedReservations.length / calls.length) * 100).toFixed(1) : '0.0',
      handoffRate: calls.length ? ((totalHandoffs / calls.length) * 100).toFixed(1) : '0.0',
      handoffs: totalHandoffs,
      cancellations: cancelledReservations.length,
      totalCustomers: customers.length,
    },
    languages,
    peakCallHours,
    peakResHours,
    recentActivity,
    errors: {
      calls: callsResult.error?.message || null,
      reservations: reservationsResult.error?.message || null,
      cancellations: cancellationsResult.error?.message || null,
      handoffs: handoffsResult.error?.message || null,
      customers: customersResult.error?.message || null,
    },
  };
}
