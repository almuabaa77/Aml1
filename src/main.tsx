import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register Service Worker for Notifications and PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Register the specialized firebase messaging worker for background notifications
    navigator.serviceWorker.register('/firebase-messaging-sw.js').then(registration => {
      console.log('Firebase Messaging SW registered: ', registration);
    }).catch(err => {
      console.log('SW registration failed: ', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
