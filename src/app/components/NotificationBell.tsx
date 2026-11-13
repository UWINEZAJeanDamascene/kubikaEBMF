import { useState, useEffect, useRef } from 'react';
import { Bell, Package, FileText, AlertTriangle, Clock, Check, Trash2, ExternalLink, List } from 'lucide-react';
import { useNavigate } from 'react-router';
import { notificationsApi, Notification } from '../../lib/api';
import { Button } from './ui/button';
import { cn } from './ui/utils';
import { io, Socket } from 'socket.io-client';
import { API_ORIGIN } from '@/lib/apiBase';

const typeIcons: Record<string, React.ElementType> = {
  low_stock: Package,
  invoice: FileText,
  payment: FileText,
  reorder: AlertTriangle,
  expiry: Clock,
  system: Bell,
  alert: AlertTriangle,
};

const severityColors: Record<string, string> = {
  info: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300',
  warning: 'bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300',
  critical: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300',
};

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const navigate = useNavigate();
  const pageRef = useRef(1);

  // Fetch notifications
  const fetchNotifications = async (reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const page = reset ? 1 : pageRef.current;
      const response = await notificationsApi.getAll({ 
        page, 
        limit: 10,
        unreadOnly: reset 
      });
      
      if (response.success) {
        if (reset) {
          setNotifications(response.data);
          pageRef.current = 2;
        } else {
          setNotifications(prev => [...prev, ...response.data]);
          pageRef.current += 1;
        }
        setUnreadCount(response.unreadCount);
        setHasMore(response.pagination.page < response.pagination.pages);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchNotifications(true);
  
    // Poll for new notifications every 30 seconds
    const interval = setInterval(() => {
      fetchNotifications(true);
    }, 30000);
  
    return () => clearInterval(interval);
  }, []);

  // Socket.io realtime subscription (falls back to polling above)
  useEffect(() => {
    try {
      const token = sessionStorage.getItem('token');
      if (!token) return;

      const socketUrl = API_ORIGIN || window.location.origin;

      const socket = io(socketUrl, { auth: { token } });
      socketRef.current = socket as Socket;

      socket.on('connect', () => {
        // console.log('socket connected');
      });

      socket.on('notification', (payload: any) => {
        if (!payload) return;
        // payload is the Notification object created on the server
        setNotifications(prev => [payload, ...prev]);
        setUnreadCount(prev => prev + 1);
      });

      socket.on('disconnect', () => {
        socketRef.current = null;
      });

      return () => {
        try { socket.disconnect(); } catch (e) { /* ignore */ }
      };
    } catch (err) {
      // ignore socket errors and rely on polling
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mark single notification as read
  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await notificationsApi.markAsRead(id);
      setNotifications(prev => 
        prev.map(n => n._id === id ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  // Delete notification
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await notificationsApi.delete(id);
      const notification = notifications.find(n => n._id === id);
      setNotifications(prev => prev.filter(n => n._id !== id));
      if (notification && !notification.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  // Handle notification click
  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      handleMarkAsRead(notification._id, { stopPropagation: () => {} } as React.MouseEvent);
    }
    if (notification.link) {
      navigate(notification.link);
    }
    setIsOpen(false);
  };

  // Load more notifications
  const handleLoadMore = () => {
    if (!loading && hasMore) {
      fetchNotifications(false);
    }
  };

  // Format relative time
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          if (!isOpen) {
            fetchNotifications(true);
          }
          setIsOpen(!isOpen);
        }}
        className="relative h-10 w-10 min-h-10 min-w-10 flex-shrink-0 rounded-xl border border-transparent bg-transparent text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-card">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 md:w-96 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-800 dark:text-white">Notifications</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllAsRead}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
              >
                Mark all read
              </Button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No notifications yet</p>
              </div>
            ) : (
              <>
                {notifications.map((notification) => {
                  const Icon = typeIcons[notification.type] || Bell;
                  return (
                    <div
                      key={notification._id}
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors",
                        !notification.isRead && "bg-indigo-50/50 dark:bg-indigo-900/20"
                      )}
                    >
                      <div className={cn(
                        "flex-shrink-0 p-2 rounded-full",
                        severityColors[notification.severity] || severityColors.info
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn(
                            "text-sm font-medium truncate",
                            notification.isRead 
                              ? "text-slate-600 dark:text-slate-300" 
                              : "text-slate-800 dark:text-white"
                          )}>
                            {notification.title}
                          </p>
                          {!notification.isRead && (
                            <span className="flex-shrink-0 w-2 h-2 rounded-full bg-indigo-500" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                          {notification.message}
                        </p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {formatTimeAgo(notification.createdAt)}
                          </span>
                          <div className="flex items-center gap-1">
                            {!notification.isRead && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e: React.MouseEvent) => handleMarkAsRead(notification._id, e)}
                                title="Mark as read"
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                            )}
                            {notification.link && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  navigate(notification.link!);
                                  setIsOpen(false);
                                }}
                                title="View details"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-500 hover:text-red-600"
                              onClick={(e: React.MouseEvent) => handleDelete(notification._id, e)}
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {hasMore && (
                  <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleLoadMore}
                      disabled={loading}
                    >
                      {loading ? 'Loading...' : 'Load more'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
          {/* Footer with View All link */}
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
              onClick={() => {
                navigate('/notifications/list');
                setIsOpen(false);
              }}
            >
              <List className="h-4 w-4 mr-2" />
              View all notifications
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
