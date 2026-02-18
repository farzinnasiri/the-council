import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/globals.css';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { useAppStore } from './store/appStore';

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
    <BrowserRouter>
      <ThemeProvider>
        <Bootstrap />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
