import { useEffect, useCallback, useRef } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getMessagingInstance, db } from '../lib/firebase';
import { toast } from 'sonner';
import { useAuth } from './useAuth';

export const useNotifications = (userId: string | undefined) => {
  const { profile } = useAuth();
  const notificationSound = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const soundUrl = profile?.notifications?.messageSound || 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3';
    notificationSound.current = new Audio(soundUrl);
    notificationSound.current.volume = 0.5;
  }, [profile?.notifications?.messageSound]);

  const requestPermission = useCallback(async () => {
    const messaging = await getMessagingInstance();
    if (!messaging || !userId) return;

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
        });

        if (token) {
          console.log('FCM Token generated:', token);
          // Store token in Firestore to enable backend push
          const userRef = doc(db, 'users', userId);
          await updateDoc(userRef, {
            fcmTokens: arrayUnion(token)
          });
        }
      } else {
        console.warn('Notification permission denied');
      }
    } catch (error) {
      console.error('Error getting FCM token:', error);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      requestPermission();
    }
  }, [userId, requestPermission]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupListener = async () => {
      const messaging = await getMessagingInstance();
      if (!messaging) return;

      // Handle foreground messages
      unsubscribe = onMessage(messaging, (payload) => {
        console.log('Foreground message received:', payload);
        
        // Play notification sound
        if (notificationSound.current) {
          notificationSound.current.play().catch(e => console.log('Sound play blocked by browser:', e));
        }

        const { title, body } = payload.notification || {};
        
        if (title) {
          toast(title, {
            description: body,
            action: {
              label: 'عرض',
              onClick: () => {
                // Handle notification click if needed
                if (payload.data?.url) {
                  window.location.href = payload.data.url;
                }
              }
            }
          });
        }
      });
    };

    setupListener();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return { requestPermission };
};
