import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/globals.css';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { AuthGate } from './components/auth/AuthGate';
import { useAppStore } from './store/appStore';
import { convex } from './lib/convexClient';
import { PublicRoundtablePage } from './routes/PublicRoundtablePage';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true);
  },
});

function Bootstrap() {
  const initializeApp = useAppStore((state) => state.initializeApp);

  useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  return <App />;
}

function RootRouter() {
  const location = useLocation();
  const isPublicRoundtable = location.pathname.startsWith('/public/roundtable');

  if (isPublicRoundtable) {
    return (
      <Routes>
        <Route path="/public/roundtable/:slug" element={<PublicRoundtablePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <AuthGate>
      <Bootstrap />
    </AuthGate>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <BrowserRouter>
        <ThemeProvider>
          <RootRouter />
        </ThemeProvider>
      </BrowserRouter>
    </ConvexAuthProvider>
  </React.StrictMode>
);
