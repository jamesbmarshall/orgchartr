import { HashRouter, Routes, Route } from 'react-router';
import { Dashboard } from './pages/Dashboard';
import { ChartView } from './pages/ChartView';
import { Sponsors } from './pages/Sponsors';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chart/:chartId" element={<ChartView />} />
        <Route path="/sponsors" element={<Sponsors />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
