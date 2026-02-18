import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { HallPage } from './routes/HallPage';
import { ChamberPage } from './routes/ChamberPage';
import { MembersPage } from './routes/MembersPage';
import { SettingsPage } from './routes/SettingsPage';
import { ProfilePage } from './routes/ProfilePage';
import { useAppStore } from './store/appStore';

export default function App() {
  const hydrated = useAppStore((state) => state.hydrated);
  const firstHall = useAppStore((state) => state.conversations.find((item) => item.type === 'hall'));

  if (!hydrated) {
    return <div className="grid h-svh place-items-center text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={firstHall ? `/hall/${firstHall.id}` : '/members'} replace />} />
      <Route element={<AppShell />}>
        <Route path="/hall/:conversationId" element={<HallPage />} />
        <Route path="/chamber/:conversationId" element={<ChamberPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
