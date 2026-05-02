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

    // Seed default achievements if empty
    const achievementsRef = collection(db, 'achievements');
    const achievementsSnapshot = await getDocs(query(achievementsRef, limit(1)));
    if (achievementsSnapshot.empty) {
      console.log('Seeding initial achievements...');
      const defaultAchievements = [
        { 
          emoji: '🍱', 
          title: 'Bữa đầu tiên', 
          description: 'Hoàn thành bữa ăn đầu tiên', 
          logic: 'AND',
          conditions: [{ type: 'total_orders_done', operator: 'gte', value: 1, label: 'Tổng số bữa đã hoàn thành ≥ 1' }],
          order: 1, 
          isActive: true, 
          createdAt: serverTimestamp() 
        },
        { 
          emoji: '🔥', 
          title: '3 ngày liên tiếp', 
          description: 'Đặt món 3 ngày liên tiếp', 
          logic: 'AND',
          conditions: [{ type: 'current_streak', operator: 'gte', value: 3, label: 'Streak hiện tại ≥ 3' }],
          order: 2, 
          isActive: true, 
          createdAt: serverTimestamp() 
        },
        { 
          emoji: '⭐', 
          title: 'Người đánh giá', 
          description: 'Gửi đánh giá đầu tiên', 
          logic: 'AND',
          conditions: [{ type: 'total_reviews', operator: 'gte', value: 1, label: 'Tổng số đánh giá ≥ 1' }],
          order: 3, 
          isActive: true, 
          createdAt: serverTimestamp() 
        },
        { 
          emoji: '🏆', 
          title: 'Thực khách chăm chỉ', 
          description: '5 ngày liên tiếp VÀ ăn 5 bữa', 
          logic: 'AND',
          conditions: [
            { type: 'current_streak', operator: 'gte', value: 5, label: 'Streak hiện tại ≥ 5' },
            { type: 'total_orders_done', operator: 'gte', value: 5, label: 'Tổng số bữa đã hoàn thành ≥ 5' }
          ],
          order: 4, 
          isActive: true, 
          createdAt: serverTimestamp() 
        },
        { 
          emoji: '❤️', 
          title: 'Sành ăn', 
          description: 'Thêm 3 món vào yêu thích', 
          logic: 'AND',
          conditions: [{ type: 'total_favorites', operator: 'gte', value: 3, label: 'Số món yêu thích ≥ 3' }],
          order: 5, 
          isActive: true, 
          createdAt: serverTimestamp() 
        },
        { 
          emoji: '🌟', 
          title: 'Gia đình gắn kết', 
          description: 'Tham gia 1 tuần VÀ ăn ít nhất 3 bữa', 
          logic: 'AND',
          conditions: [
            { type: 'days_since_joined', operator: 'gte', value: 7, label: 'Số ngày từ khi tham gia ≥ 7' },
            { type: 'total_orders_done', operator: 'gte', value: 3, label: 'Tổng số bữa đã hoàn thành ≥ 3' }
          ],
          order: 6, 
          isActive: true, 
          createdAt: serverTimestamp() 
        }
      ];

      for (const achievement of defaultAchievements) {
        // Better slugification: remove accents and non-alphanumeric
        const achievementId = achievement.title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');
          
        await setDoc(doc(db, 'achievements', achievementId), achievement);
      }
      console.log('Achievements seeded!');
    }
  } catch (error) {
    console.error('Error seeding data:', error);
  }
}
