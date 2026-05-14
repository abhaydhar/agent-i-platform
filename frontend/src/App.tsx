import { Navigate, Route, Routes } from 'react-router-dom';

import { Layout } from '@/components/Layout';
import { AdminLayout } from '@/components/AdminLayout';
import { Home } from '@/pages/Home';
import { AgentRun } from '@/pages/AgentRun';
import { Chat } from '@/pages/Chat';
import { NotFound } from '@/pages/NotFound';
import { AgentsList } from '@/pages/Admin/AgentsList';
import { AgentEditor } from '@/pages/Admin/AgentEditor';
import { SkillsList } from '@/pages/Admin/SkillsList';
import { Settings } from '@/pages/Admin/Settings';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/agent/:id/run" element={<AgentRun />} />
        <Route path="/chat/:sessionId" element={<Chat />} />

        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="agents" replace />} />
          <Route path="agents" element={<AgentsList />} />
          <Route path="agents/new" element={<AgentEditor />} />
          <Route path="agents/:id" element={<AgentEditor />} />
          <Route path="skills" element={<SkillsList />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
