import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from '../../store/appStore';
import type { ThemeMode } from '../../types/domain';

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;

  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useAppStore((state) => state.themeMode);
  const setModeInternal = useAppStore((state) => state.setThemeMode);

  useEffect(() => {
    applyTheme(mode);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => applyTheme(mode);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [mode]);

  const value = useMemo(
    () => ({
      mode,
      setMode: (nextMode: ThemeMode) => {
        void setModeInternal(nextMode);
      },
    }),
    [mode, setModeInternal]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return context;
}
