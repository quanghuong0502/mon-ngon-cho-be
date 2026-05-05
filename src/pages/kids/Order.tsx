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
  documentId,
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
  UtensilsCrossed,
  Trash2,
  Lock,
  Utensils
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
  preparing: "Đang làm, không thể thay đổi",
  ready: "Sẵn sàng rồi, qua lấy nhé!",
  done: "Hoàn thành"
};

const statusColors: Record<string, string> = {
  pending: 'text-muted-foreground bg-secondary',
  preparing: 'text-primary bg-primary/10',
  ready: 'text-green-600 bg-green-50',
  done: 'text-muted-foreground bg-secondary',
  cancelled: 'text-muted-foreground bg-secondary border-border opacity-60'
};

const MealCard = memo(({ 
  recipe, 
  isVisualLocked,
  isSelectionDisabled,
  handleSelect, 
  dayKey, 
  isEditing, 
  isMealSelected, 
  isMealConfirmed, 
  showCheckmark,
  isDimmed,
  onInfoClick,
  variant = 'desktop'
}: {
  recipe: Recipe;
  isVisualLocked: boolean;
  isSelectionDisabled: boolean;
  handleSelect: (day: string, recipeId: string) => void;
  dayKey: string;
  isEditing: boolean;
  isMealSelected: boolean;
  isMealConfirmed: boolean;
  showCheckmark: boolean;
  isDimmed: boolean;
  onInfoClick: (recipe: Recipe) => void;
  variant?: 'desktop' | 'mobile';
}) => {
  const isActive = isEditing ? isMealSelected : isMealConfirmed;

  if (variant === 'mobile') {
    return (
      <div className="relative">
        <motion.div
          onClick={() => !isSelectionDisabled && handleSelect(dayKey, recipe.id!)}
          className={`relative rounded-2xl border-2 transition-all overflow-hidden bg-card ${
            isActive 
              ? 'border-primary bg-primary/5' 
              : 'border-border'
          } ${isSelectionDisabled && !isActive ? 'opacity-40 grayscale cursor-not-allowed' : 'opacity-100 cursor-pointer'}`}
        >
          <div className="h-[160px] w-full relative">
            {recipe.imageUrl ? (
              <img src={getOptimizedUrl(recipe.imageUrl, 600)} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-secondary flex items-center justify-center text-muted-foreground">
                <UtensilsCrossed size={32} />
              </div>
            )}
            
            {/* Lock Overlay */}
            {isVisualLocked && (
              <div className="absolute inset-0 bg-background/20 backdrop-blur-[0.5px] flex flex-col items-center justify-center z-30">
                <div className="bg-background/90 p-2 rounded-full shadow-lg mb-2">
                  <Lock size={20} className="text-muted-foreground" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-background/90 px-2 py-0.5 rounded">Khóa</span>
              </div>
            )}
            <div className="absolute top-2.5 right-2.5 z-20">
              <HeartButton recipeId={recipe.id!} size={32} />
            </div>
            {isMealConfirmed && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-primary text-primary-foreground px-2.5 py-1.5 rounded-xl text-[10px] font-black shadow-xl shadow-primary-shadow/60 z-40">
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
  }

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={!isSelectionDisabled ? { y: -2 } : {}}
      onClick={() => !isSelectionDisabled && handleSelect(dayKey, recipe.id!)}
      className={`relative group rounded-2xl border-2 transition-all overflow-hidden ${
        isActive 
          ? 'bg-primary/5 border-primary shadow-lg shadow-primary-shadow/50' 
          : 'bg-card border-border shadow-sm hover:border-primary/50'
      } ${isSelectionDisabled && !isActive ? 'opacity-40 grayscale cursor-not-allowed' : 'opacity-100 cursor-pointer'}`}
    >
      <div className="h-[120px] w-full bg-secondary relative group-hover:brightness-95 transition-all">
        {recipe.imageUrl ? (
          <img src={getOptimizedUrl(recipe.imageUrl, 400)} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <UtensilsCrossed size={32} />
          </div>
        )}

        {/* Lock Overlay for Desktop */}
        {isVisualLocked && (
          <div className="absolute inset-0 bg-background/20 backdrop-blur-[0.5px] flex flex-col items-center justify-center z-30">
             <div className="bg-background/90 p-1.5 rounded-full shadow-lg mb-1">
                <Lock size={16} className="text-muted-foreground" />
             </div>
             <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground bg-background/90 px-1.5 py-0.5 rounded">Hết giờ</span>
          </div>
        )}
        
        <div className="absolute top-2 right-2 z-20">
          <HeartButton recipeId={recipe.id!} size={28} />
        </div>
        
        {isActive && (
          <div className="absolute top-2 left-2 z-40">
            <div className="bg-primary text-primary-foreground px-2 py-0.5 rounded-md text-[8px] font-black uppercase flex items-center gap-1 shadow-lg shadow-primary-shadow/50">
              <Check size={8} strokeWidth={4} />
              <span>Món đã chọn</span>
            </div>
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
  const [tempSelections, setTempSelections] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [servingDays, setServingDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [kitchenConfig, setKitchenConfig] = useState<any>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const hasInitializedTab = React.useRef(false);
  const [cancelModal, setCancelModal] = useState<{ 
    isOpen: boolean; 
    day: string | null;
    reason: string;
  }>({
    isOpen: false,
    day: null,
    reason: ''
  });

  // Auto-scroll to top when order IDs change (after save)
  useEffect(() => {
    if (Object.keys(orders).length > 0 && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [JSON.stringify(Object.values(orders).map((o: Order) => o.recipeIds?.join(',')))]);

  // Auto-scroll to top when day changes
  useEffect(() => {
    if (scrollContainerRef.current && hasInitializedTab.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedDay]);

  const activeDays = ALL_DAYS.filter(d => servingDays.includes(d.key));

  // Thêm state để trigger re-render mỗi phút, giúp bộ đếm giờ khóa luôn chính xác
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000); // Cập nhật mỗi phút
    return () => clearInterval(timer);
  }, []);

  const getDayLockStatus = (dayKey: string) => {
    const idx = ALL_DAYS.findIndex(d => d.key === dayKey);
    const dayDate = addDays(currentWeekStart, idx);
    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);
    
    const isPastOrToday = isBefore(dayDate, tomorrow); // Bao gồm cả hôm nay và quá khứ
    const isToday = isSameDay(dayDate, today);
    const isTomorrow = isSameDay(dayDate, tomorrow);
    const isFuture = isBefore(tomorrow, dayDate);

    let isTimeLocked = false;
    let windowInfo = null;

    if (isPastOrToday) {
      isTimeLocked = true;
    } else if (isTomorrow && kitchenConfig) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      
      const startTime = kitchenConfig.orderStartTime || '07:00';
      const endTime = kitchenConfig.orderEndTime || '17:00';

      const [startH, startM] = startTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      
      const [endH, endM] = endTime.split(':').map(Number);
      const endMinutes = endH * 60 + endM;

      if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
        isTimeLocked = true;
      }
      windowInfo = { start: startTime, end: endTime };
    }
    // Nếu là isFuture (từ ngày kia trở đi) thì isTimeLocked luôn là false

    return {
      isPast: isBefore(dayDate, today),
      isToday,
      isTomorrow,
      isDateLocked: isTimeLocked,
      windowInfo
    };
  };

  useEffect(() => {
    const docRef = doc(db, 'config', 'main');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setKitchenConfig(data);
        if (data.servingDays && Array.isArray(data.servingDays)) {
          setServingDays(data.servingDays);
        }
      }
      setConfigLoading(false);
    }, (err) => {
      console.error('Error listening to kitchen config:', err);
      setConfigLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (servingDays.length > 0 && !hasInitializedTab.current && !configLoading) {
      const getDefaultTab = () => {
        const today = startOfDay(new Date());
        // Map 0 (Sun) to index 6, 1-6 to 0-5
        const dayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1;
        const todayKey = ALL_DAYS[dayIdx].key;
        
        // If today is a serving day and NOT locked, default to today
        if (servingDays.includes(todayKey)) {
          const { isDateLocked: isTodayLocked } = getDayLockStatus(todayKey);
          if (!isTodayLocked) return todayKey;
        }

        // Otherwise find tomorrow or next available serving day
        const tomorrow = addDays(today, 1);
        const tomorrowDayIdx = tomorrow.getDay() === 0 ? 6 : tomorrow.getDay() - 1;
        const tomorrowKey = ALL_DAYS[tomorrowDayIdx].key;
        
        const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const startIndex = dayOrder.indexOf(tomorrowKey);
        
        // Cycle through 7 days starting from tomorrow
        for (let i = 0; i < 7; i++) {
          const checkIdx = (startIndex + i) % 7;
          const checkKey = dayOrder[checkIdx];
          if (servingDays.includes(checkKey)) return checkKey;
        }
        
        return servingDays[0];
      };

      setSelectedDay(getDefaultTab());
      hasInitializedTab.current = true;
    }
  }, [servingDays, configLoading, currentWeekStart]);

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

    let unsubscribeRecipes: (() => void) | null = null;

    const fetchMenuAndRecipes = async () => {
      try {
        const menuRef = doc(db, 'weeklyMenu', weekId);
        const menuSnap = await getDoc(menuRef);
        
        if (menuSnap.exists()) {
          const menuData = menuSnap.data() as WeeklyMenu;
          setWeeklyMenu(menuData);

          const allIds = Array.from(new Set(Object.values(menuData.slots).flat())).filter(Boolean) as string[];
          
          if (allIds.length > 0) {
            const recipesQuery = query(collection(db, 'recipes'), where(documentId(), 'in', allIds));
            unsubscribeRecipes = onSnapshot(recipesQuery, (snap) => {
              const recipeMap: Record<string, Recipe> = {};
              snap.docs.forEach(d => {
                recipeMap[d.id] = { id: d.id, ...d.data() } as Recipe;
              });
              setRecipes(recipeMap);
            }, (err) => handleFirestoreError(err, OperationType.LIST, 'recipes'));
          } else {
            setRecipes({});
          }
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
    return () => {
      unsubscribeOrders();
      if (unsubscribeRecipes) unsubscribeRecipes();
    };
  }, [user, weekId]);

  const handleSelect = (day: string, recipeId: string) => {
    // Luôn kiểm tra khóa thời gian trước khi cho phép chọn món
    const { isDateLocked } = getDayLockStatus(day);
    if (isDateLocked) {
      toast.error('Hiện tại đã hết giờ đặt/thay đổi món cho ngày này.', { id: 'lock-error' });
      return;
    }

    const order = orders[day];
    const isEditing = !!tempSelections[day];

    // Only block selection if there's an active non-cancelled order and we aren't in editing mode
    if (order && order.status !== 'cancelled' && !isEditing) {
      return;
    }

    const isActuallyEditingExisting = order && order.status !== 'cancelled';
    const current = tempSelections[day] || (isActuallyEditingExisting ? order?.recipeIds || (order?.recipeId ? [order.recipeId] : []) : []);

    if (current.includes(recipeId)) {
      const next = current.filter(id => id !== recipeId);
      
      // Nếu đang sửa đơn hàng cũ, không cho phép bỏ chọn toàn bộ
      if (isActuallyEditingExisting && next.length === 0) {
        toast.error('Bé phải chọn ít nhất 1 món nhé!', { id: 'min-meal-error' });
        return;
      }

      // If it's a new order and they unselect everything, clear temp selection
      if (!isActuallyEditingExisting && next.length === 0) {
        setTempSelections(prev => {
          const nextPrev = { ...prev };
          delete nextPrev[day];
          return nextPrev;
        });
        return;
      }

      setTempSelections(prev => ({ ...prev, [day]: next }));
    } else {
      setTempSelections(prev => ({ ...prev, [day]: [...current, recipeId] }));
    }
  };

  const handleCancelEditing = (day: string) => {
    setTempSelections(prev => {
      const next = { ...prev };
      delete next[day];
      return next;
    });
  };

  const handleConfirm = async (day: string) => {
    const { isDateLocked } = getDayLockStatus(day);
    if (isDateLocked) {
      toast.error('Hiện tại ngoài thời gian đặt món!', { id: 'lock-error' });
      return;
    }

    const recipeIds = tempSelections[day];
    if (!user || !recipeIds || recipeIds.length === 0) return;

    setSubmitting(prev => ({ ...prev, [day]: true }));
    const loadingToast = toast.loading('Đang gửi...');
    
    try {
      const order = orders[day];
      const now = Timestamp.now();

      if (order && order.status === 'pending') {
        const newItemAddedAt = { ...(order.itemAddedAt || {}) };
        recipeIds.forEach(id => {
          if (!newItemAddedAt[id]) {
            newItemAddedAt[id] = now;
          }
        });
        
        // Remove timestamps for items that were removed
        Object.keys(newItemAddedAt).forEach(id => {
          if (!recipeIds.includes(id)) {
            delete newItemAddedAt[id];
          }
        });

        await updateDoc(doc(db, 'orders', order.id!), {
          recipeIds,
          recipeId: recipeIds[0], // Keep for backward compatibility
          status: 'pending',
          updatedAt: now,
          itemAddedAt: newItemAddedAt
        });
        toast.success(`Đã cập nhật món cho ${ALL_DAYS.find(d => d.key === day)?.label}!`, { id: loadingToast });
      } else {
        const initialItemAddedAt: Record<string, any> = {};
        recipeIds.forEach(id => {
          initialItemAddedAt[id] = now;
        });

        const orderData: Omit<Order, 'id'> = {
          kidId: user.userId,
          weekId,
          day: day as any,
          recipeId: recipeIds[0], // Keep for backward compatibility
          recipeIds,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          itemAddedAt: initialItemAddedAt
        };
        await addDoc(collection(db, 'orders'), orderData);
        toast.success('Đặt món thành công!', { id: loadingToast });
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

  const handleCancel = async (day: string) => {
    setCancelModal({ isOpen: true, day, reason: '' });
  };

  const executeCancel = async () => {
    const day = cancelModal.day;
    if (!day) return;

    if (!cancelModal.reason.trim()) {
      toast.error('Bé hãy cho bếp biết lý do bé muốn huỷ món nhé!');
      return;
    }
    
    const { isDateLocked } = getDayLockStatus(day);
    if (isDateLocked) {
      toast.error('Ngoài thời gian huỷ món!');
      setCancelModal({ isOpen: false, day: null, reason: '' });
      return;
    }

    const order = orders[day];
    if (!order || order.status !== 'pending') return;

    const dayLabel = ALL_DAYS.find(d => d.key === day)?.label;

    const loadingToast = toast.loading('Đang huỷ...');
    try {
      await updateDoc(doc(db, 'orders', order.id!), {
        status: 'cancelled',
        cancelReason: cancelModal.reason.trim(),
        updatedAt: Timestamp.now()
      });
      toast.success(`Đã huỷ đặt món ${dayLabel}`, { id: loadingToast });
      setCancelModal({ isOpen: false, day: null, reason: '' });
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
      <div className="flex-1 overflow-y-auto scroll-smooth" ref={scrollContainerRef}>
        <div className="max-w-7xl mx-auto">
          {/* Title + subtitle - non-sticky, scrolls */}
          <div className="px-4 md:px-6 pt-4 pb-2">
            <h1 className="text-[18px] md:text-[20px] font-semibold text-foreground">Thực đơn hàng ngày</h1>
            <p className="text-[13px] font-normal text-muted-foreground">
              Chọn món bé muốn ăn cho từng ngày nhé!
            </p>
          </div>

          {/* Sticky Week Badge for Mobile */}
          <div className="sticky top-0 z-[100] bg-background px-2 pt-5 pb-4 md:hidden flex justify-center">
            <div className="inline-flex items-center gap-3 bg-card px-4 py-2 rounded-2xl shadow-sm border border-border">
              <span className="bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest px-4 py-1.5 rounded-full">
                TUẦN {weekId.split('-')[1]}
              </span>
              <span className="text-muted-foreground text-xs font-black tracking-tight uppercase">
                {format(currentWeekStart, 'dd/MM', { locale: vi })} – {format(addDays(currentWeekStart, activeDays.length > 0 ? ALL_DAYS.findIndex(d => d.key === activeDays[activeDays.length-1].key) : 4), 'dd/MM', { locale: vi })}
              </span>
            </div>
          </div>

          {/* Sticky Day Tab Bar for Mobile - Sticks below Week Badge */}
          <div className="sticky top-[72px] z-100 bg-background border-b border-border px-4 pt-4 pb-4 md:hidden overflow-x-auto scrollbar-hide flex justify-center gap-3 no-scrollbar">
            <style dangerouslySetInnerHTML={{ __html: `
              .no-scrollbar::-webkit-scrollbar { display: none; }
              .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
            {mobileTabs.map((tab) => {
              const { isToday, isTomorrow, isDateLocked, windowInfo } = getDayLockStatus(tab.key);
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
                  } ${isDateLocked ? 'opacity-45' : 'opacity-100'} ${isToday ? 'font-semibold underline decoration-primary/30' : ''}`}
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

                const { isToday, isTomorrow, isDateLocked, windowInfo } = getDayLockStatus(day.key);
                const slotRecipes = weeklyMenu.slots[day.key as keyof WeeklyMenu['slots']] || [];
                const order = orders[day.key];
                const orderRecipeIds = order?.recipeIds || (order?.recipeId ? [order.recipeId] : []);
                const tempSelection = tempSelections[day.key];
                const isConfirmed = order && order.status !== 'cancelled';
                const isPending = order?.status === 'pending';
                const isEditing = !!tempSelection && tempSelection.length > 0;
                
                // Visual lock only when time is passed or order is locked (non-pending)
                const isVisualLocked = isDateLocked || (isConfirmed && !isPending);
                // Selection is disabled if day is locked OR if order is confirmed and we aren't in editing mode
                const isSelectionDisabled = isVisualLocked || (isConfirmed && !isEditing);
                
                // Compare arrays
                const hasChanges = isEditing && (
                  tempSelection.length !== orderRecipeIds.length || 
                  !tempSelection.every(id => orderRecipeIds.includes(id)) || 
                  order?.status === 'cancelled'
                );

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
                    {/* Header Warning for Locked State */}
                    {isDateLocked && (
                      <div className="mx-0 p-4 rounded-2xl bg-destructive/5 border border-destructive/10 flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                          <Lock size={18} className="text-destructive" />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-sm font-bold text-destructive">Ngoài giờ đặt món</p>
                          <p className="text-[11px] text-destructive/70 leading-relaxed font-medium">Bé có thể xem lại món đã đặt nhưng không thể thay đổi.</p>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-3">
                      {[...slotRecipes]
                        .sort((a, b) => {
                          const aSelected = orderRecipeIds.includes(a);
                          const bSelected = orderRecipeIds.includes(b);
                          if (aSelected && !bSelected) return -1;
                          if (!aSelected && bSelected) return 1;
                          return 0;
                        })
                        .map(recipeId => {
                          const recipe = recipes[recipeId];
                          if (!recipe) return null;
                          
                          const isMealConfirmed = orderRecipeIds.includes(recipeId) && order?.status !== 'cancelled';
                          const isMealSelected = tempSelection?.includes(recipeId);

                          return (
                            <MealCard
                              key={recipeId}
                              recipe={recipe}
                              isVisualLocked={isVisualLocked}
                              isSelectionDisabled={isSelectionDisabled}
                              handleSelect={handleSelect}
                              dayKey={day.key}
                              isEditing={isEditing}
                              isMealSelected={isMealSelected}
                              isMealConfirmed={isMealConfirmed}
                              showCheckmark={!isEditing && isMealConfirmed}
                              isDimmed={isVisualLocked && !isMealConfirmed}
                              onInfoClick={setSelectedRecipe}
                              variant="mobile"
                            />
                          );
                        })}
                    </div>

                    {/* Action Row for Mobile Pending Order */}
                    <AnimatePresence>
                      {order && order.status === 'pending' && !isEditing && !isDateLocked && (
                        <motion.div 
                          initial={{ y: 100, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: 100, opacity: 0 }}
                          className="fixed bottom-[86px] left-4 right-4 flex flex-row gap-2 z-40"
                        >
                          <button 
                            onClick={() => setTempSelections(prev => ({ ...prev, [day.key]: orderRecipeIds }))}
                            className="flex-1 h-[52px] bg-primary text-primary-foreground font-semibold rounded-[14px] shadow-xl flex items-center justify-center gap-2 text-[15px] transition-all"
                          >
                            Thay đổi món
                          </button>
                          <button 
                            onClick={() => handleCancel(day.key)}
                            className="flex-1 h-[52px] bg-card text-destructive font-semibold rounded-[14px] shadow-lg border border-destructive/20 flex items-center justify-center text-[15px] active:scale-95 transition-all"
                          >
                            Huỷ đặt món
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Status Pills for Locked Status - Mobile */}
                    {isConfirmed && !isPending && (
                      <div className="flex justify-center pt-3">
                        {order.status === 'preparing' && (
                          <div className="bg-primary/10 text-primary px-4 py-1.5 rounded-full text-[13px] font-medium border border-primary/20 flex items-center gap-2">
                             <Loader2 size={12} className="animate-spin" />
                             Đang nấu...
                          </div>
                        )}
                        {order.status === 'ready' && (
                          <div className="bg-green-50 text-green-600 px-4 py-1.5 rounded-full text-[13px] font-black border border-green-100 animate-bounce flex items-center gap-2 shadow-sm">
                            <Utensils size={14} strokeWidth={3} />
                            Sẵn sàng!
                          </div>
                        )}
                        {order.status === 'done' && (
                          <div className="bg-secondary text-muted-foreground px-4 py-1.5 rounded-full text-[13px] font-medium border border-border flex items-center gap-2">
                            <CircleCheckBig size={14} />
                            Hoàn thành
                          </div>
                        )}
                      </div>
                    )}

                    <AnimatePresence>
                      {isEditing && (
                          <motion.div 
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            className="fixed bottom-[86px] left-4 right-4 flex flex-row gap-2 z-40"
                          >
                            <button 
                              onClick={() => handleConfirm(day.key)}
                              disabled={submitting[day.key] || !hasChanges || isDateLocked}
                              className={`flex-1 h-[52px] font-semibold rounded-[14px] shadow-xl flex items-center justify-center gap-2 text-[15px] transition-all ${
                                (hasChanges && !isDateLocked) 
                                ? 'bg-primary text-primary-foreground' 
                                : 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'
                              }`}
                            >
                              {submitting[day.key] ? <Loader2 size={20} className="animate-spin" /> : (
                                <div className="flex items-center gap-2">
                                  {order?.status === 'cancelled' || !order ? 'Đặt món' : 'Xác nhận'}
                                  <CircleCheckBig size={18} />
                                </div>
                              )}
                            </button>
                            <button 
                              onClick={() => handleCancelEditing(day.key)}
                              disabled={submitting[day.key]}
                              className="flex-1 h-[52px] bg-card text-foreground font-semibold rounded-[14px] shadow-lg border border-border flex items-center justify-center text-[15px] active:scale-95 transition-all"
                            >
                              Hủy bỏ
                            </button>
                          </motion.div>
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
              const { isToday, isTomorrow, isDateLocked, windowInfo } = getDayLockStatus(day.key);

              const slotRecipes = weeklyMenu.slots[day.key as keyof WeeklyMenu['slots']] || [];
              const order = orders[day.key];
              const orderRecipeIds = order?.recipeIds || (order?.recipeId ? [order.recipeId] : []);
              const tempSelection = tempSelections[day.key];
              const isConfirmed = order && order.status !== 'cancelled';
              const isPending = order?.status === 'pending';
              const isEditing = !!tempSelection && tempSelection.length > 0;
              
              // Visual lock only when time is passed or order is locked (non-pending)
              const isVisualLocked = isDateLocked || (isConfirmed && !isPending);
              // Selection is disabled if day is locked OR if order is confirmed and we aren't in editing mode
              const isSelectionDisabled = isVisualLocked || (isConfirmed && !isEditing);
              
              const hasChanges = isEditing && (
                tempSelection.length !== orderRecipeIds.length || 
                !tempSelection.every(id => orderRecipeIds.includes(id)) || 
                order?.status === 'cancelled'
              );

              return (
                <div key={day.key} className={`flex flex-col gap-3 ${isDateLocked ? 'opacity-100' : ''}`}>
                  <div className="px-4 py-2 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                       <h3 className={`text-xs font-black uppercase tracking-[0.2em] ${isDateLocked ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {day.label}
                      </h3>
                      {isToday && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </div>
                    
                    {/* Locked Message Header Desktop */}
                    {isDateLocked && (
                      <div className="mb-1 p-2 rounded-xl bg-destructive/5 border border-destructive/10 flex items-center gap-2">
                        <Lock size={12} className="text-destructive" />
                        <span className="text-[10px] font-bold text-destructive uppercase tracking-wider">Hết giờ</span>
                      </div>
                    )}

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
                          {isTomorrow && isDateLocked && !isConfirmed && (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-destructive/5 text-destructive rounded-lg border border-destructive/10">
                              <Info size={10} />
                              <span className="text-[10px] font-medium">
                                Đã hết giờ đặt cho ngày mai ({windowInfo?.start} - {windowInfo?.end})
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {slotRecipes.length > 0 ? (
                      [...slotRecipes]
                        .sort((a, b) => {
                          const aSelected = orderRecipeIds.includes(a);
                          const bSelected = orderRecipeIds.includes(b);
                          if (aSelected && !bSelected) return -1;
                          if (!aSelected && bSelected) return 1;
                          return 0;
                        })
                        .map(recipeId => {
                          const recipe = recipes[recipeId];
                          if (!recipe) return null;
                          
                          const isMealConfirmed = orderRecipeIds.includes(recipeId) && order?.status !== 'cancelled';
                          const isMealSelected = tempSelection?.includes(recipeId);
                          const showCheckmark = !isEditing && isMealConfirmed;
                          const isDimmed = isVisualLocked && !isMealConfirmed;

                          return (
                            <MealCard
                              key={recipeId}
                              recipe={recipe}
                              isVisualLocked={isVisualLocked}
                              isSelectionDisabled={isSelectionDisabled}
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
                        {isEditing && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex flex-row gap-2 mb-3"
                          >
                            <button 
                              onClick={() => handleConfirm(day.key)}
                              disabled={submitting[day.key] || !hasChanges || isDateLocked}
                              className={`flex-1 py-3 bg-primary hover:opacity-90 text-primary-foreground font-bold rounded-xl shadow-lg shadow-primary-shadow/30 transition-all flex items-center justify-center gap-1.5 ${(!hasChanges || isDateLocked) && 'opacity-50 cursor-not-allowed'}`}
                            >
                              {submitting[day.key] ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                              <span className="text-[10px] uppercase tracking-wider">Xác nhận</span>
                            </button>
                            <button 
                              onClick={() => handleCancelEditing(day.key)}
                              disabled={submitting[day.key]}
                              className="flex-1 py-3 bg-card hover:bg-secondary text-foreground border border-border font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider"
                            >
                              Hủy bỏ
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {order && order.status === 'pending' && !isEditing && !isDateLocked && (
                        <div className="flex flex-row gap-2 pt-4">
                          <button 
                            onClick={() => setTempSelections(prev => ({ ...prev, [day.key]: orderRecipeIds }))}
                            className="flex-1 h-11 bg-primary text-primary-foreground font-bold rounded-xl shadow-md transition-all flex items-center justify-center text-[11px] uppercase tracking-wider"
                          >
                            Thay đổi món
                          </button>
                          <button 
                            onClick={() => handleCancel(day.key)}
                            className="flex-1 h-11 bg-card text-destructive border border-destructive/20 font-bold rounded-xl transition-all flex items-center justify-center text-[11px] uppercase tracking-wider"
                          >
                            Huỷ đặt món
                          </button>
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
        onClose={() => setCancelModal({ isOpen: false, day: null, reason: '' })}
        onConfirm={executeCancel}
        icon={<Trash2 size={24} className="text-destructive" />}
        title="Huỷ đặt món?"
        confirmText="Huỷ đặt món"
        cancelText="Giữ lại món này"
        confirmStyle="primary"
        confirmDisabled={!cancelModal.reason.trim()}
      >
        <div className="w-full space-y-2">
          <label className="block mb-3 text-[13px] font-bold text-muted-foreground tracking-wider ml-1">Lý do bé huỷ món là gì? * </label>
          <textarea
            value={cancelModal.reason}
            onChange={(e) => setCancelModal(prev => ({ ...prev, reason: e.target.value }))}
            placeholder="Ví dụ: Bé muốn đổi sang món khác, Bé không ăn trưa tại trường..."
            className="w-full min-h-[80px] p-4 bg-secondary border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
          />
        </div>
      </ConfirmModal>
    </div>
  );
}
