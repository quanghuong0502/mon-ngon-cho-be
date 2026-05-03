import { 
  collection, 
  getDocs, 
  deleteDoc, 
  doc, 
  writeBatch,
  query,
  limit
} from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLLECTIONS_TO_CLEAR = [
  'recipes',
  'weeklyMenu',
  'orders',
  'reviews',
  'news',
  'achievements'
];

async function deleteCollection(collectionPath: string) {
  console.log(`Clearing collection: ${collectionPath}...`);
  const colRef = collection(db, collectionPath);
  const snapshot = await getDocs(colRef);
  
  if (snapshot.empty) {
    console.log(`Collection ${collectionPath} is already empty.`);
    return;
  }

  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  await batch.commit();
  console.log(`Successfully cleared ${snapshot.size} documents from ${collectionPath}.`);
}

async function clearUserSubCollections() {
  console.log('Clearing user progress (unlockedAchievements & notifications)...');
  const usersRef = collection(db, 'users');
  const usersSnapshot = await getDocs(usersRef);

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    
    // Clear unlockedAchievements
    const unlockRef = collection(db, 'users', userId, 'unlockedAchievements');
    const unlockSnap = await getDocs(unlockRef);
    if (!unlockSnap.empty) {
      const batch = writeBatch(db);
      unlockSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log(`- Cleared accomplishments for user ${userId}`);
    }

    // Clear notifications
    const notiRef = collection(db, 'users', userId, 'notifications');
    const notiSnap = await getDocs(notiRef);
    if (!notiSnap.empty) {
      const batch = writeBatch(db);
      notiSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log(`- Cleared notifications for user ${userId}`);
    }

    // Reset user fields like readNews and favorites if needed
    const batch = writeBatch(db);
    batch.update(userDoc.ref, {
      readNews: [],
      favorites: []
    });
    await batch.commit();
  }
}

async function resetDatabase() {
  console.log('🚀 Starting Database Reset (Preserving Users)...');
  
  try {
    // 1. Clear top-level collections
    for (const col of COLLECTIONS_TO_CLEAR) {
      await deleteCollection(col);
    }

    // 2. Clear sub-collections and user-specific data
    await clearUserSubCollections();

    // 3. Clear kitchen config (optional - keeping it might be better, but user asked for "whole database")
    // If you want to keep the kitchen setup, comment out the line below:
    await deleteCollection('config');

    console.log('\n✅ Database reset complete!');
    console.log('NOTE: User accounts in "users" collection were preserved, but their progress was cleared.');
  } catch (error) {
    console.error('❌ Reset failed:', error);
  }
}

resetDatabase();
