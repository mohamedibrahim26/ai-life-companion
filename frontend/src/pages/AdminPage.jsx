import { useEffect, useState, useCallback } from 'react';
import { getAdminStats, getAdminUsers, getAdminUser, getAdminGoals, getAdminActivity, getAdminAlerts } from '../api.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIER_CONFIG = {
  locked_in:     { label: 'Locked In',    dot: '🔴', bg: 'bg-red-900/40',    text: 'text-red-300',    border: 'border-red-800' },
  wanting_it:    { label: 'Wanting It',   dot: '🟡', bg: 'bg-yellow-900/40', text: 'text-yellow-300', border: 'border-yellow-800' },
  would_be_nice: { label: 'Would Be Nice',dot: '🟢', bg: 'bg-green-900/40',  text: 'text-green-300',  border: 'border-green-800' },
};

const STATUS_CONFIG = {
  active:    { label: 'Active',    bg: 'bg-blue-900/40',  text: 'text-blue-300'  },
  completed: { label: 'Done',      bg: 'bg-green-900/40', text: 'text-green-300' },
  paused:    { label: 'Paused',    bg: 'bg-slate-700',    text: 'text-slate-400' },
};

function timeAgo(dateStr) {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

// ── User detail drawer ────────────────────────────────────────────────────────
function UserDrawer({ userId, onClose }) {
  const [data, setData] = useState(null);
  const [tab, setTab]   = useState('overview');

  useEffect(() => {
    getAdminUser(userId).then(setData);
  }, [userId]);

  if (!data) return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="flex gap-2"><span className="dot"/><span className="dot"/><span className="dot"/></div>
    </div>
  );

  const { user, goals, messages, stats } = data;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-700 h-full flex flex-col overflow-hidden">

        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">{user.name || 'Unknown User'}</h2>
            <p className="text-slate-400 text-sm mt-0.5">{user.profession || 'No profession set'}</p>
            <div className="flex gap-2 mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${user.onboarded ? 'bg-green-900/50 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                {user.onboarded ? '✓ Onboarded' : 'Onboarding'}
              </span>
              {user.age && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">Age: {user.age}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-2xl leading-none transition-colors">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          {['overview', 'goals', 'messages'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium capitalize transition-colors ${
                tab === t ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {tab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Messages sent"  value={stats?.user_messages ?? 0}  color="text-blue-400" />
                <StatCard label="Vera replies"   value={stats?.vera_messages ?? 0}  color="text-purple-400" />
                <StatCard label="Active goals"   value={goals.filter(g => g.status === 'active').length}    color="text-yellow-400" />
                <StatCard label="Completed goals" value={goals.filter(g => g.status === 'completed').length} color="text-green-400" />
              </div>

              <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-3">
                <h3 className="text-white font-semibold text-sm">Profile</h3>
                {[
                  ['Family status', user.family_status],
                  ['Life context',  user.life_context],
                  ['Personality',   user.personality_notes],
                  ['First seen',    fmt(stats?.first_message)],
                  ['Last active',   fmt(stats?.last_message)],
                ].map(([label, val]) => val ? (
                  <div key={label}>
                    <p className="text-slate-500 text-xs">{label}</p>
                    <p className="text-slate-200 text-sm mt-0.5">{val}</p>
                  </div>
                ) : null)}
              </div>
            </div>
          )}

          {tab === 'goals' && (
            <div className="space-y-3">
              {goals.length === 0 && <p className="text-slate-500 text-sm">No goals yet.</p>}
              {goals.map(g => {
                const tc = TIER_CONFIG[g.tier] || TIER_CONFIG.wanting_it;
                const sc = STATUS_CONFIG[g.status] || STATUS_CONFIG.active;
                return (
                  <div key={g.id} className={`rounded-xl p-4 border ${tc.border} ${tc.bg}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-white font-medium text-sm">{g.title}</p>
                        {g.description && <p className="text-slate-400 text-xs mt-1">{g.description}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${sc.bg} ${sc.text}`}>
                        {sc.label}
                      </span>
                    </div>
                    <div className="flex gap-3 mt-3 text-xs text-slate-500">
                      <span>{tc.dot} {tc.label}</span>
                      {g.deadline && <span>Due {fmt(g.deadline)}</span>}
                      {g.days_missed > 0 && <span className="text-red-400">{g.days_missed} days missed</span>}
                    </div>
                    {g.progress_notes && (
                      <p className="text-slate-400 text-xs mt-2 border-t border-slate-700 pt-2">{g.progress_notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'messages' && (
            <div className="space-y-2">
              {messages.length === 0 && <p className="text-slate-500 text-sm">No messages yet.</p>}
              {messages.map(m => (
                <div key={m.id} className={`rounded-xl px-4 py-3 text-sm ${
                  m.role === 'user'
                    ? 'bg-blue-900/30 border border-blue-800/50 text-blue-100'
                    : 'bg-slate-800 border border-slate-700 text-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold opacity-60">
                      {m.role === 'user' ? (user.name || 'User') : 'Vera'}
                    </span>
                    <span className="text-xs opacity-40">{timeAgo(m.created_at)}</span>
                  </div>
                  <p className="leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main admin page ───────────────────────────────────────────────────────────
export default function AdminPage() {
  // Access is decided by the server: only logged-in users whose email is in
  // ADMIN_EMAILS get data back. 'checking' | 'ok' | 'denied'
  const [access,   setAccess]   = useState('checking');

  const [stats,    setStats]    = useState(null);
  const [users,    setUsers]    = useState([]);
  const [goals,    setGoals]    = useState([]);
  const [activity, setActivity] = useState([]);
  const [alerts,   setAlerts]   = useState(null);
  const [tab,      setTab]      = useState('overview');
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, u, g, a, al] = await Promise.all([
        getAdminStats(), getAdminUsers(), getAdminGoals(), getAdminActivity(), getAdminAlerts()
      ]);
      setStats(s); setUsers(u); setGoals(g); setActivity(a); setAlerts(al);
      setAccess('ok');
    } catch (err) {
      const status = err?.response?.status;
      setAccess(status === 401 || status === 403 ? 'denied' : 'ok');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (access === 'checking') {
    return (
      <div className="flex items-center justify-center w-full h-full bg-slate-950 text-slate-400 text-sm">
        Checking access…
      </div>
    );
  }

  if (access === 'denied') {
    return (
      <div className="flex items-center justify-center w-full h-full bg-slate-950">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 w-80 space-y-2 text-center">
          <p className="text-2xl font-bold text-white">Vera</p>
          <p className="text-slate-300 text-sm">Admin access required.</p>
          <p className="text-slate-500 text-xs">Log in with an account listed in ADMIN_EMAILS on the server.</p>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(u =>
    !search || (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.profession || '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredGoals = goals.filter(g =>
    !search || (g.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (g.user_name || '').toLowerCase().includes(search.toLowerCase())
  );

  // ── Dashboard ───────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full h-full bg-slate-950 text-white overflow-hidden">

      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-slate-800">
          <p className="font-bold text-white text-lg">Vera</p>
          <p className="text-slate-500 text-xs">Admin Dashboard</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[
            { id: 'overview',  label: 'Overview',  icon: '📊' },
            { id: 'users',     label: 'Users',     icon: '👤' },
            { id: 'goals',     label: 'Goals',     icon: '🎯' },
            { id: 'activity',  label: 'Activity',  icon: '💬' },
            { id: 'alerts',    label: 'Alerts',    icon: '🚨' },
          ].map(item => (
            <button key={item.id} onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors text-left ${
                tab === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}>
              <span>{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <button onClick={load}
            className="w-full text-xs text-slate-500 hover:text-white transition-colors py-2">
            ↻ Refresh
          </button>
          <a href="/" className="block w-full text-xs text-slate-500 hover:text-white transition-colors py-1 text-center">
            ← Back to Vera
          </a>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white capitalize">{tab}</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                {tab === 'overview' && 'Platform overview at a glance'}
                {tab === 'users'    && `${users.length} total users`}
                {tab === 'goals'    && `${goals.length} total goals`}
                {tab === 'activity' && `${activity.length} recent messages`}
              </p>
            </div>
            {(tab === 'users' || tab === 'goals') && (
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={tab === 'users' ? 'Search users...' : 'Search goals...'}
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-56 transition-colors"
              />
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="flex gap-2"><span className="dot"/><span className="dot"/><span className="dot"/></div>
            </div>
          ) : (

            <>
              {/* ── OVERVIEW ── */}
              {tab === 'overview' && stats && (
                <div className="space-y-8">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard label="Total Users"     value={stats.users.total}       sub={`${stats.users.onboarded} fully onboarded`} color="text-blue-400" />
                    <StatCard label="Total Messages"  value={stats.messages.total}    sub={`${stats.messages.today} today`}            color="text-purple-400" />
                    <StatCard label="Active Goals"    value={stats.goals.active}      sub={`${stats.goals.completed} completed`}       color="text-yellow-400" />
                    <StatCard label="Total Goals"     value={stats.goals.total}       sub="across all users"                           color="text-white" />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Goals by tier */}
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
                      <h3 className="text-white font-semibold mb-4">Active Goals by Tier</h3>
                      <div className="space-y-3">
                        {[
                          { tier: 'locked_in',     count: stats.goals.byTier.locked_in },
                          { tier: 'wanting_it',    count: stats.goals.byTier.wanting_it },
                          { tier: 'would_be_nice', count: stats.goals.byTier.would_be_nice },
                        ].map(({ tier, count }) => {
                          const cfg = TIER_CONFIG[tier];
                          const total = stats.goals.active || 1;
                          const pct = Math.round((count / total) * 100);
                          return (
                            <div key={tier}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className={cfg.text}>{cfg.dot} {cfg.label}</span>
                                <span className="text-slate-400">{count} ({pct}%)</span>
                              </div>
                              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-current transition-all"
                                  style={{ width: `${pct}%`, color: cfg.text.replace('text-', '#').replace('-300', '') }}/>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Recent users */}
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
                      <h3 className="text-white font-semibold mb-4">Recent Users</h3>
                      <div className="space-y-3">
                        {users.slice(0, 5).map(u => (
                          <div key={u.id}
                            onClick={() => setSelectedUser(u.id)}
                            className="flex items-center justify-between cursor-pointer hover:bg-slate-700 rounded-xl px-3 py-2 transition-colors -mx-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-600/50 flex items-center justify-center text-xs font-bold text-blue-300">
                                {(u.name || '?')[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="text-white text-sm font-medium">{u.name || 'New user'}</p>
                                <p className="text-slate-500 text-xs">{u.profession || 'No profession'}</p>
                              </div>
                            </div>
                            <span className="text-slate-600 text-xs">{timeAgo(u.last_active)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── USERS ── */}
              {tab === 'users' && (
                <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        {['User', 'Profession', 'Goals', 'Messages', 'Last Active', 'Status'].map(h => (
                          <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.length === 0 && (
                        <tr><td colSpan={6} className="text-center py-10 text-slate-500">No users found</td></tr>
                      )}
                      {filteredUsers.map(u => (
                        <tr key={u.id}
                          onClick={() => setSelectedUser(u.id)}
                          className="border-b border-slate-700/50 hover:bg-slate-700/50 cursor-pointer transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-600/40 flex items-center justify-center text-xs font-bold text-blue-300 shrink-0">
                                {(u.name || '?')[0].toUpperCase()}
                              </div>
                              <span className="text-white text-sm font-medium">{u.name || <span className="text-slate-500">Unknown</span>}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-slate-400 text-sm">{u.profession || '—'}</td>
                          <td className="px-5 py-4 text-slate-300 text-sm">{u.goal_count}</td>
                          <td className="px-5 py-4 text-slate-300 text-sm">{u.message_count}</td>
                          <td className="px-5 py-4 text-slate-500 text-sm">{timeAgo(u.last_active)}</td>
                          <td className="px-5 py-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${u.onboarded ? 'bg-green-900/50 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                              {u.onboarded ? 'Active' : 'Onboarding'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── GOALS ── */}
              {tab === 'goals' && (
                <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        {['Goal', 'User', 'Tier', 'Status', 'Deadline', 'Days Missed'].map(h => (
                          <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGoals.length === 0 && (
                        <tr><td colSpan={6} className="text-center py-10 text-slate-500">No goals found</td></tr>
                      )}
                      {filteredGoals.map(g => {
                        const tc = TIER_CONFIG[g.tier] || TIER_CONFIG.wanting_it;
                        const sc = STATUS_CONFIG[g.status] || STATUS_CONFIG.active;
                        return (
                          <tr key={g.id} className="border-b border-slate-700/50">
                            <td className="px-5 py-4">
                              <p className="text-white text-sm font-medium">{g.title}</p>
                              {g.description && <p className="text-slate-500 text-xs mt-0.5 truncate max-w-xs">{g.description}</p>}
                            </td>
                            <td className="px-5 py-4 text-slate-400 text-sm">{g.user_name || '—'}</td>
                            <td className="px-5 py-4">
                              <span className={`text-xs font-medium ${tc.text}`}>{tc.dot} {tc.label}</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>{sc.label}</span>
                            </td>
                            <td className="px-5 py-4 text-slate-500 text-sm">{fmt(g.deadline)}</td>
                            <td className="px-5 py-4">
                              {g.days_missed > 0
                                ? <span className="text-red-400 text-sm font-medium">{g.days_missed}</span>
                                : <span className="text-slate-600 text-sm">0</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── ACTIVITY ── */}
              {tab === 'activity' && (
                <div className="space-y-2 max-w-3xl">
                  {activity.length === 0 && <p className="text-slate-500 text-sm">No activity yet.</p>}
                  {activity.map(m => (
                    <div key={m.id}
                      className={`rounded-xl px-4 py-3 border text-sm ${
                        m.role === 'user'
                          ? 'bg-blue-900/20 border-blue-800/40'
                          : 'bg-slate-800 border-slate-700'
                      }`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-xs text-slate-400">
                          {m.role === 'user' ? (m.user_name || 'User') : '🤖 Vera'}
                        </span>
                        <span className="text-xs text-slate-600">{timeAgo(m.created_at)}</span>
                      </div>
                      <p className="text-slate-200 leading-relaxed line-clamp-3">{m.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* ── ALERTS ── */}
              {tab === 'alerts' && (
                <div className="space-y-6">
                  {!alerts ? (
                    <div className="flex justify-center py-10">
                      <div className="flex gap-2"><span className="dot"/><span className="dot"/><span className="dot"/></div>
                    </div>
                  ) : (
                    <>
                      {/* Low mood users */}
                      <div>
                        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                          <span>😞</span> Low Mood (last 3 days)
                          <span className="text-xs font-normal text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{alerts.lowMoodUsers.length}</span>
                        </h3>
                        {alerts.lowMoodUsers.length === 0 ? (
                          <p className="text-slate-500 text-sm bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">No users with low mood — great!</p>
                        ) : (
                          <div className="space-y-2">
                            {alerts.lowMoodUsers.map(u => (
                              <div key={u.id} onClick={() => setSelectedUser(u.id)}
                                className="bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3 cursor-pointer hover:bg-red-900/30 transition-colors flex items-center justify-between">
                                <div>
                                  <p className="text-white text-sm font-medium">{u.name || 'Unknown'}</p>
                                  <p className="text-slate-400 text-xs">{u.email || ''}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-red-300 text-sm font-bold">Avg: {Number(u.avg_mood).toFixed(1)}/5</p>
                                  <p className="text-slate-500 text-xs">{u.mood_count} check-ins</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Abandoned Locked In goals */}
                      <div>
                        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                          <span>🔴</span> Abandoned Locked In Goals (7+ days)
                          <span className="text-xs font-normal text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{alerts.abandonedGoals.length}</span>
                        </h3>
                        {alerts.abandonedGoals.length === 0 ? (
                          <p className="text-slate-500 text-sm bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">No abandoned goals — everyone's on track!</p>
                        ) : (
                          <div className="space-y-2">
                            {alerts.abandonedGoals.map(g => (
                              <div key={g.id}
                                className="bg-orange-900/20 border border-orange-800/40 rounded-xl px-4 py-3 flex items-center justify-between">
                                <div>
                                  <p className="text-white text-sm font-medium">{g.title}</p>
                                  <p className="text-slate-400 text-xs">{g.user_name || 'Unknown user'}</p>
                                </div>
                                <p className="text-orange-300 text-xs">Last: {g.last_checkin ? new Date(g.last_checkin).toLocaleDateString() : 'Never'}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Inactive users */}
                      <div>
                        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                          <span>👻</span> Inactive Users (7+ days)
                          <span className="text-xs font-normal text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{alerts.inactiveUsers.length}</span>
                        </h3>
                        {alerts.inactiveUsers.length === 0 ? (
                          <p className="text-slate-500 text-sm bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">All users are active!</p>
                        ) : (
                          <div className="space-y-2">
                            {alerts.inactiveUsers.map(u => (
                              <div key={u.id} onClick={() => setSelectedUser(u.id)}
                                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 cursor-pointer hover:bg-slate-700 transition-colors flex items-center justify-between">
                                <div>
                                  <p className="text-white text-sm font-medium">{u.name || 'Unknown'}</p>
                                  <p className="text-slate-400 text-xs">{u.email || ''}</p>
                                </div>
                                <p className="text-slate-500 text-xs">Last: {u.last_active ? timeAgo(u.last_active) : 'Never'}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {selectedUser && (
        <UserDrawer userId={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
}
