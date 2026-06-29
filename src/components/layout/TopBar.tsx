import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '@/theme';
import { Sun, Moon, Monitor, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navItems } from '@/config/navigation';
import NotificationBell from '@/components/NotificationBell';

const THEME_OPTIONS = [
  { value: 'light', label: '日间', icon: Sun },
  { value: 'dark', label: '夜间', icon: Moon },
  { value: 'system', label: '随系统', icon: Monitor },
] as const;

export default function TopBar() {
  const { mode, theme, setMode } = useTheme();
  const location = useLocation();
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!themeMenuOpen) return;
    const handle = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [themeMenuOpen]);

  const CurrentIcon = theme === 'light' ? Sun : Moon;

  return (
    <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-lg border-b border-cl-border-faint transition-all duration-slow ease-cl-in-out">
      <div className="flex items-center justify-between h-16 px-6 max-w-[1920px] mx-auto">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-lg bg-brand flex items-center justify-center shadow-xs group-hover:shadow-sm transition-shadow duration-normal ease-cl-out">
            <span className="text-white font-semibold text-sm tracking-tight">OC</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold text-cl-text-primary leading-tight">OpenClaw</h1>
            <p className="text-[11px] text-cl-text-muted leading-tight">控制中台</p>
          </div>
        </Link>

        {/* Navigation - Desktop */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'cl-nav-item flex-row gap-2 px-4 py-2 rounded-lg min-w-0',
                  isActive && 'active'
                )}
              >
                <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
                <span className="text-[13px]">{item.shortLabel}</span>
              </Link>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <div className="relative" ref={themeMenuRef}>
            <button
              onClick={() => setThemeMenuOpen(!themeMenuOpen)}
              className="flex items-center gap-1.5 p-2.5 rounded-lg text-cl-text-muted hover:text-cl-text-primary hover:bg-surface-hover transition-all duration-fast ease-cl-out"
              title="主题模式"
            >
              <CurrentIcon size={18} />
              <ChevronDown size={12} className={cn('transition-transform', themeMenuOpen && 'rotate-180')} />
            </button>
            {themeMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 cl-card p-1 shadow-lg animate-fade-in z-50">
                {THEME_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = mode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setMode(opt.value);
                        setThemeMenuOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                        active
                          ? 'bg-surface-hover text-cl-text-primary'
                          : 'text-cl-text-secondary hover:bg-surface-hover hover:text-cl-text-primary',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Icon size={14} />
                        {opt.label}
                      </span>
                      {active && <Check size={14} className="text-brand" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
