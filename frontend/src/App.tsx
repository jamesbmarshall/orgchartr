import { HashRouter, Routes, Route } from 'react-router';
import { Dashboard } from './pages/Dashboard';
import { ChartView } from './pages/ChartView';
import { Sponsors } from './pages/Sponsors';
import { NotFound } from './pages/NotFound';
import { UndoToast } from './components/UndoToast';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chart/:chartId" element={<ChartView />} />
        <Route path="/sponsors" element={<Sponsors />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <UndoToast />
    </HashRouter>
  );
}

export default App;
