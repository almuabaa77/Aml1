import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getMessaging, onMessage, isSupported } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Messaging safely
export const getMessagingInstance = async () => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const supported = await isSupported();
    if (supported) return getMessaging(app);
  } catch (err) {
    console.warn("Firebase Messaging is not supported in this environment:", err);
  }
  return null;
};

// Legacy export for compatibility, though getMessagingInstance is preferred
export const messaging = typeof window !== 'undefined' && 'serviceWorker' in navigator 
  ? (function() {
      try {
        return getMessaging(app);
      } catch (e) {
        return null;
      }
    })() 
  : null;

async function testConnection() {
  try {
    // Attempt to reach the server to verify connectivity
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection established successfully.");
  } catch (error) {
    if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('unavailable'))) {
      console.error("Firestore connectivity issue detected. Please verify your network or Firebase configuration.");
    }
  }
}

testConnection();

export default app;
