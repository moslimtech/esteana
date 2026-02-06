import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SplashScreen } from './SplashScreen';
import { AppLayout } from './layout/AppLayout';
import { MihrabPage } from './pages/MihrabPage';
import { AthariPage } from './pages/AthariPage';
import { ZadPage } from './pages/ZadPage';
import { SettingsPage } from './pages/SettingsPage';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<MihrabPage />} />
        <Route path="athari" element={<AthariPage />} />
        <Route path="zad" element={<ZadPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const isFileProtocol = typeof window !== 'undefined' && (
  window.location?.protocol === 'file:' || window.location?.hostname === 'app.esteana.local'
);

export default function App() {
  const Router = isFileProtocol ? HashRouter : BrowserRouter;
  return (
    <SplashScreen>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </Router>
    </SplashScreen>
  );
}
