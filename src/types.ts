/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'chef' | 'kid';

export interface UserSession {
  userId: string;
  username: string;
  role: UserRole;
  name: string;
  avatar?: string;
  favorites?: string[];
}

export interface User {
  id?: string;
  username: string;
  password?: string;
  role: UserRole;
  name: string;
  avatar?: string;
  oneSignalIds?: string[];
  createdAt: any;
  readNews: string[];
  favorites?: string[];
}

export interface Recipe {
  id?: string;
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  tags: string[];
  imageUrl?: string;
  thumbnailUrl?: string;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
  isPublished: boolean;
  avgRating: number;
  totalRatings: number;
  favoriteCount?: number;
  reviewTags?: {
    star: number;
    tags: string[];
  }[];
}

export interface WeeklyMenu {
  id?: string;
  weekStart: string; // Monday date YYYY-MM-DD
  slots: {
    mon: string[];
    tue: string[];
    wed: string[];
    thu: string[];
    fri: string[];
  };
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'on_the_way' | 'arrived' | 'done' | 'cancelled';

export interface Order {
  id?: string;
  kidId: string;
  weekId: string;
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  recipeId?: string; // Keep for backward compatibility during migration
  recipeIds: string[];
  status: OrderStatus;
  cancelReason?: string;
  createdAt: any;
  updatedAt: any;
  itemAddedAt?: Record<string, any>;
}

export interface Review {
  id?: string;
  orderId?: string; // Optional because replies might not be directly linked to an order
  recipeId?: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  authorRole: UserRole;
  rating?: number; // Optional for replies
  comment: string;
  imageUrls?: string[];
  createdAt: any;
  parentId?: string; // For threaded comments
}

export interface News {
  id?: string;
  title: string;
  content: string;
  imageUrl?: string;
  createdBy: string;
  createdAt: any;
  isPinned: boolean;
}
