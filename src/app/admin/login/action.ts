'use server';

export async function verifyAdminPassword(password: string) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('ADMIN_PASSWORD not set in environment.');
    return { success: false, error: 'System error: Password not configured.' };
  }
  
  if (password === adminPassword) {
    return { success: true };
  }
  
  return { success: false, error: 'Invalid password.' };
}
