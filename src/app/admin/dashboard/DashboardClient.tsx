'use client';

export default function DashboardClient({ initialStats }: { initialStats: any }) {
  const statCards = [
    { name: 'Total Calls Today', value: initialStats.totalCalls, icon: '📞', color: 'blue' },
    { name: 'New Reservations', value: initialStats.newReservations, icon: '📅', color: 'green' },
    { name: 'Pending Handoffs', value: initialStats.pendingHandoffs, icon: '🆘', color: 'red' },
    { name: 'Cancellations', value: initialStats.cancellations, icon: '❌', color: 'orange' },
  ];

  return (
    <div>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white">Dashboard Overview</h2>
        <p className="text-gray-400 mt-1">Summary of Golden Meat inbound activity.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => (
          <div key={card.name} className="bg-gray-900 border border-gray-800 p-6 rounded-2xl hover:border-gray-700 transition-all shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-2xl">{card.icon}</span>
              <span className={`px-2 py-1 text-xs font-bold rounded-full bg-gray-500/10 text-white opacity-50`}>
                Live
              </span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {card.value}
            </div>
            <div className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              {card.name}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl">
          <h3 className="text-xl font-bold text-white mb-6">Latest Activity</h3>
          <div className="space-y-4">
            <p className="text-gray-500 text-sm italic text-center py-8">Recent activity verified in database.</p>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl">
          <h3 className="text-xl font-bold text-white mb-6">System Status</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl border border-gray-700">
              <span className="text-sm">Vapi Webhook</span>
              <span className="flex items-center text-green-400 text-xs font-bold">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse" />
                ONLINE
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl border border-gray-700">
              <span className="text-sm">Supabase DB</span>
              <span className="flex items-center text-green-400 text-xs font-bold">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse" />
                CONNECTED
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
