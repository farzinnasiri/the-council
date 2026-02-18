import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/sidebar/Sidebar';
import { Sheet, SheetContent } from '../components/ui/sheet';
import { useAppStore } from '../store/appStore';
import { TopBar } from '../components/header/TopBar';
import { cn } from '../lib/utils';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const location = useLocation();
  const conversations = useAppStore((state) => state.conversations);

  const activeConversation = useMemo(() => {
    const parts = location.pathname.split('/');
    const conversationId = parts[2];
    if (!conversationId) return undefined;
    return conversations.find((item) => item.id === conversationId);
  }, [conversations, location.pathname]);

  const headerMeta = useMemo(() => {
    if (activeConversation) {
      return {
        title: activeConversation.title,
        subtitle: '',
        showParticipants: true,
      };
    }

    if (location.pathname.startsWith('/members')) {
      return {
        title: 'Members',
        subtitle: '',
        showParticipants: false,
      };
    }

    if (location.pathname.startsWith('/settings')) {
      return {
        title: 'Settings',
        subtitle: '',
        showParticipants: false,
      };
    }

    if (location.pathname.startsWith('/profile')) {
      return {
        title: 'Profile',
        subtitle: '',
        showParticipants: false,
      };
    }

    return {
      title: 'The Council',
      subtitle: '',
      showParticipants: false,
    };
  }, [activeConversation, location.pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const onChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };
    setIsMobile(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setDesktopCollapsed(false);
    } else {
      setMobileOpen(false);
    }
  }, [isMobile]);

  return (
    <div className="relative h-svh overflow-hidden bg-background text-foreground">
      <div
        className={cn(
          'relative grid h-full md:transition-[grid-template-columns] md:duration-400 md:ease-[cubic-bezier(0.22,1,0.36,1)]',
          desktopCollapsed ? 'md:grid-cols-[0px_1fr]' : 'md:grid-cols-[320px_1fr]'
        )}
      >
        <div
          className={cn(
            'hidden overflow-hidden md:block md:transition-[border-color] md:duration-300',
            desktopCollapsed ? 'border-r-0' : 'border-r border-border/80'
          )}
        >
          <div
            className={cn(
              'h-full w-[320px] md:will-change-transform md:transition-all md:duration-400 md:ease-[cubic-bezier(0.22,1,0.36,1)]',
              desktopCollapsed && 'md:pointer-events-none md:-translate-x-4 md:opacity-0'
            )}
          >
            <Sidebar />
          </div>
        </div>

        <div className="flex min-w-0 min-h-0 flex-col">
          <TopBar
            conversation={activeConversation}
            title={headerMeta.title}
            subtitle={headerMeta.subtitle}
            showParticipants={headerMeta.showParticipants}
            onToggleSidebar={() => {
              if (isMobile) {
                setMobileOpen((current) => !current);
                return;
              }
              setDesktopCollapsed((current) => !current);
            }}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </div>
        </div>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent className="p-0">
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
