/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  getDoc, 
  updateDoc, 
  arrayUnion,
  limit,
  where
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { News, Recipe, WeeklyMenu, User } from '../../types';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/Avatar';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronRight, 
  Star, 
  ChefHat, 
  UtensilsCrossed, 
  Megaphone,
  X,
  ArrowRight,
  Pin,
  Clock,
  MapPin,
  Navigation,
  Heart,
  Bell,
  Flame,
  Star as StarIcon,
  Target,
  Trophy,
  History,
  Info,
  Sparkles,
  Inbox
} from 'lucide-react';
import { format, startOfWeek } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { memo } from 'react';
import RecipeModal from '../../components/RecipeModal';
import NewsModal from '../../components/NewsModal';
import HeartButton from '../../components/HeartButton';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { getOptimizedUrl } from '../../lib/cloudinary';
import { useStreak } from '../../hooks/useStreak';
import OneSignal from 'react-onesignal';
import { sendPushToUser } from '../../lib/oneSignal';
import { toast } from 'react-hot-toast';

interface DayMenu {
  dayLabel: string;
  meals: Recipe[];
  thumbnailUrl: string;
  mealCount: number;
}

import BottomSheet from '../../components/BottomSheet';

export default function KidsHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { streak, longestStreak } = useStreak(user?.userId);
  
  const [showPushBanner, setShowPushBanner] = useState(false);
  const [news, setNews] = useState<News[]>([]);
  const [unreadNews, setUnreadNews] = useState<News | null>(null);
  const [daysMenu, setDaysMenu] = useState<DayMenu[]>([]);
  const [kitchenConfig, setKitchenConfig] = useState<any>(null);
  const [todayOrder, setTodayOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [isKitchenOpen, setIsKitchenOpen] = useState(false);
  const [readNewsIds, setReadNewsIds] = useState<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // Modals
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [selectedNews, setSelectedNews] = useState<News | null>(null);
  const [selectedDayMenu, setSelectedDayMenu] = useState<DayMenu | null>(null);

  useLockBodyScroll(!!selectedRecipe || !!selectedNews || !!selectedDayMenu);

  useEffect(() => {
    // Initial check for banner visibility
    const isDismissed = localStorage.getItem('notiBannerDismissed') === 'true';
    const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
    
    // Show banner only if not dismissed and permission is not yet decided
    if (!isDismissed && permission === 'default') {
      setShowPushBanner(true);
    } else {
      setShowPushBanner(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const onOneSignalReady = async() => {
        const os = OneSignal as any;
        const subscribed = os.User?.PushSubscription?.optedIn || false;
        
        if (subscribed) {
          setShowPushBanner(false);
        }
        
        // If we found a playerId, sync it just in case
        if (subscribed && user?.userId) {
          const playerId = os.User?.PushSubscription?.id;
          if (playerId) {
            await updateDoc(doc(db, 'users', user.userId), {
              oneSignalIds: arrayUnion(playerId)
            });
          }
        }
    };

    // Listener for subscription changes
    const onSubscriptionChange = async (event: any) => {
      const isSubscribed = event.current.optedIn;
      
      if (isSubscribed) {
        setShowPushBanner(false);
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

    return () => {
      (OneSignal as any).User?.PushSubscription?.removeEventListener('change', onSubscriptionChange);
      window.removeEventListener('onesignal-ready', onOneSignalReady);
    };
  }, [user]);

  const requestPermission = async () => {
    try {
      // Check current browser permission
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'denied') {
          alert('Vui lòng bật thông báo trong cài đặt trình duyệt để nhận tin từ đầu bếp nhé! 😊');
          setShowPushBanner(false);
          return;
        }
      }

      // Try Slidedown first
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
    setShowPushBanner(false);
    localStorage.setItem('notiBannerDismissed', 'true');
  };

  useEffect(() => {
    if (!user) return;

    // Listen to today's order
    const today = format(new Date(), 'eee').toLowerCase();
    const weekId = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-ww');
    const orderQuery = query(
      collection(db, 'orders'),
      where('kidId', '==', user.userId),
      where('weekId', '==', weekId),
      where('day', '==', today)
    );

    const unsubscribeOrder = onSnapshot(orderQuery, (snap) => {
      if (!snap.empty) {
        // Sort to get the latest updated ones first
        const docs = [...snap.docs].sort((a, b) => {
          const aTime = a.data().updatedAt?.toMillis() || 0;
          const bTime = b.data().updatedAt?.toMillis() || 0;
          return bTime - aTime;
        });
        
        // Find the first non-cancelled order, or take the latest if all are cancelled
        const bestDoc = docs.find(d => d.data().status !== 'cancelled') || docs[0];
        setTodayOrder({ id: bestDoc.id, ...bestDoc.data() });
      } else {
        setTodayOrder(null);
      }
    });

    // Device ID Migration logic
    const migrateOneSignalId = async () => {
      if (!user?.userId) return;
      try {
        const userDoc = await getDoc(doc(db, 'users', user.userId));
        const data = userDoc.data();
        if (data && data.oneSignalId && !data.oneSignalIds) {
          console.log('Migrating old oneSignalId to oneSignalIds array...');
          await updateDoc(doc(db, 'users', user.userId), {
            oneSignalIds: [data.oneSignalId],
            oneSignalId: null // or use deleteField() if imported
          });
        }
      } catch (err) {
        console.error('Migration error:', err);
      }
    };
    migrateOneSignalId();

    return () => unsubscribeOrder();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Listen to user's readNews array for changes
    const userRef = doc(db, 'users', user.userId);
    const unsubscribeUser = onSnapshot(userRef, (userSnap) => {
      if (userSnap.exists()) {
        setReadNewsIds((userSnap.data() as User).readNews || []);
      }
    });

    return () => unsubscribeUser();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // 1. Listen for News
    const newsQuery = query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(10));
    const unsubscribeNews = onSnapshot(newsQuery, (snap) => {
      const newsItems = snap.docs.map(d => ({ id: d.id, ...d.data() } as News));
      
      // Sort: Pinned first (by createdAt desc), then non-pinned (by createdAt desc)
      const pinned = newsItems.filter(n => n.isPinned).sort((a, b) => 
        (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)
      );
      const nonPinned = newsItems.filter(n => !n.isPinned).sort((a, b) => 
        (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)
      );
      
      setNews([...pinned, ...nonPinned]);
    }, (err) => {
      console.error('News snapshot error:', err);
      // Even if news fails, we should still try to show the rest of the home page
    });

    // 2. Fetch Weekly Menu
    const fetchWeeklyData = async () => {
      const weekId = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-ww');
      
      try {
        // Fetch config first to know serving days
        const configRef = doc(db, 'config', 'main');
        const configSnap = await getDoc(configRef);
        let servingDays = ['mon', 'tue', 'wed', 'thu', 'fri'];
        
        if (configSnap.exists()) {
          const configData = configSnap.data();
          if (configData.servingDays && Array.isArray(configData.servingDays)) {
            servingDays = configData.servingDays;
          }
          setKitchenConfig(configData);
        }

        const menuRef = doc(db, 'weeklyMenu', weekId);
        const menuSnap = await getDoc(menuRef);
        
        if (menuSnap.exists()) {
          const menuData = menuSnap.data() as WeeklyMenu;
          const ALL_DAYS = [
            { key: 'mon', label: 'Thứ Hai' },
            { key: 'tue', label: 'Thứ Ba' },
            { key: 'wed', label: 'Thứ Tư' },
            { key: 'thu', label: 'Thứ Năm' },
            { key: 'fri', label: 'Thứ Sáu' },
            { key: 'sat', label: 'Thứ Bảy' },
            { key: 'sun', label: 'Chủ Nhật' },
          ];

          const activeDays = ALL_DAYS.filter(d => servingDays.includes(d.key));

          const uniqueRecipeIds = Array.from(new Set(Object.values(menuData.slots).flat()));
          const recipeCache: Record<string, Recipe> = {};

          // Fetch unique recipes
          for (const rid of uniqueRecipeIds) {
            const rDoc = await getDoc(doc(db, 'recipes', rid));
            if (rDoc.exists()) {
              recipeCache[rid] = { id: rDoc.id, ...rDoc.data() } as Recipe;
            }
          }

          // Map to days
          const menus: DayMenu[] = [];
          activeDays.forEach(day => {
            const slotIds = menuData.slots[day.key as keyof WeeklyMenu['slots']] || [];
            const dayMeals = slotIds.map(id => recipeCache[id]).filter(Boolean);
            
            if (dayMeals.length > 0) {
              menus.push({
                dayLabel: day.label,
                meals: dayMeals,
                thumbnailUrl: dayMeals[0].imageUrl || dayMeals[0].thumbnailUrl || '',
                mealCount: dayMeals.length
              });
            }
          });

          setDaysMenu(menus);
        }
      } catch (err) {
        console.error('Error fetching weekly data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchWeeklyData();

    // 3. Keep kitchen config in sync for UI updates (like address/hours)
    const unsubscribeKitchen = onSnapshot(doc(db, 'config', 'main'), (docSnap) => {
      if (docSnap.exists()) {
        setKitchenConfig(docSnap.data());
      }
    });

    return () => {
      unsubscribeNews();
      unsubscribeKitchen();
    };
  }, [user]);

  useEffect(() => {
    const checkKitchenStatus = () => {
      if (!kitchenConfig) {
        setIsKitchenOpen(false);
        return;
      }
      const { openTime, closeTime } = kitchenConfig;
      if (!openTime || !closeTime) {
        setIsKitchenOpen(false);
        return;
      }

      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const [openH, openM] = openTime.split(':').map(Number);
      const [closeH, closeM] = closeTime.split(':').map(Number);
      const openMinutes = openH * 60 + openM;
      const closeMinutes = closeH * 60 + closeM;

      setIsKitchenOpen(currentMinutes >= openMinutes && currentMinutes <= closeMinutes);
    };

    checkKitchenStatus();
    const timer = setInterval(checkKitchenStatus, 60000); // Check every minute
    return () => clearInterval(timer);
  }, [kitchenConfig]);

  const updateOrderStatus = async (newStatus: string) => {
    if (!todayOrder) return;
    try {
      await updateDoc(doc(db, 'orders', todayOrder.id), {
        status: newStatus,
        updatedAt: new Date()
      });

      // Notify chef
      const kidName = greetingName;
      const recipeDoc = await getDoc(doc(db, 'recipes', todayOrder.recipeId));
      const recipeName = recipeDoc.data()?.title || 'món ăn';
      const displayRecipeName = recipeName.length > 30 ? recipeName.substring(0, 27) + '...' : recipeName;

      const messages: Record<string, { title: string; body: string }> = {
        on_the_way: {
          title: `Bé ${kidName} đang trên đường!`,
          body: `Bé đang đến lấy món ${displayRecipeName}. Chuẩn bị nhé!`
        },
        arrived: {
          title: `Bé ${kidName} đã tới bếp!`,
          body: `Bé đang chờ nhận món ${displayRecipeName}. Giao món thôi!`
        }
      };

      const msg = messages[newStatus];
      if (msg) {
        const { getChefOneSignalIds } = await import('../../lib/oneSignal');
        const chefIds = await getChefOneSignalIds();
        if (chefIds.length > 0) {
          await sendPushToUser(chefIds, msg.title, msg.body, '/chef/orders');
        }
      }
    } catch (err) {
      console.error('Error updating order status:', err);
    }
  };
  console.log(todayOrder)

  useEffect(() => {
    // Check for unread news that deserve a popup
    // Priority: Pinned unread first, then regular recent unread
    if (news.length === 0) return;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Try finding pinned unread first
    let unread = news.find(n => n.isPinned && !readNewsIds.includes(n.id!));
    
    // If no pinned unread, find recent unread
    if (!unread) {
      unread = news.find(n => {
        if (readNewsIds.includes(n.id!)) return false;
        const createdAt = n.createdAt?.toDate() || new Date();
        return createdAt > sevenDaysAgo;
      });
    }

    if (unread) {
      setUnreadNews(unread);
    } else {
      setUnreadNews(null);
    }
  }, [news, readNewsIds]);

  const dismissPopup = async () => {
    if (!unreadNews || !user) return;
    try {
      await updateDoc(doc(db, 'users', user.userId), {
        readNews: arrayUnion(unreadNews.id)
      });
      // unreadNews will be updated by the onSnapshot listeners
    } catch (err) {
      console.error('Error marking news as read:', err);
    }
  };

  const stripHtml = (html: string) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  if (loading) return <div className="p-20 text-center"><ChefHat className="animate-bounce mx-auto text-primary" size={48} /></div>;

  const greetingName = user?.name || 'Bé';
  const todayFormatted = format(new Date(), 'EEEE, dd/MM', { locale: vi });

  return (
    <div className="h-full overflow-y-auto scrollbar-hide kid-page-content">
      {/* OneSignal Push Notification Banner */}
      {showPushBanner && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-secondary border border-border rounded-2xl p-4 flex items-center gap-4 mb-4 mt-6 shadow-sm relative overflow-hidden"
        >
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Bell size={20} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-foreground">Bật thông báo nhé!</div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <ChefHat size={12} className="text-primary/60" />
              Bé sẽ biết ngay khi món ăn sẵn sàng
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={requestPermission}
              className="bg-primary text-primary-foreground font-bold px-4 py-2 rounded-xl text-xs shadow-sm hover:opacity-90 transition-all"
            >
              Bật
            </button>
            <button 
              onClick={handleDismissBanner}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </motion.div>
      )}

      {/* Hero Greeting Section */}
      <div className="page-header pt-2 mb-4 shrink-0">
        <section className="bg-gradient-to-br from-secondary/50 to-secondary p-8 rounded-[40px] border border-border">
          <div className="flex items-center justify-between gap-6">
            <div className="flex flex-col gap-1">
              <p className="text-primary font-black uppercase tracking-[0.2em] text-[10px] mb-2">{todayFormatted}</p>
              <h1 className="text-2xl md:text-3xl font-black text-foreground tracking-tight flex items-center gap-6">
                <div className="flex flex-col">
                Xin chào, 
                <div>bé <span className="text-primary">{greetingName}!</span></div>
                </div>
                <Sparkles className="text-primary animate-pulse" size={24} />
              </h1>
              <p className="text-muted-foreground font-medium text-sm sm:text-base">Hôm nay bé muốn ăn gì nào?</p>
            </div>
            <div 
              className="shrink-0 cursor-pointer hover:scale-105 transition-transform"
              onClick={() => navigate('/kids/profile')}
            >
              <Avatar 
                src={user?.avatar} 
                name={greetingName} 
                size={80} 
                className="rounded-3xl border-4 border-card shadow-lg"
              />
            </div>
          </div>
        </section>
      </div>

      {streak >= 1 && (
        <div className="max-w-[900px] mx-auto w-full mb-8 px-4 md:px-0">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 bg-accent/40 border border-border rounded-xl px-4 py-3 w-full shadow-sm justify-start"
          >
            <Flame className="text-orange-500 fill-orange-500" size={18} />
            <span className="text-[20px] font-bold text-primary leading-none">{streak}</span>
            <span className="text-[13px] text-muted-foreground font-medium whitespace-nowrap">ngày liên tiếp</span>
            <span className="text-muted-foreground/30 text-[16px] mx-1">·</span>
            <span className="text-[13px] text-primary font-medium whitespace-nowrap flex items-center gap-1.5">
              {streak === 1 && <><Sparkles size={14} /> Ngày đầu tiên!</>}
              {streak === 2 && <><StarIcon size={14} className="fill-current" /> 2 ngày rồi!</>}
              {(streak === 3 || streak === 4) && <><Target size={14} /> Phong độ tốt!</>}
              {streak === 5 && <><Trophy size={14} /> Cả tuần!</>}
              {(streak >= 6 && streak <= 9) && <><Flame size={14} className="fill-current" /> Chăm lắm!</>}
              {streak >= 10 && <><History size={14} /> Siêu sao!</>}
            </span>
          </motion.div>
        </div>
      )}

      <div className="page-content">
        <div className="max-w-[900px] mx-auto flex flex-col gap-10">
          {/* News Popup Notification */}
          <AnimatePresence>
            {unreadNews && (
              <motion.div 
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -100, opacity: 0 }}
                className="fixed top-24 left-1/2 -translate-x-1/2 z-[120] w-[calc(100%-32px)] max-w-lg"
              >
                <div className="bg-card border-2 border-primary rounded-[32px] shadow-2xl p-4 flex items-center gap-4 overflow-hidden relative">
                  <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center text-primary shrink-0">
                    <Megaphone className="animate-swing" size={32} />
                  </div>
                  <div className="flex-1 min-w-0 pr-8">
                    <p className="text-[10px] font-black uppercase text-primary tracking-widest mb-1">Tin nhắn mới!</p>
                    <h4 className="font-bold text-foreground truncate">{unreadNews.title}</h4>
                    <button 
                      onClick={() => {
                        setSelectedNews(unreadNews);
                        dismissPopup();
                      }}
                      className="text-xs font-bold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 mt-1"
                    >
                      Xem ngay <ArrowRight size={12} />
                    </button>
                  </div>
                  <button 
                    onClick={dismissPopup}
                    className="modal-close-btn"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Order Status Tracking (if ready/on_the_way/arrived) */}
          {todayOrder && ['ready', 'on_the_way', 'arrived'].includes(todayOrder.status) && (
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-primary rounded-[40px] p-8 text-primary-foreground shadow-xl shadow-primary-shadow/30 relative overflow-hidden"
            >
              {/* Decorative stuff */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16 blur-3xl" />
              
              <div className="relative z-10 flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                      <UtensilsCrossed size={28} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black tracking-tight leading-tight">
                        {todayOrder.status === 'ready' && 'Bữa ăn đã sẵn sàng!'}
                        {todayOrder.status === 'on_the_way' && 'Bữa ăn đang tới!'}
                        {todayOrder.status === 'arrived' && 'Đã tới nơi rồi!'}
                      </h3>
                      <p className="text-primary-foreground/90 text-sm font-medium">Bé mau qua bếp nhận món nhé</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1 mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isKitchenOpen ? 'bg-green-400 animate-pulse' : 'bg-slate-300'}`} />
                      <span className="text-[11px] font-black uppercase tracking-widest text-primary-foreground/80">
                        {isKitchenOpen ? 'Bếp đang mở' : 'Bếp đã đóng'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-primary-foreground/90">
                      <Clock size={12} />
                      <span className="text-xs font-bold">
                        Giờ phục vụ: {kitchenConfig?.openTime} – {kitchenConfig?.closeTime} · {
                          Array.isArray(kitchenConfig?.servingDays) 
                          ? kitchenConfig.servingDays
                              .map((d: string) => {
                                const day = [
                                  { key: 'mon', label: 'Thứ 2' },
                                  { key: 'tue', label: 'Thứ 3' },
                                  { key: 'wed', label: 'Thứ 4' },
                                  { key: 'thu', label: 'Thứ 5' },
                                  { key: 'fri', label: 'Thứ 6' },
                                  { key: 'sat', label: 'Thứ 7' },
                                  { key: 'sun', label: 'Chủ Nhật' }
                                ].find(item => item.key === d);
                                return day?.label;
                              })
                              .filter(Boolean)
                              .join(', ')
                          : kitchenConfig?.servingDays
                        }
                      </span>
                    </div>
                  </div>

                  {todayOrder.status === 'ready' && (
                    <div className="space-y-2">
                      <button
                        disabled={!isKitchenOpen}
                        onClick={() => updateOrderStatus('on_the_way')}
                        className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${
                          isKitchenOpen 
                            ? 'bg-card text-primary hover:scale-[1.02] active:scale-95' 
                            : 'bg-primary-foreground/20 text-primary-foreground/50 cursor-not-allowed border border-white/10'
                        }`}
                      >
                        <Navigation size={18} className="rotate-45" />
                        Mình đang đến lấy!
                      </button>
                      {!isKitchenOpen && (
                        <p className="text-[10px] text-center font-bold text-primary-foreground/70 bg-white/10 py-2 rounded-xl border border-white/5">
                          Bếp phục vụ từ {kitchenConfig?.openTime} – {kitchenConfig?.closeTime}. Vui lòng quay lại trong giờ phục vụ nhé!
                        </p>
                      )}
                    </div>
                  )}

                  {todayOrder.status === 'on_the_way' && (
                    <div className="space-y-2">
                      <button
                        disabled={!isKitchenOpen}
                        onClick={() => updateOrderStatus('arrived')}
                        className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${
                          isKitchenOpen 
                            ? 'bg-card text-primary hover:scale-[1.02] active:scale-95' 
                            : 'bg-primary-foreground/20 text-primary-foreground/50 cursor-not-allowed border border-white/10'
                        }`}
                      >
                        <MapPin size={18} />
                        Mình đã tới bếp!
                      </button>
                      {!isKitchenOpen && (
                        <p className="text-[10px] text-center font-bold text-primary-foreground/70 bg-white/10 py-2 rounded-xl border border-white/5">
                          Bếp phục vụ từ {kitchenConfig?.openTime} – {kitchenConfig?.closeTime}. Vui lòng quay lại trong giờ phục vụ nhé!
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {kitchenConfig?.mapsShareLink && (
                  <button
                    onClick={() => window.open(kitchenConfig.mapsShareLink, '_blank')}
                    className="w-full h-10 border-[1.5px] border-primary-foreground/40 bg-white/10 text-primary-foreground rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all hover:bg-white/20"
                  >
                    <MapPin size={16} />
                    Xem đường đến bếp
                  </button>
                )}

                <div className="flex flex-col gap-3">
                  {kitchenConfig?.directions && (
                    <div className="flex items-start gap-3 bg-white/10 p-5 rounded-[24px] border border-white/10 backdrop-blur-sm">
                      <Navigation size={20} className="shrink-0 mt-1" />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-foreground/80 mb-1">Cách đi tới bếp</p>
                        <p className="text-sm font-medium leading-relaxed italic">
                          {kitchenConfig?.directions}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.section>
          )}

          {/* Weekly Menu Section */}
          <section>
            <div className="flex flex-col gap-1 mb-6 px-1">
              <h2 className="text-[16px] md:text-[20px] font-semibold text-foreground flex items-center gap-3">
                <UtensilsCrossed className="text-primary" size={20} />
                Thực đơn tuần này
              </h2>
              <p className="text-xs md:text-[13px] font-normal text-muted-foreground">Khám phá món ngon trong tuần của bé</p>
            </div>

            {streak === 0 && !loading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-8 p-4 bg-secondary border border-dashed border-border rounded-2xl text-center flex items-center justify-center gap-2"
              >
                <p className="text-xs text-primary font-medium italic">
                  Đặt món hôm nay để bắt đầu streak mới nhé!
                </p>
              </motion.div>
            )}
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-6">
              {daysMenu.length === 0 ? (
                <div className="col-span-full py-12 text-center bg-secondary rounded-[40px] border border-dashed border-border">
                  <p className="text-muted-foreground font-bold">Sắp có thực đơn mới rồi nè!</p>
                </div>
              ) : (
                daysMenu.map((day, idx) => (
                  <motion.div 
                    key={`${day.dayLabel}-${idx}`}
                    whileHover={{ y: -8 }}
                    onClick={() => setSelectedDayMenu(day)}
                    className="w-full bg-card p-3 rounded-[32px] shadow-sm border border-border cursor-pointer transition-all hover:shadow-xl hover:border-primary/20 group"
                  >
                    <div className="h-[160px] rounded-[24px] overflow-hidden mb-4 bg-secondary relative">
                      {day.thumbnailUrl ? (
                         <img src={getOptimizedUrl(day.thumbnailUrl, 400)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ChefHat size={48} /></div>
                      )}
                      {/* Day Label */}
                      <div className="absolute top-3 left-3 bg-card/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-border shadow-sm">
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest">{day.dayLabel.toUpperCase()}</span>
                      </div>
                      {/* Meal Count Badge */}
                      <div className="absolute top-3 right-3 bg-card/90 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-1 shadow-md border border-border">
                        <span className="text-[11px] font-black text-card-foreground">{day.mealCount} món</span>
                      </div>
                    </div>
                    <div className="px-1 pb-1">
                      <h4 className="font-medium text-foreground text-[15px] leading-tight mb-1 group-hover:text-primary transition-colors">Thực đơn {day.dayLabel}</h4>
                      <p className="text-[13px] text-muted-foreground font-normal line-clamp-1">
                        {day.mealCount === 1 
                          ? day.meals[0].title 
                          : `${day.meals[0].title} + ${day.mealCount - 1} món khác`}
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </section>

          {/* News Section */}
          <section>
            <div className="flex items-center justify-between mb-8 px-1 gap-8">
              <div className="space-y-[2px]">
                <h2 className="text-[20px] font-semibold text-foreground flex items-center gap-3">
                  <Megaphone className="text-primary animate-swing" size={20} />
                  Tin từ Đầu bếp
                </h2>
                <p className="text-[13px] font-normal text-muted-foreground">Thông báo và hoạt động mới nhất tại bếp trường</p>
              </div>
              {news.length > 3 && (
                <button 
                  className="text-primary font-black text-xs tracking-widest flex items-center gap-1 hover:underline shrink-0"
                  onClick={() => {/* To news list page if ever exists */}}
                >
                  Xem thêm <ChevronRight size={16} />
                </button>
              )}
            </div>

            {news.length === 0 ? (
              <div className="bg-secondary border-2 border-dashed border-border rounded-[40px] py-16 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-muted-foreground/30 mb-4">
                  <Inbox size={40} />
                </div>
                <p className="text-muted-foreground font-bold text-sm">Chưa có tin mới từ Đầu bếp</p>
              </div>
            ) : (
              <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide -mx-2 px-2">
                {news.slice(0, 3).map(item => (
                  <motion.div 
                    key={item.id}
                    whileHover={{ y: -5 }}
                    onClick={() => setSelectedNews(item)}
                    className="min-w-[280px] w-72 bg-card rounded-[32px] border border-border shadow-sm overflow-hidden cursor-pointer hover:shadow-xl transition-all"
                  >
                    <div className="h-[140px] w-full bg-secondary relative">
                      {item.imageUrl ? (
                        <img src={getOptimizedUrl(item.imageUrl, 400)} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Megaphone size={40} /></div>
                      )}
                      {item.isPinned && (
                        <div className="absolute top-3 left-3 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1.5 border border-primary/50">
                          <Pin size={12} fill="currentColor" className="-rotate-45" />
                          Ghim
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 block">
                        {format(item.createdAt.toDate(), 'dd MMMM yyyy', { locale: vi })}
                      </span>
                      <h3 className="text-[15px] font-medium text-foreground leading-snug mb-2 line-clamp-2 hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                        {stripHtml(item.content).slice(0, 80)}
                        {stripHtml(item.content).length > 80 ? '...' : ''}
                      </p>
                      <div className="flex items-center gap-2 text-primary font-bold text-xs mt-auto">
                        Chi tiết <ArrowRight size={14} />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Global Modals */}
      <BottomSheet 
        isOpen={!!selectedDayMenu} 
        onClose={() => setSelectedDayMenu(null)}
        className="md:max-w-lg"
      >
        {selectedDayMenu && (
          <div className="flex flex-col">
            <div className="p-6 md:p-8 border-b border-border flex items-center justify-between shrink-0">
              <div className="space-y-1">
                <h3 className="text-xl md:text-2xl font-black text-foreground">Thực đơn {selectedDayMenu.dayLabel}</h3>
                <p className="text-sm font-medium text-muted-foreground">Có {selectedDayMenu.mealCount} món ngon cho bé</p>
              </div>
            </div>
            <div className="flex-1 p-6 space-y-4 pb-20 md:pb-8">
              {selectedDayMenu.meals.map(meal => (
                <div 
                  key={meal.id}
                  onClick={() => {
                    setSelectedRecipe(meal);
                    setSelectedDayMenu(null);
                  }}
                  className="w-full bg-card p-4 rounded-3xl border border-border flex items-center gap-4 hover:border-primary/30 hover:bg-secondary/10 transition-all group cursor-pointer"
                  role="button"
                  tabIndex={0}
                >
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-secondary shrink-0 relative">
                    {meal.imageUrl ? (
                      <img src={getOptimizedUrl(meal.imageUrl, 200)} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <UtensilsCrossed size={24} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <h4 className="font-bold text-foreground text-[15px] group-hover:text-primary transition-colors">{meal.title}</h4>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex items-center gap-1 text-orange-400">
                        <Star size={12} className="fill-orange-400" />
                        <span className="text-xs font-bold text-muted-foreground">{meal.avgRating?.toFixed(1) || '5.0'}</span>
                      </div>
                      {meal.favoriteCount !== undefined && (
                        <div className="flex items-center gap-1">
                          <Heart size={10} className="fill-destructive text-destructive" />
                          <span className="text-[10px] font-bold text-muted-foreground">{meal.favoriteCount}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <HeartButton recipeId={meal.id!} size={32} />
                    <ChevronRight size={20} className="text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </BottomSheet>

      <RecipeModal 
        recipe={selectedRecipe} 
        onClose={() => setSelectedRecipe(null)} 
      />
      <NewsModal 
        news={selectedNews} 
        onClose={() => setSelectedNews(null)} 
      />
    </div>

  );
}

