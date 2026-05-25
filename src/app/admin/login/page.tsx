'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginAdmin } from './action';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const doLogin = async () => {
    if (loading) return;

    setLoading(true);
    setError('');

    const result = await loginAdmin(password);

    if (result.success) {
      router.replace('/admin/dashboard');
      router.refresh();
    } else {
      setError(result.error || 'Giris basarisiz.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6" style={{fontFamily: 'sans-serif'}}>
      <div className="bg-gray-900 border border-gray-800 p-10 rounded-[40px] w-full max-w-md shadow-2xl">
        <h2 className="text-3xl font-black text-white mb-6">Golden Meat</h2>
        
        <div className="space-y-4">
          <input
            type="password"
            placeholder="Yönetici Şifresi"
            className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-6 py-4 text-white outline-none focus:border-orange-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doLogin()}
          />
          
          {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
          
          <button
            onClick={doLogin}
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs cursor-pointer"
          >
            {loading ? 'Kontrol Ediliyor...' : 'Sisteme Giris Yap'}
          </button>
        </div>
        
        <p className="mt-8 text-gray-600 text-[10px] text-center uppercase tracking-widest font-bold">
          Protected by Golden AI
        </p>
      </div>
    </div>
  );
}
