import { Bell, Settings2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { Tabs, TabsList, TabsTrigger } from '@/app/components/ui/tabs';

export function NotificationPageTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = location.pathname === '/notifications/settings' ? 'settings' : 'inbox';

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => navigate(value === 'settings' ? '/notifications/settings' : '/notifications/list')}
      className="mb-5"
    >
      <TabsList className="h-auto w-full justify-start gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900 sm:w-fit">
        <TabsTrigger value="inbox" className="min-h-10 flex-none gap-2 px-4">
          <Bell className="h-4 w-4" />
          Notifications
        </TabsTrigger>
        <TabsTrigger value="settings" className="min-h-10 flex-none gap-2 px-4">
          <Settings2 className="h-4 w-4" />
          Notification Settings
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
