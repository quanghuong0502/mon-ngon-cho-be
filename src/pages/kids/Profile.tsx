import React, { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { uploadToCloudinary } from '../../lib/cloudinary';
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
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now())
          } as any;
        });
        
        const reviewsSnap = await getDocs(query(collection(db, 'reviews'), where('authorId', '==', user.userId)));
        const reviews = reviewsSnap.docs.map(d => d.data());

        const doneOrders = orders.filter(o => o.status === 'done');
        const cancelledOrdersData = orders.filter(o => o.status === 'cancelled');
        const ordersThisWeek = doneOrders.filter(o => o.createdAt >= startOfWeek);
        const ordersThisMonth = doneOrders.filter(o => o.createdAt >= startOfMonth);

        const uniqueRecipes = new Set(doneOrders.map(o => o.recipeId)).size;
        
        const favIds = new Set(favorites);
        const favoritesTried = doneOrders.filter(o => favIds.has(o.recipeId)).length;

        const fiveStarReviews = reviews.filter((r: any) => r.rating === 5).length;
        const reviewsWithPhoto = reviews.filter((r: any) => r.imageUrls && r.imageUrls.length > 0).length;
        const reviewsWithComment = reviews.filter((r: any) => r.comment && r.comment.length > 5).length;

        const joinedAt = profile.createdAt?.toDate ? profile.createdAt.toDate() : new Date(profile.createdAt || '2024-01-01');
        const daysSinceJoined = Math.floor((now.getTime() - joinedAt.getTime()) / (1000 * 60 * 60 * 24));
        const weeksJoined = Math.floor(daysSinceJoined / 7);

        setUserStats({
          totalOrders: doneOrders.length,
          ordersThisWeek: ordersThisWeek.length,
          ordersThisMonth: ordersThisMonth.length,
          cancelledOrders: cancelledOrdersData.length,
          uniqueRecipes,
          currentStreak: streak,
          longestStreak,
          perfectWeeks: Math.floor(doneOrders.length / 5), // simplified
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
      case 'eq': return actual === value;
      case 'gt': return actual > value;
      case 'lt': return actual < value;
      default: return false;
    }
  };

  const getStatValue = (type: string, stats: UserStats): number => {
    switch (type) {
      case 'total_orders_done': return stats.totalOrders;
      case 'total_orders_week': return stats.ordersThisWeek;
      case 'total_orders_month': return stats.ordersThisMonth;
      case 'orders_cancelled': return stats.cancelledOrders;
      case 'unique_recipes_tried': return stats.uniqueRecipes;
      case 'current_streak': return stats.currentStreak;
      case 'longest_streak': return stats.longestStreak;
      case 'perfect_week': return stats.perfectWeeks;
      case 'total_reviews': return stats.totalReviews;
      case 'five_star_reviews': return stats.fiveStarReviews;
      case 'reviews_with_photo': return stats.reviewsWithPhoto;
      case 'reviews_with_comment': return stats.reviewsWithComment;
      case 'total_favorites': return stats.favCount;
      case 'favorites_tried': return stats.favoritesTried;
      case 'days_since_joined': return stats.daysSinceJoined;
      case 'account_age_weeks': return stats.weeksJoined;
      default: return 0;
    }
  };

  // Achievement Check Logic
  useEffect(() => {
    if (!user?.userId || achievements.length === 0 || statsLoading || !userStats) return;

    const checkAndUnlock = async () => {
      for (const achievement of achievements) {
        // Skip if already unlocked or currently being unlocked in this session
        if (unlockedIds[achievement.id] || isUnlockingRef.current[achievement.id]) continue;

        if (!achievement.conditions) continue;

        const results = achievement.conditions.map(c => checkCondition(c, userStats));
        const isUnlocked = achievement.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);

        if (isUnlocked) {
          isUnlockingRef.current[achievement.id] = true;
          const path = `users/${user.userId}/unlockedAchievements/${achievement.id}`;
          try {
            await setDoc(doc(db, 'users', user.userId, 'unlockedAchievements', achievement.id), {
              unlockedAt: serverTimestamp()
            });
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#F97316', '#FB923C', '#FED7AA']
            });
            toast.success(`Chúc mừng! Bé đã đạt được "${achievement.title}"! 🎉`, { duration: 5000 });
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
    if (!userStats || !achievement.conditions) return [];
    
    return achievement.conditions.map(c => {
      const current = getStatValue(c.type, userStats);
      return {
        label: c.label,
        current,
        needed: c.value,
        percent: Math.min(100, (current / c.value) * 100),
        isDone: checkCondition(c, userStats)
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
        <div className="flex flex-col items-center mb-4 w-full bg-card border-[0.5px] border-[#FFE4C4] py-4 px-2 rounded-lg">
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
              className="bg-card border-[0.5px] border-[#FFE4C4] rounded-[16px] p-3 flex flex-col items-center justify-center shadow-sm relative overflow-hidden"
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
          
          <div className="grid grid-cols-3 gap-[10px] bg-card border-[0.5px] border-[#FFE4C4] py-4 px-2 rounded-lg">
            {achievements.map((achievement) => {
              const isUnlocked = !!unlockedIds[achievement.id];
              return (
                <div 
                  key={achievement.id}
                  onClick={() => setSelectedAchievement(achievement)}
                  className={`flex flex-col items-center justify-center p-[14px_8px] rounded-[16px] border transition-all relative cursor-pointer active:scale-95 ${
                    isUnlocked 
                      ? 'bg-[#FFF7ED] border-[#FED7AA] shadow-sm' 
                      : 'bg-secondary/40 border-border/60 opacity-60'
                  }`}
                >
                  <div className={`text-[32px] mb-2 transition-all ${!isUnlocked && 'grayscale opacity-40'}`}>
                    {achievement.emoji}
                  </div>
                  <span className={`text-[11px] text-center font-medium leading-tight line-clamp-2 min-h-[2.4em] flex items-center justify-center ${isUnlocked ? 'text-foreground font-bold' : 'text-muted-foreground/80'}`}>
                    {achievement.title}
                  </span>
                  
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

      {/* Achievement Detail Modal */}
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
                <div className={`text-5xl mb-6 flex items-center justify-center w-20 h-20 rounded-3xl ${unlockedIds[selectedAchievement.id] ? 'bg-orange-50' : 'bg-secondary grayscale opacity-50'}`}>
                  {selectedAchievement.emoji}
                </div>
                
                <h3 className="text-xl font-black text-foreground mb-2 tracking-tight">{selectedAchievement.title}</h3>
                <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{selectedAchievement.description}</p>
                
                {unlockedIds[selectedAchievement.id] ? (
                  <div className="w-full bg-green-50 border border-green-100 rounded-2xl p-4 flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2 text-green-600 font-bold text-sm">
                      <CheckCircle2 size={18} />
                      Đã hoàn thành!
                    </div>
                    <span className="text-[11px] text-green-500/80 font-medium">
                      Đạt được lúc: {formatDate(unlockedIds[selectedAchievement.id].unlockedAt)}
                    </span>
                  </div>
                ) : (
                  <div className="w-full space-y-4">
                    <div className="space-y-4">
                      {getAchievementProgress(selectedAchievement).map((p, idx) => (
                        <div key={idx} className="space-y-2">
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                            <span className="text-left flex-1 mr-2">{p.label}</span>
                            <span className={p.isDone ? 'text-green-500' : 'text-primary'}>
                              {p.current}/{p.needed}
                            </span>
                          </div>
                          <div className="h-2.5 bg-secondary rounded-full overflow-hidden p-0.5 border border-border">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${p.percent}%` }}
                              className={`h-full rounded-full shadow-sm ${p.isDone ? 'bg-green-500' : 'bg-primary'}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    {selectedAchievement.conditions?.length > 1 && (
                      <div className="text-[10px] font-bold text-muted-foreground uppercase bg-secondary/50 py-1 rounded-lg">
                        Cần đạt: {selectedAchievement.logic === 'AND' ? 'TẤT CẢ' : 'CHỈ CẦN 1 TRONG CÁC'} điều kiện trên
                      </div>
                    )}
                  </div>
                )}
                
                <button 
                  onClick={() => setSelectedAchievement(null)}
                  className="mt-8 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
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
