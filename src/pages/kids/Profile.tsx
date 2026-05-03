import React, { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, updateDoc, setDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { sendPushToUser } from '../../lib/oneSignal';
import { useAuth } from '../../context/AuthContext';
import { 
  UserCircle, 
  Camera, 
  Loader2, 
  Flame, 
  Heart, 
  Utensils, 
  Trophy, 
  Star, 
  Crown, 
  Award, 
  CheckCircle2, 
  Check,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import Avatar from '../../components/Avatar';
import { User } from '../../types';
import { useNavigate } from 'react-router-dom';
import { useStreak } from '../../hooks/useStreak';
import { useTheme } from '../../context/ThemeContext';
import { useFavoritesContext } from '../../context/FavoritesContext';
import { collection, query, where, getDocs, getCountFromServer, orderBy } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';

interface AchievementCondition {
  type: string;
  operator: 'gte' | 'lte' | 'eq' | 'gt' | 'lt';
  value: number;
  label: string;
}

interface AchievementRule {
  id: string;
  title: string;
  description: string;
  emoji: string;
  isActive: boolean;
  order: number;
  logic: 'AND' | 'OR';
  conditions: AchievementCondition[];
}

interface UserStats {
  totalOrders: number;
  ordersThisWeek: number;
  ordersThisMonth: number;
  cancelledOrders: number;
  uniqueRecipes: number;
  uniqueRecipesThisWeek: number;
  triedRecipeIds: { id: string, name: string }[];
  currentStreak: number;
  longestStreak: number;
  perfectWeeks: number;
  totalReviews: number;
  fiveStarReviews: number;
  reviewsWithPhoto: number;
  reviewsWithComment: number;
  favCount: number;
  favoritesTried: number;
  daysSinceJoined: number;
  weeksJoined: number;
}

interface UnlockedInfo {
  unlockedAt: any;
  isCelebrated?: boolean;
  celebratedAt?: any;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

export default function Profile() {
  const { user, login } = useAuth();
  const { favorites } = useFavoritesContext();
  const { streak, longestStreak } = useStreak(user?.userId);
  const [profile, setProfile] = useState<User | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [achievements, setAchievements] = useState<AchievementRule[]>([]);
  const [unlockedIds, setUnlockedIds] = useState<Record<string, UnlockedInfo>>({});
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementRule | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUnlockingRef = useRef<Record<string, boolean>>({});
  const navigate = useNavigate();

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth?.currentUser?.uid,
        email: auth?.currentUser?.email,
        emailVerified: auth?.currentUser?.emailVerified,
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  };

  useEffect(() => {
    if (!user?.userId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    // Listen to user profile changes
    const unsubscribeUser = onSnapshot(doc(db, 'users', user.userId), (snap) => {
      if (snap.exists()) {
        const userData = snap.data() as User;
        setProfile(userData);
      } else {
        setProfile({
          userId: user.userId,
          name: user.name,
          username: user.username,
          role: user.role,
        } as unknown as User);
      }
      setLoading(false);
    }, (err) => {
      console.error('Profile snapshot error:', err);
      setLoading(false);
    });

    // Listen to unlocked achievements
    const unsubscribeUnlocked = onSnapshot(collection(db, 'users', user.userId, 'unlockedAchievements'), (snap) => {
      const unlocked: Record<string, UnlockedInfo> = {};
      snap.docs.forEach(doc => {
        unlocked[doc.id] = doc.data() as UnlockedInfo;
      });
      setUnlockedIds(unlocked);
    });

    // Listen to global achievement rules
    const unsubscribeAchievements = onSnapshot(query(collection(db, 'achievements'), where('isActive', '==', true), orderBy('order', 'asc')), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AchievementRule));
      setAchievements(data);
    });

    return () => {
      unsubscribeUser();
      unsubscribeUnlocked();
      unsubscribeAchievements();
    };
  }, [user?.userId, user?.name, user?.username, user?.role]);

  useEffect(() => {
    if (!user?.userId || !profile) return;

    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
        startOfWeek.setHours(0,0,0,0);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const ordersSnap = await getDocs(query(collection(db, 'orders'), where('kidId', '==', user.userId)));
        const orders = ordersSnap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            status: data.status,
            recipeId: data.recipeId,
            recipeName: data.recipeName || 'Món ăn',
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now())
          } as any;
        });
        
        const reviewsSnap = await getDocs(query(collection(db, 'reviews'), where('authorId', '==', user.userId)));
        const rawReviews = reviewsSnap.docs.map(d => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now())
          };
        });

        // Group reviews by orderId and take the latest/best one
        // This ensures the count is accurate even if there are duplicate review documents
        const reviewMapByOrder = new Map<string, any>();
        rawReviews.forEach((r: any) => {
          // Robust grouping: prefer orderId, fallback to recipeId + day if missing
          const dateStr = r.createdAt instanceof Date ? r.createdAt.toISOString().split('T')[0] : 'unknown';
          const groupingKey = r.orderId || `${r.recipeId}_${dateStr}`;
          
          const existing = reviewMapByOrder.get(groupingKey);
          // Keep the one with highest rating or longest comment
          if (!existing || r.rating > existing.rating || (r.comment?.length || 0) > (existing.comment?.length || 0)) {
            reviewMapByOrder.set(groupingKey, r);
          }
        });
        
        const reviews = Array.from(reviewMapByOrder.values());

        const doneOrders = orders.filter(o => o.status === 'done');
        const cancelledOrdersData = orders.filter(o => o.status === 'cancelled');
        
        const ordersThisWeek = doneOrders.filter(o => o.createdAt >= startOfWeek);
        const ordersThisMonth = doneOrders.filter(o => o.createdAt >= startOfMonth);

        // Accurate Perfect Weeks Calculation (mon-fri completed)
        const weekMap = new Map<string, Set<string>>();
        doneOrders.forEach(o => {
          if (o.weekId && o.day) {
            if (!weekMap.has(o.weekId)) weekMap.set(o.weekId, new Set());
            weekMap.get(o.weekId)?.add(o.day);
          }
        });
        let perfectWeeks = 0;
        weekMap.forEach((days) => {
          const required = ['mon', 'tue', 'wed', 'thu', 'fri'];
          if (required.every(d => days.has(d))) perfectWeeks++;
        });

        // All-time unique recipes
        const uniqueRecipeMap = new Map<string, string>();
        doneOrders.forEach(o => {
          if (o.recipeId) uniqueRecipeMap.set(o.recipeId, o.recipeName);
        });
        const triedRecipeIds = Array.from(uniqueRecipeMap.entries()).map(([id, name]) => ({ id, name }));
        const uniqueRecipesCount = triedRecipeIds.length;

        // Weekly unique recipes
        const weeklyUniqueIds = new Set(ordersThisWeek.map(o => o.recipeId));
        const uniqueRecipesThisWeek = weeklyUniqueIds.size;
        
        const favIds = new Set(favorites);
        // "Favorites tried" counts how many UNIQUE favorite recipes have been eaten at least once
        const eatenFavIds = new Set(doneOrders.filter(o => favIds.has(o.recipeId)).map(o => o.recipeId));
        const favoritesTried = eatenFavIds.size;

        const fiveStarReviews = reviews.filter((r: any) => r.rating === 5).length;
        const reviewsWithPhoto = reviews.filter((r: any) => r.imageUrls && r.imageUrls.length > 0).length;
        // Count reviews with meaningful comment
        const reviewsWithComment = reviews.filter((r: any) => r.comment && r.comment.trim().length >= 5).length;

        const joinedAt = profile.createdAt?.toDate ? profile.createdAt.toDate() : new Date(profile.createdAt || '2024-01-01');
        const daysSinceJoined = Math.floor((now.getTime() - joinedAt.getTime()) / (1000 * 60 * 60 * 24));
        const weeksJoined = Math.floor(daysSinceJoined / 7);

        setUserStats({
          totalOrders: doneOrders.length,
          ordersThisWeek: ordersThisWeek.length,
          ordersThisMonth: ordersThisMonth.length,
          cancelledOrders: cancelledOrdersData.length,
          uniqueRecipes: uniqueRecipesCount,
          uniqueRecipesThisWeek,
          triedRecipeIds,
          currentStreak: streak,
          longestStreak,
          perfectWeeks,
          totalReviews: reviews.length,
          fiveStarReviews,
          reviewsWithPhoto,
          reviewsWithComment,
          favCount: favorites.length,
          favoritesTried,
          daysSinceJoined,
          weeksJoined
        });
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStats();
  }, [user?.userId, profile, favorites, streak, longestStreak]);

  const checkCondition = (condition: AchievementCondition, stats: UserStats) => {
    const { type, operator, value } = condition;
    const actual = getStatValue(type, stats);
    switch (operator) {
      case 'gte': return actual >= value;
      case 'lte': return actual <= value;
      case 'eq': 
        // For progressive counts, reaching the target once is enough to satisfy 'eq' milestone
        return actual >= value;
      case 'gt': return actual > value;
      case 'lt': return actual < value;
      default: return actual >= value;
    }
  };

  const getConditions = (achievement: AchievementRule): AchievementCondition[] => {
    let conditions = achievement.conditions || [];
    
    // Fallback for objects that might have flat condition fields (legacy/simple)
    const legacy = achievement as any;
    if (conditions.length === 0 && legacy.targetStat && legacy.targetValue !== undefined) {
      conditions = [{
        type: legacy.targetStat,
        operator: legacy.operator || 'gte',
        value: legacy.targetValue,
        label: legacy.targetLabel || 'Tiến trình'
      }];
    }
    
    // Second fallback: try to infer from title/description if no conditions found
    if (conditions.length === 0) {
      const text = (achievement.title + ' ' + achievement.description).toLowerCase();
      const numMatch = text.match(/(\d+)/);
      const inferredValue = numMatch ? parseInt(numMatch[1]) : null;
      
      if (inferredValue !== null) {
        if (text.includes('bữa ăn') || text.includes('món') || text.includes('đơn')) {
          conditions = [{ type: 'total_orders', value: inferredValue, operator: 'gte', label: 'Bữa ăn' }];
        } else if (text.includes('liên tiếp') || text.includes('streak') || text.includes('ngày')) {
          conditions = [{ type: 'streak', value: inferredValue, operator: 'gte', label: 'Ngày' }];
        } else if (text.includes('thích') || text.includes('tim')) {
          if (text.includes('đã ăn') || text.includes('đã dùng')) {
            conditions = [{ type: 'favorites_tried', value: inferredValue, operator: 'gte', label: 'Yêu thích đã ăn' }];
          } else {
            conditions = [{ type: 'fav_count', value: inferredValue, operator: 'gte', label: 'Số món thích' }];
          }
        } else if (text.includes('đánh giá') || text.includes('review') || text.includes('sao')) {
          conditions = [{ type: 'reviews', value: inferredValue, operator: 'gte', label: 'Đánh giá' }];
        } else if (text.includes('ảnh') || text.includes('hình')) {
          conditions = [{ type: 'reviews_with_photo', value: inferredValue, operator: 'gte', label: 'Ảnh' }];
        } else if (text.includes('tuần')) {
          conditions = [{ type: 'account_age_weeks', value: inferredValue, operator: 'gte', label: 'Tuần tham gia' }];
        }
      }
    }
    
    return conditions;
  };

  const getStatValue = (type: string, stats: UserStats): number => {
    // Standardize the type string: lowercase and trim
    const t = type?.toLowerCase()?.trim() || '';
    
    // Exact mapping for chef-defined types + common variations
    if (t === 'total_orders_done' || t === 'total_orders' || t === 'orders_done' || t === 'order' || t === 'total_order') 
      return stats.totalOrders;
    
    if (t === 'total_orders_week' || t === 'orders_week' || t === 'weekly_orders' || t === 'order_week' || t === 'weekly_order')
      return stats.ordersThisWeek;
      
    if (t === 'total_orders_month' || t === 'orders_month' || t === 'monthly_orders' || t === 'order_month' || t === 'monthly_order')
      return stats.ordersThisMonth;
      
    if (t === 'orders_cancelled' || t === 'order_cancelled' || t === 'cancelled_orders' || t === 'cancelled_order')
      return stats.cancelledOrders;
      
    if (t === 'unique_recipes_tried' || t === 'unique_recipes' || t === 'unique_recipe' || t === 'unique_recipe_tried' || t === 'recipes_tried' || t === 'recipe' || t === 'recipes')
      return stats.uniqueRecipes;
      
    if (t === 'unique_recipes_this_week' || t === 'unique_recipes_week' || t === 'recipe_week' || t === 'recipes_week')
      return stats.uniqueRecipesThisWeek;
      
    if (t === 'current_streak' || t === 'streak' || t === 'day_streak' || t === 'current_streaks')
      return stats.currentStreak;
      
    if (t === 'longest_streak' || t === 'streak_record' || t === 'max_streak')
      return stats.longestStreak;
      
    if (t === 'perfect_week' || t === 'perfect_weeks' || t === 'perfect_week_count')
      return stats.perfectWeeks;
      
    if (t === 'total_reviews' || t === 'reviews' || t === 'review' || t === 'total_review' || t === 'total_rating')
      return stats.totalReviews;
      
    if (t === 'five_star_reviews' || t === '5_star_reviews' || t === 'five_star_review' || t === '5_star_review' || t === 'five_stars' || t === '5_stars')
      return stats.fiveStarReviews;
      
    if (t === 'reviews_with_photo' || t === 'photo_reviews' || t === 'review_with_photo' || t === 'photo_review' || t === 'reviews_photo' || t === 'review_photo' || t === 'rating_with_photo')
      return stats.reviewsWithPhoto;
      
    if (t === 'reviews_with_comment' || t === 'comment_reviews' || t === 'review_with_comment' || t === 'comment_review' || t === 'reviews_comment' || t === 'review_comment' || t === 'rating_with_comment')
      return stats.reviewsWithComment;
      
    if (t === 'total_favorites' || t === 'favorites_count' || t === 'fav_count' || t === 'favorite' || t === 'favorites' || t === 'total_favorite' || t === 'liked_recipes')
      return stats.favCount;
      
    if (t === 'favorites_tried' || t === 'favorite_tried' || t === 'favs_tried' || t === 'fav_tried' || t === 'eaten_favorites')
      return stats.favoritesTried;
      
    if (t === 'days_since_joined' || t === 'join_days' || t === 'day_since_joined' || t === 'join_day')
      return stats.daysSinceJoined;
      
    if (t === 'account_age_weeks' || t === 'age_weeks' || t === 'account_age_week' || t === 'age_week' || t === 'weeks_joined' || t === 'week_joined')
      return stats.weeksJoined;

    return 0;
  };

  // Achievement Check Logic
  useEffect(() => {
    if (!user?.userId || achievements.length === 0 || statsLoading || !userStats) return;

    const checkAndUnlock = async () => {
      for (const achievement of achievements) {
        // Skip if already unlocked or currently being unlocked in this session
        if (unlockedIds[achievement.id] || isUnlockingRef.current[achievement.id]) continue;

        const conditions = getConditions(achievement);
        if (conditions.length === 0) continue;

        const results = conditions.map(c => checkCondition(c, userStats));
        const isUnlocked = achievement.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);

        if (isUnlocked) {
          isUnlockingRef.current[achievement.id] = true;
          const path = `users/${user.userId}/unlockedAchievements/${achievement.id}`;
          try {
            await setDoc(doc(db, 'users', user.userId, 'unlockedAchievements', achievement.id), {
              unlockedAt: serverTimestamp(),
              isCelebrated: false
            });

            // 1. Send push notification to child
            const oneSignalIds = profile?.oneSignalIds || (profile?.oneSignalId ? [profile.oneSignalId] : []);
            if (oneSignalIds.length > 0) {
              await sendPushToUser(
                oneSignalIds, 
                `Thành tích mới: ${achievement.title} 🎖️`, 
                `Chúc mừng! Bé đã đạt được "${achievement.title}". 🎉`, 
                '/kids/profile'
              );
            }

            // 2. Create in-app notification record
            await addDoc(collection(db, 'users', user.userId, 'notifications'), {
              title: `Thành tích mới: ${achievement.title}`,
              body: `Chúc mừng! Bé vừa đạt được thành tích "${achievement.title}".`,
              type: 'achievement',
              achievementId: achievement.id,
              emoji: achievement.emoji,
              createdAt: serverTimestamp(),
              isRead: false
            });

            // No longer triggering confetti/toast here directly. 
            // The celebration effect below will handle it for both new and missed achievements.
          } catch (err) {
            console.error('Error unlocking achievement:', err);
            // Don't use handleFirestoreError here to prevent infinite error toast loops, 
            // but log it properly. We keep it in isUnlockingRef to prevent retrying every 2 seconds if it failed due to permissions.
          }
        }
      }
    };

    checkAndUnlock();
  }, [user?.userId, achievements, userStats, unlockedIds, statsLoading]);

  // Celebration Logic for newly discovered/uncelebrated achievements
  useEffect(() => {
    if (!user?.userId || achievements.length === 0 || Object.keys(unlockedIds).length === 0) return;

    const celebrateNewAchievements = async () => {
      // Find achievements that are unlocked but not yet celebrated
      const toCelebrate = achievements.filter(a => 
        unlockedIds[a.id] && 
        unlockedIds[a.id].isCelebrated !== true
      );

      if (toCelebrate.length === 0) return;

      // Trigger a grand celebration with fireworks pattern
      const duration = 5 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const confettiInterval: any = setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(confettiInterval);
        }

        const particleCount = 50 * (timeLeft / duration);
        // Fire from multiple origins for "fireworks" effect
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);

      // Initial huge bursts
      confetti({
        particleCount: 250,
        spread: 160,
        origin: { y: 0.6 },
        colors: ['#F97316', '#FB923C', '#FED7AA', '#4ADE80', '#60A5FA', '#E879F9', '#FCD34D'],
        scalar: 1.5
      });

      // Side cannons
      setTimeout(() => {
        confetti({
          particleCount: 150,
          angle: 60,
          spread: 70,
          origin: { x: 0, y: 0.8 },
          colors: ['#F97316', '#FB923C', '#FED7AA'],
          scalar: 1.2
        });
        confetti({
          particleCount: 150,
          angle: 120,
          spread: 70,
          origin: { x: 1, y: 0.8 },
          colors: ['#4ADE80', '#60A5FA', '#E879F9'],
          scalar: 1.2
        });
      }, 800);

      // Show toasts for each new achievement with premium styling
      toCelebrate.forEach((a, idx) => {
        setTimeout(() => {
          toast.success(
            <div className="flex flex-col items-center gap-2">
              <span className="text-[36px] animate-bounce mb-1">{a.emoji}</span>
              <div className="text-center">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 mb-0.5">Thành tựu mới</div>
                <div className="text-[18px] font-black leading-tight text-foreground uppercase tracking-tight">{a.title}</div>
                <div className="text-[12px] font-medium text-muted-foreground mt-1.5 px-2 italic leading-relaxed">
                  Chúc mừng bé đã chinh phục cột mốc này!
                </div>
              </div>
            </div>,
            { 
              duration: 6000,
              icon: null,
              style: {
                borderRadius: '24px',
                background: '#fff',
                color: '#1a1a1a',
                border: '2px solid #F97316',
                padding: '20px 16px',
                boxShadow: '0 20px 40px rgba(249, 115, 22, 0.2)',
                width: '100%',
                maxWidth: '300px'
              }
            }
          );
        }, idx * 3000); 
      });

      // Mark as celebrated in Firestore
      for (const a of toCelebrate) {
        try {
          await updateDoc(doc(db, 'users', user.userId, 'unlockedAchievements', a.id), {
            isCelebrated: true,
            celebratedAt: serverTimestamp()
          });
        } catch (err) {
          console.error(`Error marking achievement ${a.id} as celebrated:`, err);
        }
      }
    };

    // Small delay to ensure UI is ready and not too jarring
    const timer = setTimeout(celebrateNewAchievements, 1500);
    return () => clearTimeout(timer);
  }, [unlockedIds, achievements, user?.userId]);

  const cropImageToSquare = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        const size = Math.min(img.width, img.height);
        canvas.width = 512;
        canvas.height = 512;

        const offsetX = (img.width - size) / 2;
        const offsetY = (img.height - size) / 2;

        ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, 512, 512);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas to Blob failed'));
          }
          URL.revokeObjectURL(img.src);
        }, 'image/jpeg', 0.9);
      };
      img.onerror = () => {
        reject(new Error('Failed to load image'));
        URL.revokeObjectURL(img.src);
      };
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn tệp hình ảnh!');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Dung lượng ảnh ban đầu không được quá 5MB!');
      return;
    }

    try {
      const croppedBlob = await cropImageToSquare(file);
      handleUpload(croppedBlob);
    } catch (err) {
      console.error('Cropping error:', err);
      toast.error('Có lỗi khi xử lý ảnh!');
    }
  };

  const handleUpload = async (fileBlob: Blob) => {
    if (!user?.userId) return;
    setUploading(true);

    try {
      const file = new File([fileBlob], `${user.userId}.jpg`, { type: 'image/jpeg' });
      const downloadURL = await uploadToCloudinary(file, 'buacomchobe/avatars');
      await updateDoc(doc(db, 'users', user.userId), {
        avatar: downloadURL
      });
      setProfile(prev => prev ? { ...prev, avatar: downloadURL } : null);
      login({ ...user, avatar: downloadURL });
      toast.success('Đã cập nhật ảnh đại diện!');
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Tải ảnh thất bại, thử lại nhé!');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!profile) return null;

  const getJoinDate = () => {
    if (!profile.createdAt) return '25/04/2026';
    let date: Date;
    if (profile.createdAt.toDate) date = profile.createdAt.toDate();
    else if (profile.createdAt instanceof Date) date = profile.createdAt;
    else date = new Date(profile.createdAt);
    if (isNaN(date.getTime())) return '25/04/2026';
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getAchievementProgress = (achievement: AchievementRule) => {
    if (!userStats) return [];
    
    const conditions = getConditions(achievement);
    const isUnlockedInDb = !!unlockedIds[achievement.id];
    
    return conditions.map(c => {
      const current = getStatValue(c.type, userStats);
      const isDone = isUnlockedInDb || checkCondition(c, userStats);
      
      return {
        label: c.label || 'Tiến trình',
        current: isDone ? Math.max(current, c.value) : current,
        needed: c.value,
        percent: isDone ? 100 : Math.min(100, (current / c.value) * 100),
        isDone
      };
    });
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="max-w-[480px] mx-auto kid-page-content pb-32">
      <div className="flex flex-col items-center">
        <h2 className="text-2xl font-black text-foreground mb-10 w-full text-center tracking-tight">Hồ sơ của bé</h2>

        {/* Avatar Section */}
        <div className="flex flex-col items-center mb-4">
          <div className="relative">
            <div className="rounded-full p-1 border-[3px] border-primary">
              <Avatar src={profile.avatar} name={profile.name} size={96} />
            </div>
            {uploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm rounded-full text-foreground border-[3px] border-primary scale-105 z-10">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-1" />
                <span className="text-[10px] font-bold">Đang tải...</span>
              </div>
            )}
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-1 right-1 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all border-2 border-card z-20"
            >
              <Camera size={16} />
            </button>
          </div>
        </div>

         {/* Redesigned Info (No Card) */}
        <div className="flex flex-col items-center mb-4 w-full bg-card border-[0.5px] border-border py-4 px-2 rounded-lg">
          <h3 className="text-[18px] font-semibold text-foreground mb-1">{profile.name}</h3>
          <p className="text-[13px] text-muted-foreground mb-3 font-medium opacity-80">@{profile.username}</p>
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-medium">
            <span className="px-2.5 py-0.5 bg-primary/10 text-primary rounded-full font-black uppercase tracking-wider scale-90">Em bé</span>
            <span className="opacity-40 font-black">·</span>
            <span className="opacity-70">Tham gia {getJoinDate()}</span>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 w-full mb-8">
          {[
            { label: 'Streak', value: streak, icon: Flame, color: streak > 0 ? 'text-orange-500' : 'text-muted-foreground/40' },
            { label: 'Bữa đã ăn', value: userStats?.totalOrders || 0, icon: Utensils, color: 'text-orange-500' },
            { label: 'Yêu thích', value: favorites.length, icon: Heart, color: 'text-orange-500' },
          ].map((stat, idx) => (
            <div 
              key={idx} 
              className="bg-card border-[0.5px] border-border rounded-[16px] p-3 flex flex-col items-center justify-center shadow-sm relative overflow-hidden"
            >
              <div className="flex flex-col items-center gap-0.5">
                <stat.icon 
                  size={16} 
                  className={stat.color} 
                  fill={
                    (stat.icon === Heart || stat.icon === Flame) && (stat.label !== 'Streak' || streak > 0)
                      ? 'currentColor' 
                      : 'none'
                  } 
                />
                <span className={`text-[20px] font-black leading-none ${stat.color} mt-1`}>
                  {stat.label === 'Streak' && streak === 0 ? '-' : stat.value}
                </span>
                <span className="text-[11px] text-muted-foreground font-medium mt-1">{stat.label}</span>
              </div>
              {stat.label === 'Streak' && streak === 0 && (
                <div className="absolute inset-0 bg-secondary/5 hidden hover:flex items-center justify-center cursor-help">
                  <span className="text-[10px] font-bold text-primary/60">Đặt món ngay!</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <input type="file" ref={fileInputRef} className="hidden" accept="image/jpeg,image/png" onChange={handleFileSelect} />

       

        {/* Achievements Section */}
        <div className="w-full text-left">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              Thành tích 🎖️
            </h3>
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 bg-secondary/50 px-3 py-1.5 rounded-full ">
              <span className={Object.keys(unlockedIds).length > 0 ? "text-orange-500 font-black" : "text-muted-foreground"}>
                {Object.keys(unlockedIds).length}
              </span><span className="opacity-60 text-[10px]">/{" "}{achievements.length} đã đạt</span>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-[10px] bg-card border-[0.5px] border-border py-4 px-2 rounded-lg">
            {achievements.map((achievement) => {
              const progress = getAchievementProgress(achievement);
              const isLocallyDone = progress.length > 0 && (
                achievement.logic === 'OR' 
                  ? progress.some(p => p.isDone) 
                  : progress.every(p => p.isDone)
              );
              const isUnlocked = !!unlockedIds[achievement.id] || isLocallyDone;
              
              return (
                <div 
                  key={achievement.id}
                  onClick={() => setSelectedAchievement(achievement)}
                  className={`flex flex-col items-center justify-center p-[14px_8px] rounded-[16px] border transition-all relative cursor-pointer active:scale-95 ${
                    isUnlocked 
                      ? 'bg-secondary border-primary/20 shadow-sm' 
                      : 'bg-secondary/40 border-border/60 opacity-60'
                  }`}
                >
                  <div className={`text-[32px] mb-2 transition-all ${!isUnlocked && 'grayscale opacity-40'}`}>
                    {achievement.emoji}
                  </div>
                  <span className={`text-[11px] text-center font-medium leading-tight line-clamp-2 min-h-[2.4em] flex items-center justify-center ${isUnlocked ? 'text-foreground font-bold' : 'text-muted-foreground/80'}`}>
                    {achievement.title}
                  </span>

                  {userStats && getAchievementProgress(achievement).length > 0 && (
                    <div className="w-full mt-2 space-y-1">
                      {getAchievementProgress(achievement).slice(0, 1).map((p, pIdx) => (
                        <div key={pIdx}>
                          <div className={`flex justify-between items-center text-[8px] font-black uppercase mb-0.5 ${p.isDone ? 'text-green-500' : 'text-muted-foreground/60'}`}>
                            <span>{p.current}/{p.needed}</span>
                          </div>
                          <div className="h-1 bg-secondary rounded-full overflow-hidden border-[0.5px] border-border/50">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${p.percent}%` }}
                              className={`h-full rounded-full ${p.isDone ? 'bg-green-500' : 'bg-primary'}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {isUnlocked && (
                    <div className="absolute -top-1.5 -right-1.5 bg-green-500 text-white rounded-full p-0.5 shadow-sm border-2 border-background">
                      <Check size={10} strokeWidth={4} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedAchievement && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSelectedAchievement(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-card w-full max-w-[340px] rounded-[32px] shadow-2xl relative overflow-hidden"
            >
              <div className="p-8 flex flex-col items-center text-center">
                <div className={`text-5xl mb-6 flex items-center justify-center w-20 h-20 rounded-3xl ${
                  (!!unlockedIds[selectedAchievement.id] || getAchievementProgress(selectedAchievement).every(p => p.isDone)) 
                    ? 'bg-primary/10' 
                    : 'bg-secondary grayscale opacity-50'
                }`}>
                  {selectedAchievement.emoji}
                </div>
                
                <h3 className="text-xl font-black text-foreground mb-2 tracking-tight">{selectedAchievement.title}</h3>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{selectedAchievement.description}</p>
                
                <div className="w-full space-y-4">
                  {/* Progress Bars Section (Always Show if there are conditions or inferred progress) */}
                  {getAchievementProgress(selectedAchievement).length > 0 && (
                    <div className="space-y-4 text-left">
                      {getAchievementProgress(selectedAchievement).map((p, idx) => (
                        <div key={idx} className="space-y-2">
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">
                            <span className="text-left flex-1 mr-2">{p.label}</span>
                            <span className={p.isDone ? 'text-green-500 font-black' : 'text-primary font-black'}>
                              {p.current}/{p.needed}
                            </span>
                          </div>
                          <div className="h-3 bg-secondary rounded-full overflow-hidden p-0.5 border border-border">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${p.percent}%` }}
                              className={`h-full rounded-full shadow-sm ${p.isDone ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-primary shadow-[0_0_8px_rgba(249,115,22,0.4)]'}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Unlocked Badge */}
                  {unlockedIds[selectedAchievement.id] ? (
                    <div className="w-full bg-green-500/10 border border-green-500/20 rounded-2xl p-4 flex flex-col items-center gap-1 mt-4">
                      <div className="flex items-center gap-2 text-green-600 font-bold text-sm">
                        <CheckCircle2 size={18} />
                        Đã hoàn thành!
                      </div>
                      <span className="text-[11px] text-green-600/70 font-medium">
                        Đạt được lúc: {formatDate(unlockedIds[selectedAchievement.id].unlockedAt)}
                      </span>
                    </div>
                  ) : (
                    <>
                      {selectedAchievement.conditions?.length > 1 && (
                        <div className="text-[10px] font-bold text-muted-foreground uppercase bg-secondary/50 py-1.5 rounded-lg border border-border/50">
                          Cần đạt: {selectedAchievement.logic === 'AND' ? 'TẤT CẢ' : 'CHỈ CẦN 1 TRONG CÁC'} điều kiện
                        </div>
                      )}
                    </>
                  )}

                  {/* List of tried recipes for unique recipe achievements */}
                  {userStats && getConditions(selectedAchievement).some(c => c.type.includes('unique_recipes')) && userStats.triedRecipeIds.length > 0 && (
                    <div className="w-full mt-6 text-left">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Utensils size={12} className="text-primary" />
                        Các món bé đã thử ({userStats.triedRecipeIds.length})
                      </p>
                      <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                        {userStats.triedRecipeIds.map((item, idx) => (
                          <span key={idx} className="px-3 py-1.5 bg-secondary text-[11px] font-bold rounded-xl text-foreground/80 border border-border/50">
                            {item.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <button 
                  onClick={() => setSelectedAchievement(null)}
                  className="mt-8 px-6 py-2.5 bg-secondary text-foreground rounded-2xl text-sm font-bold active:scale-95 transition-all w-full"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
