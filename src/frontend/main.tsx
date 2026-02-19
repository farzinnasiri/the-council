import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/globals.css';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { useAppStore } from './store/appStore';

registerSW({ immediate: true });

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function Bootstrap() {
  const initializeApp = useAppStore((state) => state.initializeApp);

  useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <ThemeProvider>
          <Bootstrap />
        </ThemeProvider>
      </BrowserRouter>
    </ConvexProvider>
  </React.StrictMode>
);

