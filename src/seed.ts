/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, getDocs, setDoc, doc, serverTimestamp, query, limit } from 'firebase/firestore';
import { db } from './lib/firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function seedData() {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, limit(1));
    let snapshot;
    try {
      snapshot = await getDocs(q);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'users');
      return;
    }

    if (snapshot.empty) {
      console.log('Seeding initial users...');
      
      const chef = {
        username: "quanghuong",
        password: "123456",
        role: "chef",
        name: "Quang Hương",
        createdAt: serverTimestamp(),
        readNews: []
      };

      const kid = {
        username: "bichhue",
        password: "123456",
        role: "kid",
        name: "Bích Huệ",
        createdAt: serverTimestamp(),
        readNews: []
      };

      try {
        await setDoc(doc(db, 'users', 'seed_chef'), chef);
        await setDoc(doc(db, 'users', 'seed_kid'), kid);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'users/seed_chef');
      }
      
      console.log('Seed successful!');
    }
  } catch (error) {
    console.error('Error seeding data:', error);
  }
}
