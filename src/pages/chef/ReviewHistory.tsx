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
      const recipeIds = Array.from(new Set(loadedReviews.map(r => r.recipeId))).filter(Boolean);
      const orderIds = Array.from(new Set(loadedReviews.map(r => r.orderId))).filter(id => !!id) as string[];

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
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/chef/dashboard')}
            className="p-2 bg-card rounded-xl border border-border text-muted-foreground hover:text-primary transition-all"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="space-y-[2px]">
            <h1 className="text-[20px] font-semibold text-foreground">Tất cả đánh giá</h1>
            <p className="text-[13px] font-normal text-muted-foreground">Xem nhận xét từ các bé về món ăn</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <select 
                value={starFilter}
                onChange={(e) => setStarFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="pl-9 pr-4 py-2 bg-card border border-border rounded-xl text-sm font-medium outline-none focus:border-primary appearance-none text-foreground"
              >
                <option value="all">Tất cả sao</option>
                {[5, 4, 3, 2, 1].map(s => <option key={s} value={s}>{s} Sao</option>)}
              </select>
            </div>

            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <select 
                value={weekFilter}
                onChange={(e) => setWeekFilter(e.target.value)}
                className="pl-9 pr-4 py-2 bg-card border border-border rounded-xl text-sm font-medium outline-none focus:border-primary appearance-none text-foreground"
              >
                <option value="all">Tất cả tuần</option>
                {uniqueWeeks.map(w => {
                  const weekNum = w.includes('-') ? w.split('-')[1] : w;
                  return <option key={w} value={w}>Tuần {weekNum}</option>
                })}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="max-w-4xl space-y-4 pb-12">
          {filteredReviews.length === 0 ? (
            <div className="bg-card p-12 rounded-3xl border border-dashed border-border text-center text-muted-foreground">
              <Star className="mx-auto mb-2 opacity-20" size={48} />
              <p>Không tìm thấy đánh giá nào khớp với bộ lọc</p>
            </div>
          ) : (
            filteredReviews.map((review) => {
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
                  className="bg-card p-5 rounded-2xl border-[0.5px] border-border hover:border-primary/50 transition-all flex gap-5"
                >
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-secondary shrink-0 border border-border">
                    {recipe?.imageUrl || recipe?.thumbnailUrl ? (
                      <img src={getOptimizedUrl(recipe.thumbnailUrl || recipe.imageUrl, 200)} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                        <Utensils size={20} />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-3">
                        <span className="text-[15px] font-bold text-foreground">
                          {kid?.name ? `Bé ${kid.name}` : `Bé ${review.authorName}`}
                        </span>
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map(star => (
                            <Star 
                              key={star} 
                              size={12} 
                              className={star <= (review.rating || 0) ? "fill-orange-400 text-orange-400" : "text-muted/20 fill-muted/20"} 
                            />
                          ))}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">
                        {review.createdAt ? format(review.createdAt.toDate(), 'HH:mm - dd/MM/yyyy', { locale: vi }) : ''}
                      </span>
                    </div>

                    <div className="mb-3">
                      <p className="text-sm text-foreground font-semibold mb-0.5">{recipe?.title || 'Công thức...'}</p>
                      {order && (
                        <p className="text-xs text-muted-foreground font-bold">
                          {dayLabel} {weekNum ? `· Tuần ${weekNum}` : ''}
                        </p>
                      )}
                    </div>

                    {review.comment && (
                      <div className="bg-secondary p-4 rounded-2xl border border-border/50">
                        <p className="text-sm text-foreground/80 leading-relaxed">
                          {review.comment}
                        </p>
                      </div>
                    )}
                  </div>

                  {review.imageUrls && review.imageUrls.length > 0 && (
                    <div className="shrink-0 flex flex-col gap-2">
                      {review.imageUrls.map((url, idx) => (
                        <div key={idx} className="w-12 h-12 rounded-lg overflow-hidden border border-border shadow-sm">
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
