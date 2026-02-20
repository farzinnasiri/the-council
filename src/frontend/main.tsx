import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/globals.css';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { AuthGate } from './components/auth/AuthGate';
import { useAppStore } from './store/appStore';
import { convex } from './lib/convexClient';

registerSW({ immediate: true });

function Bootstrap() {
  const initializeApp = useAppStore((state) => state.initializeApp);

  useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthGate>
            <Bootstrap />
          </AuthGate>
        </ThemeProvider>
      </BrowserRouter>
    </ConvexAuthProvider>
  </React.StrictMode>
);
