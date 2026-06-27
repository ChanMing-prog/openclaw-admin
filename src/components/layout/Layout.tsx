import { ReactNode } from 'react';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-bg-primary transition-colors duration-slow ease-cl-in-out">
      <TopBar />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 pb-24 md:pb-8 lg:pb-6 min-h-[calc(100vh-64px)]">
          <div className="max-w-[1440px] mx-auto">
            {children}
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
