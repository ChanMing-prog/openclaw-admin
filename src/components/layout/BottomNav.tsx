import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { navItems } from '@/config/navigation';

export default function BottomNav() {
  const location = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-lg border-t border-cl-border-faint z-50 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn('cl-nav-item', isActive && 'active')}
            >
              <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
              <span className="label-small text-[10px]">{item.shortLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
