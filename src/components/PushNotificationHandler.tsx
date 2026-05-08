import { useEffect } from 'react';
import OneSignal from 'react-onesignal';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PushNotificationHandler() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!user || user.role !== 'kid') return;

    const setupListeners = async () => {
      // Ensure OneSignal is initialized
      if (!(window as any)._oneSignalInitialized) {
        await new Promise(resolve => window.addEventListener('onesignal-ready', resolve, { once: true }));
      }

      // v5+ API
      const OneSignalSDK = (window as any).OneSignal || OneSignal;
      
      const onForegroundWillDisplay = (event: any) => {
        const notification = event.notification;
        // Prevent OneSignal from showing its own notification alert if we want to handle it ourselves
        // event.preventDefault(); 
        
        const title = notification.title;
        const body = notification.body;

        if (title?.includes('huỷ')) {
          toast.error(`😔 ${body}`, {
            duration: 6000,
            style: {
              background: '#FEF2F2',
              color: '#991B1B',
              border: '1px solid #FECACA',
              borderRadius: '24px',
              padding: '16px 24px',
              fontSize: '14px',
              fontWeight: '700',
            },
            icon: null,
          });
        } else {
          toast(body, {
            icon: '🔔',
            duration: 4000,
          });
        }
      };

      const onNotificationClick = (event: any) => {
        const url = event.notification.launchURL;
        if (url) {
          // OneSignal handles external URLs, but for internal ones we might want to navigate
          if (url.startsWith('/')) {
            navigate(url);
          }
        }
      };

      if (OneSignalSDK.Notifications) {
        OneSignalSDK.Notifications.addEventListener('foregroundWillDisplay', onForegroundWillDisplay);
        OneSignalSDK.Notifications.addEventListener('click', onNotificationClick);
      }

      return () => {
        if (OneSignalSDK.Notifications) {
          OneSignalSDK.Notifications.removeEventListener('foregroundWillDisplay', onForegroundWillDisplay);
          OneSignalSDK.Notifications.removeEventListener('click', onNotificationClick);
        }
      };
    };

    setupListeners();
  }, [user, navigate]);

  return null;
}
