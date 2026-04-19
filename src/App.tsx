import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Students } from './pages/Students';
import { Teachers } from './pages/Teachers';
import { Classes } from './pages/Classes';
import { Subjects } from './pages/Subjects';
import { Import } from './pages/Import';
import { Reports } from './pages/Reports';
import { Contributions } from './pages/Contributions';
import { PixConference } from './pages/PixConference';
import { Settings } from './pages/Settings';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="teachers" element={<Teachers />} />
          <Route path="classes" element={<Classes />} />
          <Route path="subjects" element={<Subjects />} />
          <Route path="import" element={<Import />} />
          <Route path="reports" element={<Reports />} />
          <Route path="contributions" element={<Contributions />} />
          <Route path="pix-conference" element={<PixConference />} />
          <Route path="settings" element={<Settings />} />
          {/* Add other routes as needed */}
        </Route>
      </Routes>
    </Router>
  );
}
