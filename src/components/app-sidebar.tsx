'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, History, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/brand-mark';

const NAV = [
  { href: '/', label: 'Übersicht', icon: Activity },
  { href: '/conflicts/', label: 'Konflikt-Log', icon: History },
  { href: '/settings/', label: 'Einstellungen', icon: SettingsIcon },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-sidebar">
      <div className="flex h-20 items-start gap-2 px-5 pt-[46px]">
        <BrandMark size={24} showWordmark />
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  const normalized = pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '/');
  if (href === '/') return normalized === '/' || normalized === '';
  return normalized.startsWith(href);
}
