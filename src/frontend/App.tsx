import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAppStore } from './store/appStore';

const AppShell = lazy(() => import('./layouts/AppShell').then((m) => ({ default: m.AppShell })));
const HallPage = lazy(() => import('./routes/HallPage').then((m) => ({ default: m.HallPage })));
const HallDraftPage = lazy(() => import('./routes/HallDraftPage').then((m) => ({ default: m.HallDraftPage })));
const ChamberPage = lazy(() => import('./routes/ChamberPage').then((m) => ({ default: m.ChamberPage })));
const ChamberMemberPage = lazy(() => import('./routes/ChamberMemberPage').then((m) => ({ default: m.ChamberMemberPage })));
const MembersPage = lazy(() => import('./routes/MembersPage').then((m) => ({ default: m.MembersPage })));
const SettingsPage = lazy(() => import('./routes/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ProfilePage = lazy(() => import('./routes/ProfilePage').then((m) => ({ default: m.ProfilePage })));

export default function App() {
  const hydrated = useAppStore((state) => state.hydrated);
  const firstHall = useAppStore((state) =>
    state.conversations.find((item) => item.kind === 'hall')
  );

  if (!hydrated) {
    return <div className="grid h-svh place-items-center text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <Suspense fallback={<div className="grid h-svh place-items-center text-sm text-muted-foreground">Loading...</div>}>
      <Routes>
        <Route path="/" element={<Navigate to={firstHall ? `/hall/${firstHall.id}` : '/hall/new'} replace />} />
        <Route element={<AppShell />}>
          <Route path="/hall/new" element={<HallDraftPage />} />
          <Route path="/hall/:conversationId" element={<HallPage />} />
          <Route path="/chamber/member/:memberId" element={<ChamberMemberPage />} />
          <Route path="/chamber/:conversationId" element={<ChamberPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
