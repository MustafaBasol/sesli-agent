'use server';

import {
  clearAdminSession,
  createAdminSession,
  verifyAdminPassword,
} from '@/lib/security/admin-session';

export async function loginAdmin(password: string) {
  const input = password.trim();

  if (!input) {
    return { success: false, error: 'Lutfen sifre girin.' };
  }

  try {
    const valid = verifyAdminPassword(input);
    if (!valid) {
      return { success: false, error: 'Hatali sifre. Lutfen tekrar deneyin.' };
    }

    await createAdminSession();
    return { success: true };
  } catch (error) {
    console.error('[ADMIN LOGIN ERROR]', error);
    return { success: false, error: 'Sistem hatasi. Tekrar deneyin.' };
  }
}

export async function logoutAdmin() {
  await clearAdminSession();
  return { success: true };
}
