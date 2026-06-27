import { LayoutDashboard, Bot, Zap, Clock, Brain, Settings, FileText, type LucideIcon } from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { path: '/', label: '仪表盘', shortLabel: '仪表盘', icon: LayoutDashboard },
  { path: '/agents', label: 'Agent 管理', shortLabel: 'Agent', icon: Bot },
  { path: '/capabilities', label: '能力中心', shortLabel: '能力', icon: Zap },
  { path: '/cron', label: '定时任务', shortLabel: '任务', icon: Clock },
  { path: '/memory', label: '记忆库', shortLabel: '记忆', icon: Brain },
  { path: '/config', label: '系统配置', shortLabel: '配置', icon: Settings },
  { path: '/logs', label: '日志中心', shortLabel: '日志', icon: FileText },
];
