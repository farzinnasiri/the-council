import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAppStore } from './store/appStore';

const AppShell = lazy(() => import('./layouts/AppShell').then((m) => ({ default: m.AppShell })));
const QuickStartPage = lazy(() => import('./routes/QuickStartPage').then((m) => ({ default: m.QuickStartPage })));
const HallPage = lazy(() => import('./routes/HallPage').then((m) => ({ default: m.HallPage })));
const HallDraftPage = lazy(() => import('./routes/HallDraftPage').then((m) => ({ default: m.HallDraftPage })));
const ChamberPage = lazy(() => import('./routes/ChamberPage').then((m) => ({ default: m.ChamberPage })));
const ChamberMemberPage = lazy(() => import('./routes/ChamberMemberPage').then((m) => ({ default: m.ChamberMemberPage })));
const MembersPage = lazy(() => import('./routes/MembersPage').then((m) => ({ default: m.MembersPage })));
const PersonalArchivePage = lazy(() => import('./routes/PersonalArchivePage').then((m) => ({ default: m.PersonalArchivePage })));
const ProfilePage = lazy(() => import('./routes/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const KbQueryPage = lazy(() => import('./routes/KbQueryPage').then((m) => ({ default: m.KbQueryPage })));

export default function App() {
  const hydrated = useAppStore((state) => state.hydrated);

  if (!hydrated) {
    return <div className="grid h-svh place-items-center text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <Suspense fallback={<div className="grid h-svh place-items-center text-sm text-muted-foreground">Loading...</div>}>
      <Routes>
        <Route path="/" element={<Navigate to="/start" replace />} />
        <Route element={<AppShell />}>
          <Route path="/start" element={<QuickStartPage />} />
          <Route path="/hall/new" element={<HallDraftPage />} />
          <Route path="/hall/:conversationId" element={<HallPage />} />
          <Route path="/chamber/member/:memberId" element={<ChamberMemberPage />} />
          <Route path="/chamber/:conversationId" element={<ChamberPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/archive" element={<PersonalArchivePage />} />
          <Route path="/kb-query" element={<KbQueryPage />} />
          <Route path="/settings" element={<ProfilePage />} />
          <Route path="/profile" element={<Navigate to="/settings" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/start" replace />} />
      </Routes>
    </Suspense>
  );
}
