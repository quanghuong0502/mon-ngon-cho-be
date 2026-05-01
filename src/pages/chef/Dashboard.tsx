/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  onSnapshot,
  Timestamp,
  updateDoc,
  doc,
  getDoc,
  arrayUnion
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Order, Review, OrderStatus, User, Recipe } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import Avatar from '../../components/Avatar';
import { useAuth } from '../../context/AuthContext';
import OneSignal from 'react-onesignal';
import { 
  ClipboardList, 
  Clock, 
  CheckCircle2, 
  Star, 
  ChevronRight,
  Loader2,
  Utensils,
  Heart,
  TrendingUp,
  ChefHat,
  X
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { getOptimizedUrl } from '../../lib/cloudinary';

export default function ChefDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total: 0,
    preparing: 0,
    completed: 0
  });
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [recentReviews, setRecentReviews] = useState<Review[]>([]);
  const [kidProfiles, setKidProfiles] = useState<Record<string, User>>({});
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
  const [reviewOrders, setReviewOrders] = useState<Record<string, Order>>({});
  const [topFavorites, setTopFavorites] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [showChefBanner, setShowChefBanner] = useState(false);

  useEffect(() => {
    // Initial check for banner visibility
    const isDismissed = localStorage.getItem('chefNotiBannerDismissed') === 'true';
    const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
    
    if (!isDismissed && permission === 'default') {
      setShowChefBanner(true);
    } else {
      setShowChefBanner(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const onOneSignalReady = async() => {
        const os = OneSignal as any;
        const subscribed = os.User?.PushSubscription?.optedIn || false;
        
        if (subscribed) {
          setShowChefBanner(false);
        }
        
        if (subscribed && user?.userId) {
          const playerId = os.User?.PushSubscription?.id;
          if (playerId) {
            await updateDoc(doc(db, 'users', user.userId), {
              oneSignalIds: arrayUnion(playerId)
            });
          }
        }
    };

    const onSubscriptionChange = async (event: any) => {
      const isSubscribed = event.current.optedIn;
      
      if (isSubscribed) {
        setShowChefBanner(false);
      }
      
      if (isSubscribed && user?.userId) {
        const playerId = (OneSignal as any).User?.PushSubscription?.id;
        if (playerId) {
          await updateDoc(doc(db, 'users', user.userId), {
            oneSignalIds: arrayUnion(playerId),
            oneSignalSyncedAt: new Date()
          });
          (OneSignal as any).User?.addTag('role', user.role);
          (OneSignal as any).User?.addTag('userId', user.userId);
        }
      }
    };

    (OneSignal as any).User?.PushSubscription?.addEventListener('change', onSubscriptionChange);
    window.addEventListener('onesignal-ready', onOneSignalReady);

    // Also check if already ready
    if ((window as any)._oneSignalInitialized) {
      onOneSignalReady();
    }

    return () => {
      (OneSignal as any).User?.PushSubscription?.removeEventListener('change', onSubscriptionChange);
      window.removeEventListener('onesignal-ready', onOneSignalReady);
    };
  }, [user]);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = Timestamp.fromDate(today);

    // Stats and Active Orders (Real-time)
    const ordersQuery = query(
      collection(db, 'orders'),
      where('createdAt', '>=', todayTs)
    );

    const unsubscribeOrders = onSnapshot(ordersQuery, async (snapshot) => {
      const allOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      const activeOrDone = allOrders.filter(o => o.status !== 'cancelled');
      
      setStats({
        total: activeOrDone.length,
        preparing: activeOrDone.filter(o => o.status === 'preparing').length,
        completed: activeOrDone.filter(o => o.status === 'done').length
      });

      const latestOrders = activeOrDone
        .filter(o => ['pending', 'preparing', 'ready', 'on_the_way', 'arrived'].includes(o.status))
        .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
        .slice(0, 5);
      
      setActiveOrders(latestOrders);

      // Fetch kid profiles
      const kidIds = Array.from(new Set(latestOrders.map(o => o.kidId))).filter(Boolean) as string[];
      const kidMap: Record<string, User> = { ...kidProfiles };
      
      await Promise.all(kidIds.map(async (id) => {
        if (!kidMap[id]) {
          const uDoc = await getDoc(doc(db, 'users', id));
          if (uDoc.exists()) kidMap[id] = { id: uDoc.id, ...uDoc.data() } as User;
        }
      }));
      setKidProfiles(kidMap);
      setLoading(false);
    });

    // Recent Reviews
    const reviewsQuery = query(
      collection(db, 'reviews'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsubscribeReviews = onSnapshot(reviewsQuery, async (snapshot) => {
      const reviews = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Review));
      setRecentReviews(reviews);

      // Fetch missing data for reviews
      const kidIds = Array.from(new Set(reviews.map(r => r.authorId))).filter(Boolean);
      const recipeIds = Array.from(new Set(reviews.map(r => r.recipeId))).filter(Boolean);
      const orderIds = Array.from(new Set(reviews.map(r => r.orderId))).filter(id => !!id) as string[];

      const userMap = { ...kidProfiles };
      const recipeMap = { ...recipes };
      const orderMap = { ...reviewOrders };

      await Promise.all([
        ...kidIds.map(async (id) => {
          if (!userMap[id]) {
            const uDoc = await getDoc(doc(db, 'users', id));
            if (uDoc.exists()) userMap[id] = { id: uDoc.id, ...uDoc.data() } as User;
          }
        }),
        ...recipeIds.map(async (id) => {
          if (!recipeMap[id]) {
            const rDoc = await getDoc(doc(db, 'recipes', id));
            if (rDoc.exists()) recipeMap[id] = { id: rDoc.id, ...rDoc.data() } as Recipe;
          }
        }),
        ...orderIds.map(async (id) => {
          if (!orderMap[id]) {
            const oDoc = await getDoc(doc(db, 'orders', id));
            if (oDoc.exists()) orderMap[id] = { id: oDoc.id, ...oDoc.data() } as Order;
          }
        })
      ]);

      setKidProfiles(userMap);
      setRecipes(recipeMap);
      setReviewOrders(orderMap);
    });

    // Top Favorites
    const topFavsQuery = query(
      collection(db, 'recipes'),
      orderBy('favoriteCount', 'desc'),
      limit(3)
    );

    const unsubscribeTopFavs = onSnapshot(topFavsQuery, (snapshot) => {
      setTopFavorites(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Recipe)));
    });

    return () => {
      unsubscribeOrders();
      unsubscribeReviews();
      unsubscribeTopFavs();
    };
  }, []);

  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: newStatus,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const getStatusLabel = (status: OrderStatus) => {
    switch(status) {
      case 'pending': return { text: 'Đang chờ', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' };
      case 'preparing': return { text: 'Đang làm', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' };
      case 'ready': return { text: 'Sẵn sàng', color: 'text-green-600 bg-green-50 dark:bg-green-900/20' };
      case 'on_the_way': return { text: 'Đang đến', color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/20' };
      case 'arrived': return { text: 'Đã đến', color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' };
      case 'done': return { text: 'Hoàn thành', color: 'text-muted-foreground bg-secondary' };
      case 'cancelled': return { text: 'Đã hủy', color: 'text-destructive bg-destructive/10' };
      default: return { text: status, color: 'text-muted-foreground bg-secondary' };
    }
  };

  const requestPermission = async () => {
    try {
      // Check current browser permission
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'denied') {
          alert('Vui lòng bật thông báo trong cài đặt trình duyệt để nhận tin nhắn từ các bé nhé! 😊');
          setShowChefBanner(false);
          return;
        }
      }

      const os = OneSignal as any;
      if (os.Slidedown?.prompt) {
        await os.Slidedown.prompt();
      } else if (os.showSlidedownPrompt) {
        await os.showSlidedownPrompt();
      } else {
        await OneSignal.Notifications.requestPermission();
      }
    } catch (err) {
      console.error('OneSignal Permission Error:', err);
    }
  };

  const handleDismissBanner = () => {
    setShowChefBanner(false);
    localStorage.setItem('chefNotiBannerDismissed', 'true');
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-primary" size={32} />
    </div>
  );

  return (
    <div className="h-full overflow-y-auto scrollbar-hide chef-page-content">
      {/* Page Title */}
      <div className="pt-8 space-y-[2px] mb-6">
        <h1 className="text-[20px] font-semibold text-foreground">Tổng quan</h1>
        <p className="text-[13px] font-normal text-muted-foreground">Thống kê hoạt động của bếp hôm nay</p>
      </div>

      <div className="space-y-8">
        {showChefBanner && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center gap-4 mb-4 relative overflow-hidden"
          >
            <span style={{ fontSize: 24 }}>🔔</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }} className="text-foreground">Bật thông báo nhé!</div>
              <div style={{ fontSize: 12 }} className="text-muted-foreground">
                Đầu bếp sẽ biết ngay khi bé đến lấy món 🍳
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={requestPermission}
                className="bg-primary text-primary-foreground border-none rounded-lg px-[14px] py-[6px] text-[13px] font-medium cursor-pointer hover:opacity-90"
              >
                Bật
              </button>
              <button 
                onClick={handleDismissBanner}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors border-none bg-none"
              >
                <X size={20} />
              </button>
            </div>
          </motion.div>
        )}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard 
              icon={<ClipboardList className="text-orange-600" />} 
              label="Tổng đơn hôm nay" 
              value={stats.total} 
              color="bg-orange-50 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900/30"
            />
            <StatCard 
              icon={<Clock className="text-blue-600" />} 
              label="Đang chuẩn bị" 
              value={stats.preparing} 
              color="bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30"
            />
            <StatCard 
              icon={<CheckCircle2 className="text-green-600" />} 
              label="Đã hoàn thành" 
              value={stats.completed} 
              color="bg-green-50 dark:bg-green-950/20 border-green-100 dark:border-green-900/30"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Active Orders */}
            <section>
              <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-xl font-bold text-foreground">Đơn hàng mới nhất</h2>
                <button 
                  onClick={() => navigate('/chef/orders')}
                  className="text-primary text-sm font-semibold flex items-center hover:underline"
                >
                  Xem tất cả <ChevronRight size={16} />
                </button>
              </div>
              <div className="space-y-4">
                <AnimatePresence>
                  {activeOrders.length === 0 ? (
                    <div className="bg-card p-8 rounded-2xl border border-dashed border-border text-center text-muted-foreground">
                      Chưa có đơn hàng nào cần xử lý
                    </div>
                  ) : (
                    activeOrders.map((order) => {
                      const status = getStatusLabel(order.status);
                      return (
                        <motion.div
                          key={order.id}
                          layout
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="bg-card p-5 rounded-2xl border border-border/50 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow"
                        >
                          <div>
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${status.color}`}>
                                {status.text}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {order.createdAt ? format(order.createdAt.toDate(), 'HH:mm', { locale: vi }) : '--:--'}
                              </span>
                            </div>
                            <h3 className="font-bold text-foreground mt-1">Đơn hàng #{order.id?.slice(-4)}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">Cho: {kidProfiles[order.kidId]?.name ? `Bé ${kidProfiles[order.kidId].name}` : `Bé ${order.kidId}`}</p>
                          </div>
                          <div className="flex gap-2">
                            {order.status === 'pending' && (
                              <button 
                                onClick={() => updateStatus(order.id!, 'preparing')}
                                className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:opacity-90 transition-colors shadow-lg shadow-primary-shadow/30"
                              >
                                Bắt đầu làm
                              </button>
                            )}
                            {order.status === 'preparing' && (
                              <button 
                                onClick={() => updateStatus(order.id!, 'ready')}
                                className="px-4 py-2 bg-green-600 text-white text-xs font-bold rounded-xl hover:bg-green-700 transition-colors shadow-lg shadow-green-900/20"
                              >
                                Món đã xong
                              </button>
                            )}
                            {order.status === 'ready' && (
                              <span className="text-[11px] font-bold text-muted-foreground bg-secondary px-3 py-2 rounded-xl">
                                Chờ bé đến lấy...
                              </span>
                            )}
                            {order.status === 'on_the_way' && (
                              <span className="text-[11px] font-bold text-sky-500 bg-sky-500/10 px-3 py-2 rounded-xl">
                                🚶 Bé đang đến
                              </span>
                            )}
                            {order.status === 'arrived' && (
                              <button 
                                onClick={() => updateStatus(order.id!, 'done')}
                                className="px-4 py-2 bg-orange-500 text-white text-xs font-bold rounded-xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-900/20"
                              >
                                Xác nhận đã giao ✓
                              </button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </AnimatePresence>
              </div>
            </section>

            {/* Recent Reviews */}
            <section>
              <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-xl font-bold text-foreground">Đánh giá gần đây</h2>
                <button 
                  onClick={() => navigate('/chef/reviews')}
                  className="text-primary text-sm font-semibold flex items-center hover:underline"
                >
                  Xem tất cả <ChevronRight size={16} />
                </button>
              </div>
              
              <div className="space-y-3">
                {recentReviews.length === 0 ? (
                  <div className="bg-card p-12 rounded-3xl border border-dashed border-border text-center text-muted-foreground">
                    <Star className="mx-auto mb-2 opacity-20" size={48} />
                    <p>Chưa có đánh giá nào</p>
                  </div>
                ) : (
                  recentReviews.map((review) => {
                    const kid = kidProfiles[review.authorId];
                    const recipe = recipes[review.recipeId];
                    const order = review.orderId ? reviewOrders[review.orderId] : null;
                    
                    const DAY_NAMES = { mon: 'Thứ Hai', tue: 'Thứ Ba', wed: 'Thứ Tư', thu: 'Thứ Năm', fri: 'Thứ Sáu' };
                    const dayLabel = order ? DAY_NAMES[order.day] : '';
                    const weekNum = order?.weekId ? (order.weekId.includes('-') ? order.weekId.split('-')[1] : order.weekId) : '';

                    return (
                      <motion.div 
                        key={review.id} 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-card p-4 rounded-xl border border-border hover:border-primary/50 transition-all flex gap-4 group"
                      >
                        <Avatar 
                          src={kid?.avatar} 
                          name={kid?.name || review.authorName} 
                          size={40} 
                          className="shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {kid?.name ? `Bé ${kid.name}` : `Bé ${review.authorName}`}
                              </span>
                              <div className="flex gap-0.5">
                                {[1, 2, 3, 4, 5].map(star => (
                                  <Star 
                                    key={star} 
                                    size={10} 
                                    className={star <= (review.rating || 0) ? "fill-orange-400 text-orange-400" : "text-muted-foreground/20 fill-muted-foreground/20"} 
                                  />
                                ))}
                              </div>
                            </div>
                            <span className="text-[12px] text-muted-foreground">
                              {review.createdAt ? format(review.createdAt.toDate(), 'dd/MM', { locale: vi }) : ''}
                            </span>
                          </div>

                          <div className="mb-2">
                            <p className="text-[13px] text-muted-foreground font-medium truncate">{recipe?.title || 'Công thức...'}</p>
                            {order && (
                              <p className="text-[12px] text-muted-foreground/60 font-medium">
                                {dayLabel} {weekNum ? `· Tuần ${weekNum}` : ''}
                              </p>
                            )}
                          </div>

                          {review.comment && (
                            <p className="text-sm text-foreground/80 line-clamp-2 leading-relaxed">
                              {review.comment}
                            </p>
                          )}
                        </div>

                        {review.imageUrls && review.imageUrls.length > 0 && (
                          <div className="shrink-0">
                            <div className="w-8 h-8 rounded-md overflow-hidden border border-border">
                              <img src={getOptimizedUrl(review.imageUrls[0], 100)} className="w-full h-full object-cover" />
                            </div>
                          </div>
                        )}
                      </motion.div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          {/* Top Favorites Section */}
          <section className="bg-card p-8 rounded-[40px] border border-border/50 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-[0.05] text-foreground pointer-events-none">
              <TrendingUp size={160} />
            </div>
            
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black text-foreground flex items-center gap-2">
                  Top món được yêu thích 🏆
                </h2>
                <p className="text-sm text-muted-foreground mt-1">Dựa trên lượt tim của các bé</p>
              </div>
              <button 
                onClick={() => navigate('/chef/recipes')}
                className="text-xs font-bold text-primary px-4 py-2 bg-primary/5 rounded-full hover:bg-primary/10 transition-colors uppercase tracking-widest"
              >
                Tất cả công thức
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {topFavorites.length === 0 ? (
                <div className="col-span-3 py-12 text-center text-muted-foreground/30">
                  <Heart className="mx-auto mb-2 opacity-20" size={48} />
                  <p className="font-medium">Chưa có món nào được yêu thích</p>
                </div>
              ) : (
                topFavorites.map((recipe, idx) => (
                  <motion.div 
                    key={recipe.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="relative bg-secondary border border-border/50 rounded-3xl p-5 group hover:bg-card hover:shadow-xl transition-all h-full"
                    onClick={() => navigate('/chef/recipes')}
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden bg-secondary shadow-inner shrink-0">
                        {recipe.imageUrl ? (
                          <img src={getOptimizedUrl(recipe.imageUrl, 200)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                            <ChefHat size={24} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                          {recipe.title}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-2">
                          <Heart size={14} className="fill-destructive text-destructive" />
                          <span className="text-sm font-black text-destructive">{recipe.favoriteCount || 0}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
                      <div className="flex items-center gap-1">
                        <Star size={12} className="fill-orange-400 text-orange-400" />
                        <span className="text-xs font-bold text-muted-foreground">{recipe.avgRating?.toFixed(1) || '5.0'}</span>
                      </div>
                      <div className="flex -space-x-2">
                        {/* Placeholder for "Faces of kids who liked this" */}
                        {[1, 2, 3].map(i => (
                          <div key={i} className="w-6 h-6 rounded-full border-2 border-background bg-secondary flex items-center justify-center overflow-hidden">
                            <div className="w-full h-full bg-primary/10 flex items-center justify-center text-[10px] text-primary font-bold">♥</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Rank Badge */}
                    <div className={`absolute -top-3 -left-3 w-8 h-8 rounded-full flex items-center justify-center font-black text-white shadow-lg ${
                      idx === 0 ? 'bg-amber-400' : idx === 1 ? 'bg-slate-300' : 'bg-orange-300'
                    }`}>
                      {idx + 1}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: number, color: string }) {
  return (
    <div className={`p-6 rounded-3xl border ${color} shadow-sm transition-transform hover:scale-[1.02]`}>
      <div className="flex items-center gap-4">
        <div className="p-3 bg-card rounded-2xl shadow-sm">{icon}</div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground opacity-60 px-1">{label}</p>
          <p className="text-3xl font-black text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}
