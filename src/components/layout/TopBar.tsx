import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '@/theme';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navItems } from '@/config/navigation';
import NotificationBell from '@/components/NotificationBell';

export default function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

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
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-lg text-cl-text-muted hover:text-cl-text-primary hover:bg-surface-hover transition-all duration-fast ease-cl-out"
            title={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
          >
            {theme === 'light' ? (
              <Moon size={18} />
            ) : (
              <Sun size={18} />
            )}
          </button>
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
