import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { navItems } from '@/config/navigation';

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="hidden md:flex lg:hidden flex-col items-center w-[72px] bg-surface border-r border-cl-border-faint py-4 gap-1">
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
    </aside>
  );
}
