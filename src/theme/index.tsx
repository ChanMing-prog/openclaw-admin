import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

// mode: 用户选择的主题模式；theme: 实际生效的主题（system 解析后）
type ThemeMode = 'light' | 'dark' | 'system';
type Theme = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;          // 用户选择
  theme: Theme;             // 实际生效
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'theme-mode';

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    }
    return 'system';  // 默认随系统
  });

  const [theme, setTheme] = useState<Theme>(() =>
    mode === 'system' ? getSystemTheme() : mode,
  );

  // mode 变化或系统主题变化时，重算实际 theme
  useEffect(() => {
    const apply = () => {
      const next = mode === 'system' ? getSystemTheme() : mode;
      setTheme(next);
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(next);
    };
    apply();

    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [mode]);

  const setMode = (m: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, m);
    setModeState(m);
  };

  return (
    <ThemeContext.Provider value={{ mode, theme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
