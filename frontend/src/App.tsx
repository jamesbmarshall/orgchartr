import { HashRouter, Routes, Route } from 'react-router';
import { Dashboard } from './pages/Dashboard';
import { ChartView } from './pages/ChartView';
import { Sponsors } from './pages/Sponsors';
import { NotFound } from './pages/NotFound';
import { UndoToast } from './components/UndoToast';
import { StorageGate } from './components/StorageGate';

export function App() {
  return (
    <StorageGate>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/chart/:chartId" element={<ChartView />} />
          <Route path="/sponsors" element={<Sponsors />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <UndoToast />
      </HashRouter>
    </StorageGate>
  );
}

export default App;
