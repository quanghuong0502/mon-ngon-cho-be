/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  onSnapshot,
  orderBy,
  updateDoc,
  doc,
  getDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Order, OrderStatus, Recipe, Review, User } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import Avatar from '../../components/Avatar';
import { 
  Search, 
  Filter, 
  Clock, 
  CheckCircle2, 
  ChefHat, 
  Package, 
  ClipboardCheck,
  ChevronDown,
  Loader2,
  Utensils,
  Star,
  User as UserIcon,
  ArrowLeft,
  Navigation,
  MapPin,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { getOptimizedUrl } from '../../lib/cloudinary';
import { sendPushToUser } from '../../lib/oneSignal';

const STATUS_CONFIG: Record<OrderStatus, { label: string, color: string, icon: any, next?: OrderStatus, buttonLabel?: string }> = {
  pending: { 
    label: 'Đang chờ', 
    color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800', 
    icon: Clock,
    next: 'preparing',
    buttonLabel: 'Bắt đầu làm'
  },
  preparing: { 
    label: 'Đang làm', 
    color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800', 
    icon: ChefHat,
    next: 'ready',
    buttonLabel: 'Món đã xong'
  },
  ready: { 
    label: 'Sẵn sàng', 
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800', 
    icon: Package
  },
  on_the_way: { 
    label: 'Đang giao', 
    color: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800', 
    icon: Navigation
  },
  arrived: { 
    label: 'Đã tới', 
    color: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800', 
    icon: MapPin,
    next: 'done',
    buttonLabel: 'Xác nhận đã giao món'
  },
  done: { 
    label: 'Hoàn thành', 
    color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', 
    icon: ClipboardCheck 
  },
  cancelled: { 
    label: 'Đã huỷ', 
    color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800', 
    icon: Trash2 
  }
};

export default function OrderManager() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [kidProfiles, setKidProfiles] = useState<Record<string, User>>({});

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const loadedOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setOrders(loadedOrders);

      // Fetch recipes and kid profiles for these orders
      const recipeIds = Array.from(new Set(loadedOrders.map(o => o.recipeId))).filter(Boolean) as string[];
      const kidIds = Array.from(new Set(loadedOrders.map(o => o.kidId))).filter(Boolean) as string[];
      
      const recipeMap: Record<string, Recipe> = { ...recipes };
      const kidMap: Record<string, User> = { ...kidProfiles };
      
      await Promise.all([
        ...recipeIds.map(async (id) => {
          if (!recipeMap[id]) {
            const rDoc = await getDoc(doc(db, 'recipes', id));
            if (rDoc.exists()) recipeMap[id] = { id: rDoc.id, ...rDoc.data() } as Recipe;
          }
        }),
        ...kidIds.map(async (id) => {
          if (!kidMap[id]) {
            const uDoc = await getDoc(doc(db, 'users', id));
            if (uDoc.exists()) kidMap[id] = { id: uDoc.id, ...uDoc.data() } as User;
          }
        })
      ]);
      
      setRecipes(recipeMap);
      setKidProfiles(kidMap);
      setLoading(false);
    });

    // Fetch reviews for visibility
    const reviewsQ = query(collection(db, 'reviews'));
    const unsubscribeReviews = onSnapshot(reviewsQ, (snap) => {
      const reviewMap: Record<string, Review> = {};
      snap.docs.forEach(doc => {
        const data = doc.data() as Review;
        if (data.orderId) reviewMap[data.orderId] = { id: doc.id, ...data };
      });
      setReviews(reviewMap);
    });

    return () => {
      unsubscribe();
      unsubscribeReviews();
    };
  }, []);

  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    console.log(`Updating order ${orderId} to status ${newStatus}`);
    try {
      const order = orders.find(o => o.id === orderId);
      await updateDoc(doc(db, 'orders', orderId), {
        status: newStatus,
        updatedAt: Timestamp.now()
      });

      if (order) {
        const kidDoc = await getDoc(doc(db, 'users', order.kidId));
        const userData = kidDoc.data();
        const oneSignalIds = userData?.oneSignalIds || (userData?.oneSignalId ? [userData.oneSignalId] : []);
        console.log(`Found kid ${order.kidId} with OneSignal IDs:`, oneSignalIds);
        
        if (oneSignalIds.length > 0) {
          const recipe = recipes[order.recipeId];
          const recipeName = recipe?.title || 'món ăn';
          const displayRecipeName = recipeName.length > 30 ? recipeName.substring(0, 27) + '...' : recipeName;

          const messages: Record<string, { title: string; body: string }> = {
            preparing: {
              title: 'Đầu bếp đang nấu!',
              body: `Món ${displayRecipeName} đang được chuẩn bị... Bé đợi xíu nhoa!`
            },
            ready: {
              title: 'Món ăn sẵn sàng rồi!',
              body: `Món ${displayRecipeName} đã xong. Bé qua bếp lấy nhoa!`
            },
            done: {
              title: 'Bé đã nhận món!',
              body: 'Bé giỏi quớ, đã hoàn thành bữa ăn hôm nay!'
            }
          };

          const msg = messages[newStatus];
          if (msg) {
            console.log(`Sending push to ${oneSignalIds.length} devices: ${msg.title}`);
            await sendPushToUser(oneSignalIds, msg.title, msg.body, '/kids/my-orders');
          } else {
            console.log(`No message template for status: ${newStatus}`);
          }
        } else {
          console.warn('Kid has no OneSignal IDs registered.');
        }
      }
    } catch (err) {
      console.error('Error in updateStatus:', err);
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesFilter = filter === 'all' || o.status === filter;
    const recipe = recipes[o.recipeId];
    const kid = kidProfiles[o.kidId];
    const matchesSearch = (kid?.name || o.kidId).toLowerCase().includes(searchTerm.toLowerCase()) || 
                          recipe?.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          o.id?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Group by date (today/tomorrow or week)
  const groupedOrders = filteredOrders.reduce((acc: Record<string, Order[]>, order) => {
    const date = order.createdAt ? format(order.createdAt.toDate(), 'dd/MM/yyyy') : 'Unscheduled';
    if (!acc[date]) acc[date] = [];
    acc[date].push(order);
    return acc;
  }, {});

  if (loading) return <div className="p-24 flex justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>;

  return (
    <div className="chef-page-content h-full overflow-y-auto scrollbar-hide">
      <div className="space-y-4 bg-background pb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-[2px]">
            <h1 className="text-[18px] md:text-[20px] font-semibold text-foreground">Quản lý Đơn hàng</h1>
            <p className="text-[12px] md:text-[13px] font-normal text-muted-foreground">Theo dõi và cập nhật trạng thái suất ăn theo ngày</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-card p-1 rounded-xl border border-border flex gap-0.5 flex-wrap">
              {(['all', 'pending', 'preparing', 'ready', 'on_the_way', 'arrived', 'done', 'cancelled'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-all ${
                    filter === s ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s === 'all' ? 'Tất cả' : STATUS_CONFIG[s as OrderStatus].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input 
            type="text" 
            placeholder="Tìm bé, món hoặc mã đơn..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 md:py-4 bg-card border border-border rounded-xl md:rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium text-[13px] md:text-base text-foreground"
          />
        </div>
      </div>

      <div className="mt-8 space-y-12">
        {(Object.entries(groupedOrders) as [string, Order[]][]).map(([date, dateOrders]) => (
          <section key={date}>
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-lg font-bold text-foreground tracking-tight">{date}</h2>
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{dateOrders.length} đơn</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
              <AnimatePresence>
                {dateOrders.map(order => (
                  <OrderCard 
                    key={order.id!} 
                    order={order} 
                    recipe={recipes[order.recipeId]} 
                    onUpdate={updateStatus} 
                    review={reviews[order.id!]}
                    kid={kidProfiles[order.kidId]}
                  />
                ))}
              </AnimatePresence>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

interface OrderCardProps {
  key?: string;
  order: Order;
  recipe?: Recipe;
  review?: Review;
  kid?: User;
  onUpdate: (id: string, s: OrderStatus) => Promise<void>;
}

function OrderCard({ order, recipe, review, kid, onUpdate }: OrderCardProps) {
  const config = STATUS_CONFIG[order.status];
  const Icon = config.icon;
  const dayLabel = { mon: 'T2', tue: 'T3', wed: 'T4', thu: 'T5', fri: 'T6', sat: 'T7', sun: 'CN' }[order.day];
  const [showFullComment, setShowFullComment] = useState(false);

    const kidName = kid?.name ? `Bé ${kid.name}` : `Bé ${order.kidId}`;
  
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-card rounded-[32px] border border-border shadow-sm overflow-hidden flex flex-col hover:shadow-xl transition-all"
      >
        <div className="p-4 md:p-6 border-b border-border/50 flex justify-between items-start">
          <div className="flex gap-3 md:gap-4">
            <Avatar 
              src={kid?.avatar} 
              name={kid?.name || order.kidId} 
              size={40} 
              className="rounded-xl md:rounded-2xl border-2 border-border"
            />
            <div className="min-w-0">
              <p className="text-[9px] md:text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5 md:mb-1">Đơn hàng #{order.id?.slice(-6)}</p>
              <h3 className="text-base md:text-lg font-black text-foreground tracking-tight truncate">{kidName}</h3>
            </div>
          </div>
        <div className={`px-2.5 md:px-4 py-1 md:py-1.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 md:gap-2 border shrink-0 ${config.color}`}>
          <Icon size={10} strokeWidth={3} className="md:w-3 md:h-3" />
          {config.label}
        </div>
      </div>

      <div className="p-4 md:p-6 bg-secondary/30 flex flex-col gap-3 md:gap-4">
        <div className="flex gap-3 md:gap-4">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl overflow-hidden bg-background shadow-sm flex-shrink-0">
            {recipe?.imageUrl ? (
              <img src={getOptimizedUrl(recipe.imageUrl, 200)} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground/30"><Utensils size={20} /></div>
            )}
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <h4 className="font-bold text-foreground text-xs md:text-sm line-clamp-1 mb-0.5 md:mb-1 leading-tight">{recipe?.title || 'Đang tải...'}</h4>
            <p className="text-[9px] md:text-[10px] text-muted-foreground font-medium tracking-tight">Cập nhật: {order.updatedAt ? format(order.updatedAt.toDate(), 'HH:mm', { locale: vi }) : '---'}</p>
          </div>
        </div>

        {review && (
          <div className="mt-2 p-4 bg-card rounded-2xl border border-border shadow-sm">
            <div className={`flex items-center justify-between ${review.comment ? 'mb-2' : ''}`}>
              <div className="flex items-center gap-1">
                <Star size={12} className="text-orange-400 fill-orange-400" />
                <span className="text-xs font-black text-foreground">{review.rating}</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Đánh giá</span>
            </div>
            
            {review.comment && (
              <p 
                className={`text-xs text-foreground/80 leading-relaxed ${showFullComment ? '' : 'line-clamp-2'} cursor-pointer`}
                onClick={() => setShowFullComment(!showFullComment)}
              >
                {review.comment}
              </p>
            )}

            {review.imageUrls && review.imageUrls.length > 0 && (
              <div className="flex gap-2 mt-3">
                {review.imageUrls.map((url, i) => (
                  <div key={i} className="w-10 h-10 rounded-lg overflow-hidden border border-border">
                    <img src={getOptimizedUrl(url, 200)} className="w-full h-full object-cover cursor-pointer" onClick={() => window.open(url, '_blank')} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-4 md:p-5 border-t border-border/50">
        {order.status === 'ready' && (
          <div className="w-full py-3 md:py-4 flex items-center justify-center gap-2 text-muted-foreground font-bold text-[13px] md:text-sm bg-secondary rounded-[16px] md:rounded-[20px]">
            <Clock size={14} />
            Chờ bé đến lấy...
          </div>
        )}
        {order.status === 'on_the_way' && (
          <div className="w-full py-3 md:py-4 flex items-center justify-center gap-2 text-primary font-bold text-[13px] md:text-sm bg-primary/10 rounded-[16px] md:rounded-[20px]">
             <Navigation size={14} className="rotate-45 animate-pulse" /> Bé đang trên đường đến
          </div>
        )}
        {order.status === 'arrived' && (
          <div className="w-full py-3 md:py-4 flex items-center justify-center gap-2 text-green-600 font-bold text-[13px] md:text-sm bg-green-500/10 rounded-[16px] md:rounded-[20px] mb-2">
             <MapPin size={14} className="animate-bounce" /> Bé đã tới bếp!
          </div>
        )}
        {config.next ? (
          <button 
            onClick={() => onUpdate(order.id!, config.next!)}
            className={`w-full flex items-center justify-center gap-2 font-black py-3 md:py-4 rounded-[16px] md:rounded-[20px] transition-all shadow-lg active:scale-[0.97] text-[13px] md:text-sm uppercase tracking-widest ${
              order.status === 'arrived' 
                ? 'bg-primary text-primary-foreground hover:opacity-90 shadow-primary-shadow/30' 
                : 'bg-primary text-primary-foreground hover:opacity-90 shadow-primary-shadow/30'
            }`}
          >
            {config.buttonLabel || `Chuyển sang: ${STATUS_CONFIG[config.next].label}`}
          </button>
        ) : (
          !['ready', 'on_the_way'].includes(order.status) && (
            <div className={`w-full py-3 md:py-4 flex items-center justify-center gap-2 font-bold text-[13px] md:text-sm rounded-[16px] md:rounded-[20px] ${order.status === 'cancelled' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground'}`}>
              {order.status === 'cancelled' ? <Trash2 size={14} /> : <CheckCircle2 size={14} />}
              {order.status === 'cancelled' ? 'Đã huỷ' : 'Đã hoàn tất'}
            </div>
          )
        )}
      </div>
    </motion.div>
  );
}
