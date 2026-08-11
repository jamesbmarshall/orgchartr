import { HashRouter, Routes, Route } from 'react-router';
import { Dashboard } from './pages/Dashboard';
import { ChartView } from './pages/ChartView';
import { Sponsors } from './pages/Sponsors';
import { NotFound } from './pages/NotFound';
import { UndoToast } from './components/UndoToast';
import { StorageGate } from './components/StorageGate';
import { AppFooter } from './components/AppFooter';

export function App() {
  return (
    <StorageGate>
      <HashRouter>
        <div className="app-shell">
          <main className="app-shell__content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/chart/:chartId" element={<ChartView />} />
              <Route path="/sponsors" element={<Sponsors />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <AppFooter />
          <UndoToast />
        </div>
      </HashRouter>
    </StorageGate>
  );
}

export default App;
