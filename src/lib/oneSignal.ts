import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = import.meta.env.VITE_ONESIGNAL_REST_API_KEY;

export const sendPushToUser = async (oneSignalIds: string | string[], title: string, body: string, url = '/') => {
  const ids = Array.isArray(oneSignalIds) ? oneSignalIds : [oneSignalIds];
  if (ids.length === 0) {
    console.warn('sendPushToUser skipped: no oneSignalIds');
    return;
  }

  try {
    const response = await fetch('/api/notifications/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        include_subscription_ids: ids,
        title,
        body,
        url
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Push Proxy Error:', errorData);
    } else {
      const data = await response.json();
      console.log('Push successfully sent via proxy:', data);
    }
  } catch (err) {
    console.error('Push Proxy Network Error:', err);
  }
};

export const getChefOneSignalIds = async () => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', '==', 'chef'));
    const snapshot = await getDocs(q);
    const ids: string[] = [];
    snapshot.docs.forEach(d => {
      const chefIds = d.data()?.oneSignalIds || [];
      ids.push(...chefIds);
    });
    return ids;
  } catch (err) {
    console.error('Error getting chef OneSignal IDs:', err);
    return [];
  }
};

export const getAllKidOneSignalIds = async () => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', '==', 'kid'));
    const snapshot = await getDocs(q);
    const ids: string[] = [];
    snapshot.docs.forEach(d => {
      const kidIds = d.data()?.oneSignalIds || [];
      ids.push(...kidIds);
    });
    return ids;
  } catch (err) {
    console.error('Error getting kid OneSignal IDs:', err);
    return [];
  }
};
