/* eslint-disable no-undef */
// importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
// importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// Using the modern ESM module syntax or the compat one. 
// For Service Workers in public/, compat is usually safer for broad browser support.

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB55MRsGbB2_2Sqs5PacgkD8lCNI14XEFY",
  authDomain: "abdullah-7ed3b.firebaseapp.com",
  projectId: "abdullah-7ed3b",
  storageBucket: "abdullah-7ed3b.firebasestorage.app",
  messagingSenderId: "625085232311",
  appId: "1:625085232311:web:a3ace7ab5e50d10c56c932"
});

// PWA Caching Logic
const CACHE_NAME = 'tawasul-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cacheCopy);
          });
        }
        return networkResponse;
      });
      return cachedResponse || fetchPromise;
    })
  );
});

const messaging = firebase.messaging();

// Handle background messages with premium design and actions
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const { title, body, icon, image, type, senderName, chatId, callType, url } = payload.data || payload.notification || {};

  const notificationTitle = title || (type === 'call' ? `مكالمة ${callType === 'video' ? 'فيديو' : 'صوتية'} واردة` : `رسالة من ${senderName || 'صديق'}`);
  
  const notificationOptions = {
    body: body || (type === 'call' ? `اتصال من ${senderName}...` : 'لديك رسالة جديدة'),
    icon: icon || 'https://picsum.photos/seed/tawasul_icon/512/512',
    image: image || (type === 'call' ? 'https://picsum.photos/seed/premium_call/800/400' : undefined),
    badge: 'https://picsum.photos/seed/tawasul_icon/192/192',
    tag: type === 'call' ? `call-${chatId}` : `msg-${chatId}`,
    renotify: true,
    requireInteraction: type === 'call',
    vibrate: type === 'call' ? [500, 110, 500, 110, 450, 110, 200, 110] : [200, 100, 200],
    data: {
      url: url || (type === 'call' ? '/calls' : (chatId ? `/chat/${chatId}` : '/')),
      chatId,
      type
    },
    actions: []
  };

  // Add professional actions based on type
  if (type === 'call') {
    notificationOptions.actions = [
      { action: 'accept', title: 'رد وارد', icon: 'https://img.icons8.com/ios-filled/50/22C55E/phone.png' },
      { action: 'decline', title: 'تجاهل', icon: 'https://img.icons8.com/ios-filled/50/EF4444/phone.png' }
    ];
  } else {
    notificationOptions.actions = [
      { action: 'reply', title: 'رد سريع', icon: 'https://img.icons8.com/ios-filled/50/3B82F6/sent.png' },
      { action: 'mark_read', title: 'تمت القراءة' }
    ];
  }

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Click listener to handle actions and opening the app
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click/action:', event.action);
  event.notification.close();

  const data = event.notification.data;
  let urlToOpen = data?.url || '/';

  // Handle specific actions
  if (event.action === 'accept') {
    urlToOpen = '/calls'; // Go to calls screen to answer
  } else if (event.action === 'reply') {
    urlToOpen = data?.chatId ? `/chat/${data.chatId}` : '/';
  } else if (event.action === 'mark_read') {
    // In a real app, you'd send an API request here to mark as read
    console.log('Marking message as read for chatId:', data?.chatId);
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.navigate(urlToOpen).then(c => c.focus());
        }
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});
