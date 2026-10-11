import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import ChatPage from './pages/ChatPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import OnboardingPage from './pages/OnboardingPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import { authMe } from './api.js';

function Spinner() {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="flex gap-2">
        <span className="dot" /><span className="dot" /><span className="dot" />
      </div>
    </div>
  );
}

function AppNav({ user, onLogout }) {
  const loc = useLocation();

  const navLink = (to, icon, label) => {
    const active = loc.pathname === to;
    return (
      <Link
        to={to}
        className={`relative px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
          active ? 'nav-link-active' : 'nav-link-idle'
        }`}
      >
        <span className="mr-1.5">{icon}</span>{label}
        {active && (
          <span
            className="absolute inset-x-3 -bottom-px h-px rounded-full"
            style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
          />
        )}
      </Link>
    );
  };

  return (
    <nav className="flex items-center gap-1 px-3 py-2 app-nav">
      {/* Logo */}
      <div className="flex items-center gap-2 px-2 mr-3">
        <div
          className="vera-avatar w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold select-none"
        >
          V
        </div>
        <span className="gradient-text font-bold text-sm hidden sm:inline tracking-tight select-none">Vera</span>
      </div>

      {navLink('/', '💬', 'Chat')}
      {navLink('/dashboard', '📊', 'Dashboard')}

      <div className="flex-1" />

      {user?.name && (
        <span className="text-slate-600 text-xs hidden sm:inline mr-2 font-medium">{user.name}</span>
      )}

      <button
        onClick={onLogout}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-all"
        title="Log out"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span className="hidden sm:inline">Log out</span>
      </button>
    </nav>
  );
}

export default function App() {
  const [user, setUser]       = useState(null);
  const [ready, setReady]     = useState(false);
  const [authed, setAuthed]   = useState(false);

  useEffect(() => {
    async function bootstrap() {
      const token = localStorage.getItem('vera_token');

      if (token) {
        try {
          const data = await authMe(token);
          setUser(data.user);
          setAuthed(true);
          setReady(true);
          return;
        } catch {
          localStorage.removeItem('vera_token');
          localStorage.removeItem('vera_user_id');
        }
      }

      // Anonymous accounts are no longer supported: everyone must log in.
      localStorage.removeItem('vera_user_id');

      setReady(true);
    }
    bootstrap();
  }, []);

  function handleAuth(userData) {
    setUser(userData);
    setAuthed(true);
  }

  function handleLogout() {
    localStorage.removeItem('vera_token');
    localStorage.removeItem('vera_user_id');
    setUser(null);
    setAuthed(false);
  }

  function handleOnboardingComplete(updatedUser) {
    setUser(updatedUser);
  }

  if (!ready) return <Spinner />;
  if (!authed) return <LoginPage onAuth={handleAuth} />;

  const needsOnboarding = user && !user.onboarded;

  if (needsOnboarding) {
    return <OnboardingPage user={user} onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="flex flex-col w-full h-full">
      <AppNav user={user} onLogout={handleLogout} />
      <div className="flex-1 overflow-hidden flex">
        <Routes>
          <Route path="/"          element={<ChatPage userId={user.id} user={user} onUserUpdate={setUser} />} />
          <Route path="/dashboard" element={<DashboardPage userId={user.id} />} />
          <Route path="/admin"     element={<AdminPage />} />
          <Route path="*"          element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  );
}
