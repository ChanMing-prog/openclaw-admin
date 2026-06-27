import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/theme';
import Layout from '@/components/layout/Layout';
import Dashboard from '@/pages/Dashboard';
import Agents from '@/pages/Agents';
import Capabilities from '@/pages/Capabilities';
import Memory from '@/pages/Memory';
import Tasks from '@/pages/Tasks';
import Usage from '@/pages/Usage';
import Config from '@/pages/Config';
import Logs from '@/pages/Logs';

export default function App() {
  return (
    <ThemeProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/capabilities" element={<Capabilities />} />
            <Route path="/cron" element={<Tasks />} />
            <Route path="/usage" element={<Usage />} />
            <Route path="/memory" element={<Memory />} />
            <Route path="/config" element={<Config />} />
            <Route path="/logs" element={<Logs />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
}
