import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const conversations = useAppStore((state) => state.conversations);
  const members = useAppStore((state) => state.members);
  const anyUploadInProgress = useAppStore((state) =>
    Object.values(state.kbUploadProgressByMember).some((rows) => rows.length > 0)
  );

  const activeConversation = useMemo(() => {
    const parts = location.pathname.split('/');
    if (parts[1] === 'hall' && parts[2] && parts[2] !== 'new') {
      return conversations.find((item) => item.id === parts[2]);
    }
    if (parts[1] === 'chamber' && parts[2] === 'member' && parts[3]) {
      return conversations
        .filter((item) => item.kind === 'chamber' && item.chamberMemberId === parts[3] && !item.deletedAt)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    }
    if (parts[1] === 'chamber' && parts[2]) {
      return conversations.find((item) => item.id === parts[2]);
    }
    return undefined;
  }, [conversations, location.pathname]);

  const headerMeta = useMemo(() => {
    if (activeConversation) {
      if (activeConversation.kind === 'chamber') {
        const chamberMember = activeConversation.chamberMemberId
          ? members.find((item) => item.id === activeConversation.chamberMemberId)
          : undefined;
        return {
          title: activeConversation.title,
          subtitle: chamberMember?.name ?? 'Chamber',
          showParticipants: true,
        };
      }
      return {
        title: activeConversation.title,
        subtitle:
          activeConversation.hallMode === 'roundtable'
            ? 'Roundtable'
            : 'Advisory',
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

    if (location.pathname.startsWith('/kb-query')) {
      return {
        title: 'KB Query',
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

    if (location.pathname.startsWith('/hall/new')) {
      return {
        title: 'New Hall',
        subtitle: '',
        showParticipants: false,
      };
    }

    if (location.pathname.startsWith('/chamber/member/')) {
      const memberId = location.pathname.split('/')[3];
      const member = members.find((item) => item.id === memberId);
      return {
        title: member ? `Chamber · ${member.name}` : 'Chamber',
        subtitle: '',
        showParticipants: false,
      };
    }

    return {
      title: 'The Council',
      subtitle: '',
      showParticipants: false,
    };
  }, [activeConversation, location.pathname, members]);

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

  useEffect(() => {
    if (!anyUploadInProgress) return;

    const onClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href) return;
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      const next = `${url.pathname}${url.search}${url.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next === current) return;

      event.preventDefault();
      event.stopPropagation();

      const shouldLeave = window.confirm(
        'A file upload is still in progress. Leaving now may cancel the upload. Do you want to leave this page?'
      );
      if (shouldLeave) {
        navigate(next);
      }
    };

    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, [anyUploadInProgress, navigate]);

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
