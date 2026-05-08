/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Star, 
  Clock, 
  ChefHat, 
  MessageCircle, 
  TrendingUp,
  Heart,
} from 'lucide-react';
import { Recipe, Review, Category } from '../types';
import HeartButton from './HeartButton';
import Avatar from './Avatar';
import { db } from '../lib/firebase';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { useCategory } from '../context/CategoryContext';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
} from 'firebase/firestore';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { getOptimizedUrl } from '../lib/cloudinary';

import BottomSheet from './BottomSheet';

interface RecipeModalProps {
  recipe: Recipe | null;
  onClose: () => void;
}

export default function RecipeModal({ recipe, onClose }: RecipeModalProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const { getCategoryById } = useCategory();

  useEffect(() => {
    if (recipe?.id) {
      fetchReviews();
    }
  }, [recipe?.id]);

  const fetchReviews = async () => {
    if (!recipe?.id) return;
    setLoadingReviews(true);
    try {
      const q = query(
        collection(db, 'reviews'),
        where('recipeId', '==', recipe.id),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const reviewsData = snap.docs.map(d => ({ id: d.id, ...d.data() } as Review));
      
      // Enrich reviews with missing avatars
      const authorIds = Array.from(new Set(reviewsData.filter(r => !r.authorAvatar).map(r => r.authorId)));
      
      if (authorIds.length > 0) {
        const { getDoc, doc } = await import('firebase/firestore');
        const profiles: Record<string, string | null> = {};
        
        await Promise.all(authorIds.map(async (id) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', id));
            if (userDoc.exists()) {
              profiles[id] = userDoc.data().avatar || null;
            }
          } catch (e) {
            console.error('Error fetching user profile:', e);
          }
        }));
        
        const enrichedReviews = reviewsData.map(r => ({
          ...r,
          authorAvatar: r.authorAvatar || profiles[r.authorId] || null
        }));
        setReviews(enrichedReviews);
      } else {
        setReviews(reviewsData);
      }
    } catch (err) {
      console.error('Error fetching reviews:', err);
    } finally {
      setLoadingReviews(false);
    }
  };

  const mainReviews = reviews.filter(r => !r.parentId);

  return (
    <BottomSheet isOpen={!!recipe} onClose={onClose}>
      {recipe && (
        <div className="flex flex-col md:flex-row">
          {/* Main Content (Left on Desktop) */}
          <div className="flex-1">
            <div className="relative h-64 md:h-96 w-full bg-secondary shrink-0">
              {recipe.imageUrl ? (
                <img src={getOptimizedUrl(recipe.imageUrl, 800)} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <ChefHat size={64} />
                </div>
              )}
              {recipe.id && (
                <div className="absolute top-4 right-4 z-20">
                  <HeartButton recipeId={recipe.id} size={44} />
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-card to-transparent" />
            </div>

            <div className="px-6 md:px-8 pb-12 -mt-12 relative">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center flex-wrap gap-2 mb-2">
                    <span className="px-3 py-1 rounded-full bg-accent text-accent-foreground text-[10px] font-black uppercase tracking-wider">
                      {recipe.tags && recipe.tags[0] ? recipe.tags[0] : 'Phổ biến'}
                    </span>
                    <div className="flex items-center gap-1 text-primary">
                      <Star size={14} fill="currentColor" />
                      <span className="text-xs font-bold">{recipe.avgRating?.toFixed(1) || '0.0'}</span>
                      <span className="text-muted-foreground text-xs font-normal">({recipe.totalRatings || 0})</span>
                    </div>
                    {recipe.favoriteCount !== undefined && (
                      <div className="flex items-center gap-1 text-destructive text-xs font-bold bg-destructive/10 px-2 py-1 rounded-full">
                        <Heart size={12} fill="currentColor" />
                        <span>{recipe.favoriteCount}</span>
                      </div>
                    )}
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black text-foreground leading-tight mb-3">{recipe.title}</h2>
                  {recipe.categoryId && getCategoryById(recipe.categoryId) && (
                    <div 
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl border shadow-sm"
                      style={{ 
                        backgroundColor: `${getCategoryById(recipe.categoryId)!.color}15`, 
                        color: getCategoryById(recipe.categoryId)!.color,
                        borderColor: `${getCategoryById(recipe.categoryId)!.color}30`
                      }}
                    >
                      <span className="text-lg">{getCategoryById(recipe.categoryId)!.emoji}</span>
                      <span className="text-xs font-black uppercase tracking-widest">{getCategoryById(recipe.categoryId)!.name}</span>
                    </div>
                  )}
                  {recipe.shortDescription && (
                    <p className="mt-3 text-[14px] text-muted-foreground italic font-bold leading-relaxed">
                      {recipe.shortDescription}
                    </p>
                  )}
                </div>
              </div>

              <p className="mt-6 text-muted-foreground leading-relaxed text-sm md:text-base">{recipe.description}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                <div className="bg-secondary/50 p-6 rounded-[32px] border border-border">
                  <h3 className="text-sm font-black text-foreground uppercase mb-4 flex items-center gap-2">
                    <TrendingUp size={16} className="text-primary" />
                    Nguyên liệu
                  </h3>
                  <ul className="space-y-3">
                    {recipe.ingredients.map((ing, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-foreground/80">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        {ing}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-secondary/50 p-6 rounded-[32px] border border-border">
                  <h3 className="text-sm font-black text-foreground uppercase mb-4 flex items-center gap-2">
                    <Clock size={16} className="text-primary" />
                    Cách làm
                  </h3>
                  <ul className="space-y-4">
                    {recipe.steps.map((step, idx) => (
                      <li key={idx} className="flex gap-4 group">
                        <span className="w-6 h-6 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-black text-xs shrink-0 group-hover:scale-110 transition-transform">
                          {idx + 1}
                        </span>
                        <span className="text-sm text-foreground/80 leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Right/Bottom Section: Reviews */}
          <div className="w-full md:w-96 bg-secondary md:border-l border-border flex flex-col shrink-0 border-t md:border-t-0 mt-4 md:mt-0">
            <div className="p-6 md:p-8 border-b border-border shrink-0 bg-card md:bg-transparent">
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                <MessageCircle size={20} className="text-primary" />
                Đánh giá & Bình luận
              </h3>
            </div>

            <div className="flex-1 p-6 space-y-6 min-h-0 bg-secondary/50">
              {loadingReviews ? (
                <div className="space-y-4 py-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-muted animate-pulse h-24 rounded-2xl" />
                  ))}
                </div>
              ) : reviews.length === 0 ? (
                <div className="py-12 md:py-20 text-center">
                  <div className="w-16 h-16 rounded-full bg-card flex items-center justify-center mx-auto mb-4 text-muted-foreground">
                    <MessageCircle size={32} />
                  </div>
                  <p className="text-muted-foreground text-sm font-medium">Chưa có đánh giá nào</p>
                </div>
              ) : (
                mainReviews.map(review => (
                  <div key={review.id} className="space-y-3">
                    <div className="bg-card p-4 rounded-2xl shadow-sm border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-left">
                          <Avatar 
                            src={review.authorAvatar} 
                            name={review.authorName} 
                            size={32} 
                          />
                          <div>
                            <p className="text-xs font-bold text-foreground">{review.authorName}</p>
                            <p className="text-[10px] text-muted-foreground">{format(review.createdAt.toDate(), 'HH:mm dd/MM/yy', { locale: vi })}</p>
                          </div>
                        </div>
                        {review.rating && (
                          <div className="flex items-center gap-0.5 text-primary">
                            {Array.from({ length: review.rating }).map((_, i) => (
                              <Star key={i} size={10} fill="currentColor" />
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-foreground/70 text-left">{review.comment}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
