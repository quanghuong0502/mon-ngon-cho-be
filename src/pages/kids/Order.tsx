/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, memo } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc,
  addDoc,
  onSnapshot,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Recipe, WeeklyMenu, Order } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Check, 
  ChefHat, 
  Loader2, 
  Star, 
  Info,
  Heart,
  CircleCheckBig,
  UtensilsCrossed
} from 'lucide-react';
import { format, startOfWeek, addDays, isBefore, startOfDay, addWeeks, isSameDay } from 'date-fns';
import { vi } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import RecipeModal from '../../components/RecipeModal';
import HeartButton from '../../components/HeartButton';
import ConfirmModal from '../../components/ConfirmModal';
import { getOptimizedUrl } from '../../lib/cloudinary';

const ALL_DAYS = [
  { key: 'mon', label: 'Thứ Hai' },
  { key: 'tue', label: 'Thứ Ba' },
  { key: 'wed', label: 'Thứ Tư' },
  { key: 'thu', label: 'Thứ Năm' },
  { key: 'fri', label: 'Thứ Sáu' },
  { key: 'sat', label: 'Thứ Bảy' },
  { key: 'sun', label: 'Chủ Nhật' },
];

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
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

const MealCard = memo(({ 
  recipe, 
  isLocked, 
  handleSelect, 
  dayKey, 
  isEditing, 
  isMealSelected, 
  isMealConfirmed, 
  showCheckmark,
  isDimmed,
  onInfoClick
}: {
  recipe: Recipe;
  isLocked: boolean;
  handleSelect: (day: string, recipeId: string) => void;
  dayKey: string;
  isEditing: boolean;
  isMealSelected: boolean;
  isMealConfirmed: boolean;
  showCheckmark: boolean;
  isDimmed: boolean;
  onInfoClick: (recipe: Recipe) => void;
}) => {
  const isActive = isEditing ? isMealSelected : isMealConfirmed;

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={!isLocked ? { y: -2 } : {}}
      onClick={() => !isLocked && handleSelect(dayKey, recipe.id!)}
      className={`relative group rounded-2xl border-2 transition-all overflow-hidden ${
        isActive 
          ? 'bg-primary/5 border-primary shadow-lg shadow-primary-shadow/50' 
          : 'bg-card border-border shadow-sm hover:border-primary/50'
      } ${isDimmed ? 'opacity-[0.35] cursor-not-allowed' : 'opacity-100 cursor-pointer'}`}
    >
      <div className="h-[120px] w-full bg-secondary relative group-hover:brightness-95 transition-all">
        {recipe.imageUrl ? (
          <img src={getOptimizedUrl(recipe.imageUrl, 400)} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <UtensilsCrossed size={32} />
          </div>
        )}
        
        <div className="absolute top-2 right-2 z-20">
          <HeartButton recipeId={recipe.id!} size={28} />
        </div>
        
        {showCheckmark && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg border-2 border-card z-10">
            <Check size={14} strokeWidth={4} />
          </div>
        )}

        <button 
          onClick={(e) => {
            e.stopPropagation();
            onInfoClick(recipe);
          }}
          className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-card/90 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-primary transition-colors shadow-sm opacity-0 group-hover:opacity-100 z-10"
        >
          <Info size={14} />
        </button>
      </div>

      <div className="p-3 pb-2.5">
        <h4 className="font-medium text-foreground text-[14px] line-clamp-1 mb-1 leading-tight">{recipe.title}</h4>
        <div className="flex items-center gap-1.5 text-primary">
          {[1, 2, 3, 4, 5].map(star => (
            <Star key={star} size={8} className={star <= (recipe.avgRating || 5) ? 'fill-primary' : 'fill-muted-foreground/20 text-muted-foreground/20'} />
          ))}
          <span className="text-[12px] font-bold ml-0.5">{recipe.avgRating?.toFixed(1) || '5.0'}</span>
          <span className="text-muted-foreground/50 mx-0.5">·</span>
          <div className="flex items-center gap-0.5 text-destructive">
            <Heart size={10} fill="currentColor" />
            <span className="text-[11px] font-bold">{recipe.favoriteCount || 0}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

export default function KidsOrder() {
  const { user } = useAuth();
  
  const initialWeekStart = (() => {
    let ws = startOfWeek(new Date(), { weekStartsOn: 1 });
    const today = new Date();
    if (today.getDay() === 0 || today.getDay() === 6) {
      ws = addWeeks(ws, 1);
    }
    return ws;
  })();

  const [currentWeekStart, setCurrentWeekStart] = useState(initialWeekStart);
  const weekId = format(currentWeekStart, 'yyyy-ww');

  const [weeklyMenu, setWeeklyMenu] = useState<WeeklyMenu | null>(null);
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
  const [orders, setOrders] = useState<Record<string, Order>>({});
  const [tempSelections, setTempSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [servingDays, setServingDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const hasInitializedTab = React.useRef(false);
  const [cancelModal, setCancelModal] = useState<{ isOpen: boolean; day: string | null }>({
    isOpen: false,
    day: null
  });

  const activeDays = ALL_DAYS.filter(d => servingDays.includes(d.key));

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'config', 'main');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.servingDays && Array.isArray(data.servingDays)) {
            setServingDays(data.servingDays);
          }
        }
      } catch (err) {
        console.error('Error fetching kitchen config:', err);
      } finally {
        setConfigLoading(false);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    if (servingDays.length > 0 && !hasInitializedTab.current) {
      const getTodayTab = () => {
        const day = new Date().getDay(); // 0=Sun, 1=Mon...6=Sat
        const dayMap: Record<number, string> = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 0: 'sun' };
        const todayKey = dayMap[day];
        
        // If today is a serving day → select it
        if (servingDays.includes(todayKey)) return todayKey;
        
        // If weekend or not serving → select next available future serving day
        const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const todayIndex = dayOrder.indexOf(todayKey);
        for (let i = todayIndex + 1; i < dayOrder.length; i++) {
          if (servingDays.includes(dayOrder[i])) return dayOrder[i];
        }
        // Fallback: first serving day of week
        return servingDays[0];
      };

      setSelectedDay(getTodayTab());
      hasInitializedTab.current = true;
    }
  }, [servingDays]);

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: user?.userId,
        email: user?.username,
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const ordersQuery = query(
      collection(db, 'orders'),
      where('kidId', '==', user.userId),
      where('weekId', '==', weekId)
    );

    const unsubscribeOrders = onSnapshot(ordersQuery, (snap) => {
      const orderMap: Record<string, Order> = {};
      snap.docs.forEach(d => {
        const order = { id: d.id, ...d.data() } as Order;
        const current = orderMap[order.day];
        
        if (!current) {
          orderMap[order.day] = order;
          return;
        }

        // Prioritize active orders (anything not cancelled)
        if (current.status === 'cancelled' && order.status !== 'cancelled') {
          orderMap[order.day] = order;
          return;
        }

        // If both cancelled or both active, take the latest one
        if (order.updatedAt.toMillis() > current.updatedAt.toMillis()) {
          const bothActive = current.status !== 'cancelled' && order.status !== 'cancelled';
          const bothCancelled = current.status === 'cancelled' && order.status === 'cancelled';
          if (bothActive || bothCancelled) {
            orderMap[order.day] = order;
          }
        }
      });
      setOrders(orderMap);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));

    const fetchMenuAndRecipes = async () => {
      try {
        const menuRef = doc(db, 'weeklyMenu', weekId);
        const menuSnap = await getDoc(menuRef);
        
        if (menuSnap.exists()) {
          const menuData = menuSnap.data() as WeeklyMenu;
          setWeeklyMenu(menuData);

          const allIds = Array.from(new Set(Object.values(menuData.slots).flat())).filter(Boolean) as string[];
          const recipeMap: Record<string, Recipe> = {};
          
          await Promise.all(allIds.map(async (id) => {
            const rDoc = await getDoc(doc(db, 'recipes', id));
            if (rDoc.exists()) recipeMap[id] = { id: rDoc.id, ...rDoc.data() } as Recipe;
          }));
          setRecipes(recipeMap);
        } else {
          setWeeklyMenu(null);
          setRecipes({});
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'weeklyMenu');
      } finally {
        setLoading(false);
      }
    };

    fetchMenuAndRecipes();
    return () => unsubscribeOrders();
  }, [user, weekId]);

  const handleSelect = (day: string, recipeId: string) => {
    const order = orders[day];
    // Only block selection if there's an active non-cancelled order that isn't pending
    if (order && order.status !== 'cancelled') {
      if (order.status !== 'pending') return;
      setTempSelections(prev => ({ ...prev, [day]: recipeId }));
      return;
    }

    setTempSelections(prev => {
      if (prev[day] === recipeId) {
        const next = { ...prev };
        delete next[day];
        return next;
      }
      return { ...prev, [day]: recipeId };
    });
  };

  const handleConfirm = async (day: string) => {
    const recipeId = tempSelections[day];
    if (!user || !recipeId) return;

    setSubmitting(prev => ({ ...prev, [day]: true }));
    const loadingToast = toast.loading('Đang gửi...');
    
    try {
      const order = orders[day];
      const now = Timestamp.now();

      if (order && order.status === 'pending') {
        await updateDoc(doc(db, 'orders', order.id!), {
          recipeId,
          status: 'pending',
          updatedAt: now
        });
        toast.success(`Đã cập nhật món cho ${ALL_DAYS.find(d => d.key === day)?.label}! 🎉`, { id: loadingToast });
      } else {
        const orderData: Omit<Order, 'id'> = {
          kidId: user.userId,
          weekId,
          day: day as any,
          recipeId,
          status: 'pending',
          createdAt: now,
          updatedAt: now
        };
        await addDoc(collection(db, 'orders'), orderData);
        toast.success('Đặt món thành công! 🎉', { id: loadingToast });
      }
      setTempSelections(prev => {
        const next = { ...prev };
        delete next[day];
        return next;
      });
    } catch (err) {
      console.error('Submit error:', err);
      toast.error('Có lỗi xảy ra, bé thử lại nhé!', { id: loadingToast });
    } finally {
      setSubmitting(prev => ({ ...prev, [day]: false }));
    }
  };

  const statusIcons: Record<string, any> = {
    pending: <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />,
    preparing: <Loader2 size={12} className="animate-spin text-primary" />,
    ready: <CircleCheckBig size={14} className="text-green-500" />,
    done: <CircleCheckBig size={12} className="text-muted-foreground/30" />,
    cancelled: <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />
  };

  const statusLabels: Record<string, string> = {
    pending: 'Đang chờ',
    preparing: 'Đang làm',
    ready: 'Sẵn sàng!',
    done: 'Hoàn thành',
    cancelled: 'Đã huỷ'
  };

  const lockMessages: Record<string, string> = {
    preparing: "🔒 Đang làm, không thể thay đổi",
    ready: "🔒 Sẵn sàng rồi, qua lấy nhé!",
    done: "✓ Hoàn thành"
  };

  const statusColors: Record<string, string> = {
    pending: 'text-muted-foreground bg-secondary',
    preparing: 'text-primary bg-primary/10',
    ready: 'text-green-600 bg-green-50',
    done: 'text-muted-foreground bg-secondary',
    cancelled: 'text-muted-foreground bg-secondary border-border opacity-60'
  };

  const handleCancel = async (day: string) => {
    setCancelModal({ isOpen: true, day });
  };

  const executeCancel = async () => {
    const day = cancelModal.day;
    if (!day) return;
    
    const order = orders[day];
    if (!order || order.status !== 'pending') return;

    const dayLabel = ALL_DAYS.find(d => d.key === day)?.label;

    const loadingToast = toast.loading('Đang huỷ...');
    try {
      await updateDoc(doc(db, 'orders', order.id!), {
        status: 'cancelled',
        updatedAt: Timestamp.now()
      });
      toast.success(`Đã huỷ đặt món ${dayLabel}`, { id: loadingToast });
    } catch (err) {
      console.error('Cancel error:', err);
      toast.error('Có lỗi xảy ra, bé thử lại nhé!', { id: loadingToast });
    }
  };

  if (loading || configLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Loader2 className="animate-spin text-primary mb-4" size={48} />
        <p className="text-muted-foreground font-medium">Đang tải thực đơn...</p>
      </div>
    );
  }

  if (!weeklyMenu) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <ChefHat className="text-muted-foreground/30 mb-6" size={50} />
        <h2 className="text-xl font-black text-foreground">Chưa có thực đơn tuần này</h2>
        <p className="text-muted-foreground mt-2 font-medium text-sm">Bé vui lòng quay lại sau khi Đầu bếp đã chuẩn bị xong nhé!</p>
      </div>
    );
  }

  const mobileTabs = [
    { key: 'mon', label: 'T2' },
    { key: 'tue', label: 'T3' },
    { key: 'wed', label: 'T4' },
    { key: 'thu', label: 'T5' },
    { key: 'fri', label: 'T6' },
    { key: 'sat', label: 'T7' },
    { key: 'sun', label: 'CN' },
  ].filter(t => servingDays.includes(t.key));

  return (
    <div className="flex flex-col h-full bg-transparent relative">
      {/* Scrollable area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {/* Title + subtitle - non-sticky, scrolls */}
          <div className="px-4 md:px-6 pt-4 mb-4">
            <h1 className="text-[18px] md:text-[20px] font-semibold text-foreground">Thực đơn hàng ngày</h1>
            <p className="text-[13px] font-normal text-muted-foreground">
              Chọn món bé muốn ăn cho từng ngày và nhấn xác nhận nhé!
            </p>
          </div>

          {/* Sticky Week Badge for Mobile */}
          <div className="sticky top-0 z-[29] bg-background px-4 pt-4 pb-2 md:hidden">
            <div className="inline-flex items-center gap-3 bg-card px-4 py-2 rounded-2xl shadow-sm border border-border w-full">
              <span className="bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-lg">
                TUẦN {weekId.split('-')[1]}
              </span>
              <span className="text-muted-foreground text-xs font-black tracking-tight uppercase">
                {format(currentWeekStart, 'dd/MM', { locale: vi })} – {format(addDays(currentWeekStart, activeDays.length > 0 ? ALL_DAYS.findIndex(d => d.key === activeDays[activeDays.length-1].key) : 4), 'dd/MM', { locale: vi })}
              </span>
            </div>
          </div>

          {/* Sticky Day Tab Bar for Mobile - Sticks below Week Badge */}
          <div className="sticky top-[76px] z-30 bg-background border-b border-border px-4 pt-4 pb-4 md:hidden overflow-x-auto scrollbar-hide flex justify-center gap-3 no-scrollbar">
            <style dangerouslySetInnerHTML={{ __html: `
              .no-scrollbar::-webkit-scrollbar { display: none; }
              .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
            {mobileTabs.map((tab) => {
              const idx = ALL_DAYS.findIndex(d => d.key === tab.key);
              const dayDate = addDays(currentWeekStart, idx);
              const isPast = isBefore(dayDate, startOfDay(new Date()));
              const isToday = isSameDay(dayDate, new Date());
              const order = orders[tab.key];
              const isSelected = selectedDay === tab.key;
              
              return (
                <button
                  key={tab.key}
                  onClick={() => setSelectedDay(tab.key)}
                  className={`relative flex-shrink-0 px-4 py-[6px] rounded-full text-[13px] font-medium transition-all ${
                    isSelected 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-secondary text-muted-foreground'
                  } ${isPast ? 'opacity-45' : 'opacity-100'} ${isToday ? 'font-semibold underline decoration-primary/30' : ''}`}
                >
                  {order && order.status !== 'cancelled' && (
                    <div className={`absolute -top-1 -right-0.5 w-[7px] h-[7px] rounded-full border border-card z-10 ${
                      order.status === 'pending' ? 'bg-muted-foreground/50' :
                      order.status === 'preparing' ? 'bg-orange-400' :
                      order.status === 'ready' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' :
                      'bg-green-500'
                    }`} />
                  )}
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Page Content area with global padding class */}
          <div className="kid-page-content">
            {/* Desktop Week Info - Hidden on mobile as we have the sticky one */}
            <div className="hidden md:flex mb-6">
              <div className="inline-flex items-center gap-3 bg-card px-4 py-2 rounded-2xl shadow-sm border border-border">
                <span className="bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-lg">
                  TUẦN {weekId.split('-')[1]}
                </span>
                <span className="text-muted-foreground text-xs font-black tracking-tight uppercase">
                  {format(currentWeekStart, 'dd/MM', { locale: vi })} – {format(addDays(currentWeekStart, activeDays.length > 0 ? ALL_DAYS.findIndex(d => d.key === activeDays[activeDays.length-1].key) : 4), 'dd/MM', { locale: vi })}
                </span>
              </div>
            </div>

            <div className="">
              {/* Mobile View - Single Day */}
            <div className="md:hidden space-y-6">
              {(() => {
                const day = ALL_DAYS.find(d => d.key === selectedDay);
                if (!day) return null;

                const idx = ALL_DAYS.findIndex(d => d.key === day.key);
                const dayDate = addDays(currentWeekStart, idx);
                const isPast = isBefore(dayDate, startOfDay(new Date()));
                const isToday = isSameDay(dayDate, new Date());
                const isDateLocked = isPast || isToday;

                const slotRecipes = weeklyMenu.slots[day.key as keyof WeeklyMenu['slots']] || [];
                const order = orders[day.key];
                const tempSelection = tempSelections[day.key];
                const isConfirmed = order && order.status !== 'cancelled';
                const isPending = order?.status === 'pending';
                const isLocked = (isConfirmed && !isPending) || isDateLocked;
                const isEditing = !!tempSelection;
                const hasChanges = isEditing && (tempSelection !== order?.recipeId || order?.status === 'cancelled');

                if (slotRecipes.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/30">
                      <UtensilsCrossed size={32} className="mb-2 opacity-20" />
                      <p className="text-[14px]">Chưa có món hôm nay</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3">
                      {slotRecipes.map(recipeId => {
                        const recipe = recipes[recipeId];
                        if (!recipe) return null;
                        
                        const isMealConfirmed = order?.recipeId === recipeId && order.status !== 'cancelled';
                        const isMealSelected = tempSelection === recipeId;
                        const isCardActive = isEditing ? isMealSelected : isMealConfirmed;

                        return (
                          <div key={recipeId} className="relative">
                            <motion.div
                              onClick={() => !isLocked && handleSelect(day.key, recipe.id!)}
                              className={`relative rounded-2xl border-2 transition-all overflow-hidden bg-card ${
                                isCardActive 
                                  ? 'border-primary bg-primary/5' 
                                  : 'border-border'
                              } ${isLocked && !isMealConfirmed ? 'opacity-40' : ''}`}
                            >
                              <div className="h-[160px] w-full relative">
                                {recipe.imageUrl ? (
                                  <img src={getOptimizedUrl(recipe.imageUrl, 600)} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-secondary flex items-center justify-center text-muted-foreground">
                                    <UtensilsCrossed size={32} />
                                  </div>
                                )}
                                <div className="absolute top-2.5 right-2.5 z-20">
                                  <HeartButton recipeId={recipe.id!} size={32} />
                                </div>
                                {isMealConfirmed && (
                                  <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-primary text-primary-foreground px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-lg">
                                    <Check size={12} strokeWidth={4} />
                                    MÓN ĐÃ CHỌN
                                  </div>
                                )}
                              </div>
                              <div className="p-4">
                                <h4 className="font-semibold text-foreground text-[15px] mb-1">{recipe.title}</h4>
                                <div className="flex items-center gap-1 text-primary">
                                  {[1, 2, 3, 4, 5].map(star => (
                                    <Star key={star} size={10} className={star <= (recipe.avgRating || 5) ? 'fill-primary' : 'fill-muted-foreground/20 text-muted-foreground/20'} />
                                  ))}
                                  <span className="text-[13px] font-bold ml-1">{recipe.avgRating?.toFixed(1) || '5.0'}</span>
                                  <span className="text-muted-foreground/30 mx-1">·</span>
                                  <div className="flex items-center gap-1 text-destructive">
                                    <Heart size={12} fill="currentColor" />
                                    <span className="text-[13px] font-bold">{recipe.favoriteCount || 0}</span>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Action Row for Mobile Pending Order */}
                    {order && order.status === 'pending' && !isEditing && (
                      <div className="flex items-center justify-center gap-3 pt-3">
                        {slotRecipes.length > 1 && (
                          <>
                            <button 
                              onClick={() => setTempSelections(prev => ({ ...prev, [day.key]: order.recipeId }))}
                              className="text-[13px] font-medium text-primary bg-none border-none p-0 cursor-pointer"
                            >
                              Thay đổi món
                            </button>
                            <span className="text-[13px] text-muted-foreground/30">·</span>
                          </>
                        )}
                        <button 
                          onClick={() => handleCancel(day.key)}
                          className="text-[13px] font-medium text-destructive bg-none border-none p-0 cursor-pointer"
                        >
                          Huỷ đặt món
                        </button>
                      </div>
                    )}

                    {/* Status Pills for Locked Status - Mobile */}
                    {isConfirmed && !isPending && (
                      <div className="flex justify-center pt-3">
                        {order.status === 'preparing' && (
                          <div className="bg-primary/10 text-primary px-4 py-1.5 rounded-full text-[13px] font-medium border border-primary/20 flex items-center gap-2">
                             <Loader2 size={12} className="animate-spin" />
                             Đang nấu... 🥘
                          </div>
                        )}
                        {order.status === 'ready' && (
                          <div className="bg-green-50 text-green-600 px-4 py-1.5 rounded-full text-[13px] font-bold border border-green-100 animate-bounce flex items-center gap-2">
                            <Check size={14} strokeWidth={3} />
                            Sẵn sàng! 🍱
                          </div>
                        )}
                        {order.status === 'done' && (
                          <div className="bg-secondary text-muted-foreground px-4 py-1.5 rounded-full text-[13px] font-medium border border-border">
                            Hoàn thành ✓
                          </div>
                        )}
                      </div>
                    )}

                    <AnimatePresence>
                      {hasChanges && (
                        <motion.button 
                          initial={{ y: 100, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: 100, opacity: 0 }}
                          onClick={() => handleConfirm(day.key)}
                          disabled={submitting[day.key]}
                          className="fixed bottom-[86px] left-4 right-4 h-[52px] bg-primary text-primary-foreground font-semibold rounded-[14px] shadow-xl z-40 flex items-center justify-center gap-2 text-[15px]"
                        >
                          {submitting[day.key] ? <Loader2 size={20} className="animate-spin" /> : <span>Xác nhận đặt món ✓</span>}
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })()}
            </div>

            {/* Desktop View - Existing Grid */}
            <div 
              className="hidden md:grid grid-cols-1 md:grid-cols-5 gap-6 items-start"
              style={{ 
                gridTemplateColumns: activeDays.length > 0 && window.innerWidth > 768 
                  ? `repeat(${activeDays.length}, minmax(0, 1fr))` 
                  : undefined 
              }}
            >
              {activeDays.map((day) => {
              const idx = ALL_DAYS.findIndex(d => d.key === day.key);
              const dayDate = addDays(currentWeekStart, idx);
              const isPast = isBefore(dayDate, startOfDay(new Date()));
              const isToday = isSameDay(dayDate, new Date());
              const isDateLocked = isPast || isToday;

              const slotRecipes = weeklyMenu.slots[day.key as keyof WeeklyMenu['slots']] || [];
              const order = orders[day.key];
              const tempSelection = tempSelections[day.key];
              const isConfirmed = order && order.status !== 'cancelled';
              const isPending = order?.status === 'pending';
              const isLocked = (isConfirmed && !isPending) || isDateLocked;
              const isEditing = !!tempSelection;
              const hasChanges = isEditing && (tempSelection !== order?.recipeId || order?.status === 'cancelled');

              return (
                <div key={day.key} className={`flex flex-col gap-3 ${isDateLocked ? 'opacity-60' : ''}`}>
                  <div className="px-4 py-2 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-xs font-black uppercase tracking-[0.2em] ${isDateLocked ? 'text-muted-foreground/30' : 'text-muted-foreground'}`}>
                        {day.label}
                      </h3>
                      {isToday && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </div>
                    
                    <div className="flex flex-col gap-1">
                      {order && (
                        <>
                          <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full border shadow-sm self-start ${statusColors[order.status]} ${order.status === 'cancelled' ? 'line-through' : 'border-border'}`}>
                            {statusIcons[order.status]}
                            <span className="text-[9px] font-black uppercase tracking-wider">{statusLabels[order.status]}</span>
                          </div>
                          {isConfirmed && !isPending && (
                            <span className={`text-[10px] font-medium text-muted-foreground px-1 ${order.status === 'done' || order.status === 'cancelled' ? 'sr-only' : ''}`}>
                              {lockMessages[order.status]}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {slotRecipes.length > 0 ? (
                      slotRecipes.map(recipeId => {
                        const recipe = recipes[recipeId];
                        if (!recipe) return null;
                        
                        const isMealConfirmed = order?.recipeId === recipeId && order.status !== 'cancelled';
                        const isMealSelected = tempSelection === recipeId;
                        const showCheckmark = !isEditing && isMealConfirmed;
                        const isDimmed = isLocked && !isMealConfirmed;

                        return (
                          <MealCard
                            key={recipeId}
                            recipe={recipe}
                            isLocked={isLocked}
                            handleSelect={handleSelect}
                            dayKey={day.key}
                            isEditing={isEditing}
                            isMealSelected={isMealSelected}
                            isMealConfirmed={isMealConfirmed}
                            showCheckmark={showCheckmark}
                            isDimmed={isDimmed}
                            onInfoClick={setSelectedRecipe}
                          />
                        );
                      })
                    ) : (
                      <div className="h-[100px] rounded-2xl border-2 border-dashed border-border bg-secondary flex flex-col items-center justify-center p-4 text-center">
                        <UtensilsCrossed size={20} className="text-muted-foreground/30 mb-1" />
                        <p className="text-[11px] font-bold text-muted-foreground/50 uppercase tracking-widest">Chưa có món</p>
                      </div>
                    )}

                    <div className="mt-1">
                      <AnimatePresence>
                        {hasChanges && (
                          <motion.button 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            onClick={() => handleConfirm(day.key)}
                            disabled={submitting[day.key]}
                            className="w-full py-3.5 bg-primary hover:opacity-90 text-primary-foreground font-black rounded-xl shadow-lg shadow-primary-shadow/30 transition-all flex items-center justify-center gap-2"
                          >
                            {submitting[day.key] ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            <span className="text-[11px] uppercase tracking-[0.1em]">Xác nhận đặt món</span>
                          </motion.button>
                        )}
                      </AnimatePresence>

                      {order && order.status === 'pending' && !isEditing && (
                        <div className={`flex items-center py-1 px-1 ${slotRecipes.length > 1 ? 'justify-between' : 'justify-center'}`}>
                          {slotRecipes.length > 1 && (
                            <>
                              <button 
                                onClick={() => setTempSelections(prev => ({ ...prev, [day.key]: order.recipeId }))}
                                className="text-[11px] font-bold text-primary hover:underline uppercase tracking-wider"
                              >
                                Thay đổi món
                              </button>
                              <button 
                                onClick={() => handleCancel(day.key)}
                                className="text-[11px] font-bold text-destructive hover:underline uppercase tracking-wider"
                              >
                                Huỷ đặt món
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  </div>

      <RecipeModal 
        recipe={selectedRecipe} 
        onClose={() => setSelectedRecipe(null)} 
      />

      <ConfirmModal
        isOpen={cancelModal.isOpen}
        onClose={() => setCancelModal({ isOpen: false, day: null })}
        onConfirm={executeCancel}
        icon="🗑️"
        title="Huỷ đặt món?"
        message={
          cancelModal.day 
            ? `Bé có chắc muốn huỷ món "${recipes[orders[cancelModal.day]?.recipeId]?.title}" ngày ${ALL_DAYS.find(d => d.key === cancelModal.day)?.label} không?`
            : "Bé có chắc muốn huỷ món này không?"
        }
        confirmText="Huỷ đặt món"
        cancelText="Giữ lại món này"
        confirmStyle="danger"
      />
    </div>
  );
}
