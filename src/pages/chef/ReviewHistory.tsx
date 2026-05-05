/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot,
  getDoc,
  doc,
  where
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Review, User, Recipe, Order } from '../../types';
import { motion } from 'motion/react';
import Avatar from '../../components/Avatar';
import { 
  Star, 
  Utensils,
  Loader2,
  Filter,
  Calendar,
  ArrowLeft
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { getOptimizedUrl } from '../../lib/cloudinary';

export default function ReviewHistory() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [kidProfiles, setKidProfiles] = useState<Record<string, User>>({});
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
  const [reviewOrders, setReviewOrders] = useState<Record<string, Order>>({});
  const [loading, setLoading] = useState(true);
  
  const [starFilter, setStarFilter] = useState<number | 'all'>('all');
  const [weekFilter, setWeekFilter] = useState<string>('all');

  useEffect(() => {
    const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const loadedReviews = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Review));
      setReviews(loadedReviews);

      // Fetch missing data
      const kidIds = Array.from(new Set(loadedReviews.map(r => r.authorId))).filter(Boolean);
      const orderIds = Array.from(new Set(loadedReviews.map(r => r.orderId))).filter(id => !!id) as string[];

      const userMap = { ...kidProfiles };
      const recipeMap = { ...recipes };
      const orderMap = { ...reviewOrders };

      const recipeIdsSet = new Set<string>();
      loadedReviews.forEach(r => {
        if (r.recipeId) recipeIdsSet.add(r.recipeId);
      });
      // Also add recipeIds from the orders themselves
      orderIds.forEach(oid => {
        const order = orderMap[oid];
        if (order?.recipeIds) {
          order.recipeIds.forEach(id => recipeIdsSet.add(id));
        } else if (order?.recipeId) {
          recipeIdsSet.add(order.recipeId);
        }
      });
      const recipeIds = Array.from(recipeIdsSet);

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
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const uniqueWeeks = (Array.from(new Set((Object.values(reviewOrders) as Order[]).map(o => o.weekId))) as string[]).filter(Boolean).sort().reverse();

  const filteredReviews = reviews.filter(r => {
    const matchStar = starFilter === 'all' || r.rating === starFilter;
    const order = r.orderId ? reviewOrders[r.orderId] : null;
    const matchWeek = weekFilter === 'all' || order?.weekId === weekFilter;
    return matchStar && matchWeek;
  });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-primary" size={32} />
    </div>
  );

  return (
    <div className="chef-page-content h-full overflow-y-auto scrollbar-hide">
      <div className="space-y-6 bg-background pb-4">
        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={() => navigate('/chef/dashboard')}
            className="p-2 bg-card rounded-xl border border-border text-muted-foreground hover:text-primary transition-all shadow-sm"
          >
            <ArrowLeft size={18} className="md:w-4.5 md:h-4.5" />
          </button>
          <div className="space-y-[2px]">
            <h1 className="text-[18px] md:text-[20px] font-semibold text-foreground">Tất cả đánh giá</h1>
            <p className="text-[12px] md:text-[13px] font-normal text-muted-foreground">Xem nhận xét từ các bé</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 md:pb-4 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <div className="relative">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hidden md:block" />
              <select 
                value={starFilter}
                onChange={(e) => setStarFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="pl-3 md:pl-9 pr-4 py-2 md:py-2.5 bg-card border border-border rounded-lg md:rounded-xl text-[12px] md:text-sm font-medium outline-none focus:border-primary transition-all text-foreground min-w-[110px] md:min-w-[130px]"
              >
                <option value="all">Sao: Tất cả</option>
                {[5, 4, 3, 2, 1].map(s => <option key={s} value={s}>{s} Sao</option>)}
              </select>
            </div>

            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hidden md:block" />
              <select 
                value={weekFilter}
                onChange={(e) => setWeekFilter(e.target.value)}
                className="pl-3 md:pl-9 pr-3 md:pr-4 py-2 md:py-2.5 bg-card border border-border rounded-lg md:rounded-xl text-[12px] md:text-sm font-medium outline-none focus:border-primary transition-all text-foreground min-w-[110px] md:min-w-[130px]"
              >
                <option value="all">Tuần: Tất cả</option>
                {uniqueWeeks.map(w => {
                  const weekNum = w.includes('-') ? w.split('-')[1] : w;
                  return <option key={w} value={w}>Tuần {weekNum}</option>
                })}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 md:mt-6">
        <div className="max-w-4xl space-y-4 pb-12">
          {filteredReviews.length === 0 ? (
            <div className="bg-card py-16 p-8 md:p-12 rounded-[24px] md:rounded-3xl border border-dashed border-border text-center text-muted-foreground">
              <Star className="mx-auto mb-4 opacity-10" size={48} />
              <p className="text-[13px] md:text-sm">Không tìm thấy đánh giá nào khớp với bộ lọc</p>
            </div>
          ) : (
            filteredReviews.map((review) => {
              const kid = kidProfiles[review.authorId];
              const order = review.orderId ? reviewOrders[review.orderId] : null;
              const recipe = review.recipeId ? recipes[review.recipeId] : null;
              
              const orderRecipeIds = order?.recipeIds || (order?.recipeId ? [order.recipeId] : []);
              const displayRecipes = recipe ? [recipe] : orderRecipeIds.map(id => recipes[id]).filter(Boolean);
              
              const DAY_NAMES = { mon: 'Thứ Hai', tue: 'Thứ Ba', wed: 'Thứ Tư', thu: 'Thứ Năm', fri: 'Thứ Sáu' };
              const dayLabel = order ? DAY_NAMES[order.day] : '';
              const weekNum = order?.weekId ? (order.weekId.includes('-') ? order.weekId.split('-')[1] : order.weekId) : '';

              return (
                <motion.div 
                  key={review.id} 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card p-4 md:p-5 rounded-[24px] md:rounded-2xl border border-border/50 hover:border-primary/30 transition-all flex flex-col md:flex-row gap-4 md:gap-5 shadow-sm"
                >
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl overflow-hidden bg-secondary shrink-0 border border-border shadow-sm flex flex-wrap">
                      {displayRecipes.length > 0 ? (
                        displayRecipes.slice(0, 4).map((r, i) => (
                          <img 
                            key={r.id || i} 
                            src={getOptimizedUrl(r.thumbnailUrl || r.imageUrl, 200)} 
                            className={`object-cover ${displayRecipes.length > 1 ? 'w-1/2 h-1/2' : 'w-full h-full'}`} 
                          />
                        ))
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                          <Utensils size={20} />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-1 md:gap-2 mb-2">
                        <div className="flex items-center gap-2 md:gap-3">
                          <Avatar 
                            src={kid?.avatar || review.authorAvatar} 
                            name={kid?.name || review.authorName} 
                            size={28} 
                            className="rounded-lg shadow-sm md:w-8 md:h-8"
                          />
                          <span className="text-[14px] md:text-[15px] font-bold text-foreground truncate">
                            {kid?.name ? `Bé ${kid.name}` : `Bé ${review.authorName}`}
                          </span>
                          <div className="flex gap-0.5 shrink-0">
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star 
                                key={star} 
                                size={10} 
                                className={star <= (review.rating || 0) ? "fill-orange-400 text-orange-400" : "text-muted/20 fill-muted/20"} 
                              />
                            ))}
                          </div>
                        </div>
                        <span className="text-[10px] md:text-xs text-muted-foreground font-medium md:shrink-0">
                          {review.createdAt ? format(review.createdAt.toDate(), 'HH:mm dd/MM/yy', { locale: vi }) : ''}
                        </span>
                      </div>

                      <div className="mb-3">
                        <p className="text-[13px] md:text-sm text-foreground font-bold mb-0.5 line-clamp-1">
                          {displayRecipes.length > 0 
                            ? displayRecipes.map(r => r.title).join(', ')
                            : 'Món ăn không tồn tại'}
                        </p>
                        {order && (
                          <p className="text-[10px] md:text-xs text-muted-foreground font-semibold flex items-center gap-1.5 bg-secondary/50 w-fit px-2 py-0.5 rounded-lg">
                            {dayLabel} {weekNum ? `· Tuần ${weekNum}` : ''}
                          </p>
                        )}
                      </div>

                      {review.comment && (
                        <div className="bg-secondary/40 p-3 md:p-4 rounded-xl md:rounded-2xl border border-border/30">
                          <p className="text-[13px] md:text-sm text-foreground/80 leading-relaxed italic">
                            "{review.comment}"
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {review.imageUrls && review.imageUrls.length > 0 && (
                    <div className="flex flex-row md:flex-col gap-2 shrink-0 md:pt-1">
                      {review.imageUrls.map((url, idx) => (
                        <div key={idx} className="w-14 h-14 md:w-16 md:h-16 rounded-xl overflow-hidden border border-border shadow-sm shrink-0">
                          <img src={getOptimizedUrl(url, 200)} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
