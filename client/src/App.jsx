import React from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ResumeMaker from './pages/ResumeMaker.jsx';
import JobSearch from './pages/JobSearch.jsx';
import Admin from './pages/Admin.jsx';

function Topbar() {
  const { user, logout } = useAuth();
  return (
    <div className="topbar">
      <div className="brand">
        Resume<span>Maker</span>
      </div>
      <nav className="nav">
        <NavLink to="/" end>
          Dashboard
        </NavLink>
        <NavLink to="/resume">Resume Maker</NavLink>
        <NavLink to="/jobs">Job Search</NavLink>
        {user?.isAdmin && <NavLink to="/admin">Admin</NavLink>}
      </nav>
      <div className="userbox">
        <span>{user?.name}</span>
        <span className={`badge ${user?.isAdmin ? 'admin' : ''}`}>{user?.isAdmin ? 'admin' : 'user'}</span>
        <button className="ghost" onClick={logout}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function Protected({ children, adminOnly }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="spinner">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (adminOnly && !user.isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="spinner">Loading…</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/*"
        element={
          <Protected>
            <div className="app">
              <Topbar />
              <div className="main">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/resume" element={<ResumeMaker />} />
                  <Route path="/jobs" element={<JobSearch />} />
                  <Route
                    path="/admin"
                    element={
                      <Protected adminOnly>
                        <Admin />
                      </Protected>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </div>
          </Protected>
        }
      />
    </Routes>
  );
}
