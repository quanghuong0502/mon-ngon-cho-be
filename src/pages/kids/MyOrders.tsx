/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  doc,
  getDoc,
  addDoc,
  Timestamp,
  updateDoc,
  increment
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { uploadToCloudinary, getOptimizedUrl } from '../../lib/cloudinary';
import { Order, Recipe, Review, UserSession } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Image as ImageIcon, 
  X, 
  Save, 
  Loader2,
  AlertTriangle,
  Upload,
  Megaphone,
  Bell,
  Flame,
  Star as StarIcon,
  Target,
  Trophy,
  History,
  Info,
  Sparkles,
  Inbox,
  Navigation,
  MapPin,
  UtensilsCrossed,
  Clock,
  ChefHat,
  Utensils,
  CircleCheckBig,
  Star,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  Calendar,
  Maximize2,
  Pencil
} from 'lucide-react';
import { format, startOfWeek, addDays, getWeek } from 'date-fns';
import { vi } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { sendPushToUser, getChefOneSignalIds } from '../../lib/oneSignal';
import BottomSheet from '../../components/BottomSheet';

interface ReviewModalProps {
  recipes: Recipe[];
  orderId: string;
  orderDate: Date;
  orderDay: string;
  user: UserSession;
  existingReview?: Review;
  onClose: () => void;
  onSuccess: () => void;
  onImageClick?: (images: string[], index: number) => void;
}

function ReviewModal({ recipes, orderId, orderDate, orderDay, user, existingReview, onClose, onSuccess, onImageClick }: ReviewModalProps) {
  const [rating, setRating] = useState(existingReview?.rating || 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState(existingReview?.comment || '');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>(existingReview?.imageUrls || []);
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLockBodyScroll(true);

  const isReadOnly = !!existingReview;

  const ratingLabels: Record<number, string> = {
    1: 'Không ngon',
    2: 'Tạm được',
    3: 'Khá ngon',
    4: 'Rất ngon',
    5: 'Tuyệt vời!',
  };

  const getTagsByRating = (r: number) => {
    // Collect all unique tags from all recipes in this order
    const allCustomTags: string[] = [];
    recipes.forEach(recipe => {
      const custom = recipe.reviewTags;
      if (custom && Array.isArray(custom)) {
        const match = custom.find(rule => r === rule.star);
        if (match && match.tags.length > 0) {
          match.tags.forEach(t => {
            if (!allCustomTags.includes(t)) allCustomTags.push(t);
          });
        }
      }
    });

    if (allCustomTags.length > 0) return allCustomTags;

    // Default fallbacks if no custom rule matches
    if (r === 5) return ['Ngon tuyệt! 😋', 'Rất thích! ❤️', 'Trang trí đẹp', 'Nhiều đồ ăn'];
    if (r >= 3) return ['Khá ngon', 'Bình thường', 'Hơi mặn', 'Hơi cay'];
    if (r >= 1) return ['Không ngon', 'Ít đồ ăn', 'Quá mặn', 'Quá cay'];
    return [];
  };

  const suggestions = getTagsByRating(rating);

  // Synchronize selected tags with comment text whenever either changes
  useEffect(() => {
    if (isReadOnly) return;
    const activeTags = suggestions.filter(tag => comment.includes(tag));
    setSelectedTags(activeTags);
  }, [comment, suggestions, isReadOnly]);

  const handleTagClick = (tag: string) => {
    if (isReadOnly) return;
    
    const isSelected = selectedTags.includes(tag);
    
    if (isSelected) {
      setComment(prev => {
        const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Handle removing the tag and punctuation correctly
        let newComment = prev;
        // Try removing with leading comma
        newComment = newComment.replace(new RegExp(`,\\s*${escapedTag}`, 'g'), '');
        // Try removing with trailing comma
        newComment = newComment.replace(new RegExp(`${escapedTag},\\s*`, 'g'), '');
        // Try removing exact match
        newComment = newComment.replace(new RegExp(`^${escapedTag}$`, 'g'), '');
        return newComment.trim();
      });
    } else {
      // Auto-append logic with comma
      setComment(prev => {
        const trimmed = prev.trim();
        if (!trimmed) return tag;
        return `${trimmed}, ${tag}`;
      });
    }

    // Auto-expand textarea
    if (textareaRef.current) {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
        }
      }, 0);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const totalCount = images.length + newFiles.length;
      
      if (totalCount > 3) {
        toast.error('Bé chỉ được thêm tối đa 3 ảnh thôi nhé!');
        return;
      }

      setImages(prev => [...prev, ...newFiles]);
      const newPreviews = newFiles.map((file: File) => URL.createObjectURL(file));
      setPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setImages(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || rating === 0 || !comment.trim()) return;

    setSubmitting(true);
    const toastId = toast.loading('Đang gửi đánh giá...');

    try {
      const imageUrls: string[] = [];

      if (images.length > 0) {
        try {
          for (let i = 0; i < images.length; i++) {
            const url = await uploadToCloudinary(images[i], 'buacomchobe/reviews');
            imageUrls.push(url);
          }
        } catch (err: any) {
          console.error('Cloudinary Upload Error:', err);
        }
      }

      await addDoc(collection(db, 'reviews'), {
        orderId,
        authorId: user.userId,
        authorName: user.name,
        authorAvatar: user.avatar || null,
        authorRole: user.role,
        rating,
        comment,
        imageUrls,
        createdAt: Timestamp.now()
      });

      // Update ratings for all recipes in the order
      await Promise.all(recipes.map(async (recipe) => {
        const recipeRef = doc(db, 'recipes', recipe.id!);
        const recipeDoc = await getDoc(recipeRef);
        if (recipeDoc.exists()) {
          const data = recipeDoc.data();
          const currentTotal = data.totalRatings || 0;
          const currentAvg = data.avgRating || 0;
          const newTotal = currentTotal + 1;
          const newAvg = (currentAvg * currentTotal + rating) / newTotal;

          await updateDoc(recipeRef, {
            totalRatings: newTotal,
            avgRating: newAvg
          });
        }
      }));

      toast.success('Cảm ơn bé đã đánh giá nhé!', { id: toastId });
      setIsSuccess(true);

      try {
        const chefIds = await getChefOneSignalIds();
        if (chefIds.length > 0) {
          const starsLabel = `${rating} sao`;
          const shortComment = comment 
            ? (comment.length > 80 ? comment.substring(0, 77) + '...' : comment)
            : 'Không có bình luận';

          const recipeTitles = recipes.map(r => r.title).join(', ');
          const displayTitles = recipeTitles.length > 50 ? recipeTitles.substring(0, 47) + '...' : recipeTitles;

          await sendPushToUser(
            chefIds,
            `Bé ${user.name || ''} đã đánh giá đơn hàng! ${starsLabel}`,
            `"${shortComment}" — các món: ${displayTitles}`,
            '/chef/reviews'
          );
        }
      } catch (err) {
        console.error('Notify chef error:', err);
      }

      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err) {
      console.error('Error submitting review:', err);
      toast.error('Có lỗi xảy ra, bé thử lại sau nhé!', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <BottomSheet isOpen={true} onClose={onSuccess}>
        <div className="py-12 text-center">
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.2, 1], rotate: [0, 10, 0] }}
            className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 mx-auto mb-6"
          >
            <Sparkles size={48} />
          </motion.div>
          <h2 className="text-2xl font-black text-foreground mb-2">Tuyệt vời!</h2>
          <p className="text-muted-foreground font-medium px-4">Cảm ơn bé đã gửi đánh giá cho đầu bếp nhé! Bé thật ngoan</p>
        </div>
      </BottomSheet>
    );
  }

  const Header = (
    <div className="flex items-center gap-4 text-left">
      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-primary shadow-sm border border-primary/10">
        <MessageSquare size={20} />
      </div>
      <div>
        <h2 className="text-[17px] font-black text-foreground leading-tight">
          {isReadOnly ? 'Đánh giá đơn hàng' : 'Bé thấy bữa ăn thế nào?'}
        </h2>
        <div className="flex flex-col mt-0.5">
         
          <p className="text-[12px] font-medium text-muted-foreground mt-0.5">
            {orderDay} ngày {format(orderDate, 'dd/MM')},  <span className="text-[14px] font-black text-primary leading-tight">
            {recipes.length} món
          </span>
          </p>
        </div>
      </div>
    </div>
  );

  const Footer = (
    <div className="w-full">
      {isReadOnly ? (
        <button 
          onClick={onClose}
          className="w-full h-12 bg-secondary text-muted-foreground font-black rounded-[14px] hover:opacity-80 transition-all uppercase tracking-widest text-[13px] active:scale-[0.98]"
        >
          Đóng
        </button>
      ) : (
        <button 
          form="review-form"
          type="submit"
          disabled={submitting || rating === 0 || !comment.trim()}
          className={`w-full h-12 rounded-[14px] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2.5 transition-all shadow-xl active:scale-[0.98] ${
            rating === 0 || !comment.trim()
            ? 'bg-muted text-muted-foreground cursor-not-allowed' 
            : 'bg-primary text-primary-foreground shadow-primary-shadow/30 hover:opacity-95'
          }`}
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              Đang gửi...
            </>
          ) : (
            <>
              Gửi đánh giá cho Đầu bếp 🍱
            </>
          )}
        </button>
      )}
    </div>
  );

  return (
    <BottomSheet 
      isOpen={true} 
      onClose={onClose}
      title={Header}
      footer={Footer}
    >
      <div className="space-y-4 px-6 md:px-8 py-6">
        {/* Rating Section */}
        <div className="text-center">
          <div className="flex justify-center gap-2 pb-2">
            {[1, 2, 3, 4, 5].map(star => (
              <motion.button 
                key={star} 
                type="button"
                disabled={isReadOnly}
                onMouseEnter={() => !isReadOnly && setHoverRating(star)}
                onMouseLeave={() => !isReadOnly && setHoverRating(0)}
                onClick={() => setRating(star)}
                whileHover={!isReadOnly ? { scale: 1.15, rotate: [0, -5, 5, 0] } : {}}
                whileTap={!isReadOnly ? { scale: 0.95 } : {}}
                className="relative p-0.5"
              >
                <Star 
                  size={32} 
                  className={`transition-colors duration-200 ${
                    star <= (hoverRating || rating) 
                      ? 'text-primary fill-primary' 
                      : 'text-border fill-muted/20'
                  }`}
                  strokeWidth={star <= (hoverRating || rating) ? 2 : 1.5}
                />
              </motion.button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            {(hoverRating || rating) > 0 && (
              <motion.p 
                key={hoverRating || rating}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-[13px] font-black text-primary"
              >
                {ratingLabels[hoverRating || rating]}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Input & Upload Sections */}
        <form id="review-form" onSubmit={handleSubmit} className="space-y-4">
          {isReadOnly ? (
            <div className="space-y-4 text-left">
              {previews.length > 0 && (
                <div>
                  <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1.5 block mb-2">Ảnh của bé</label>
                  <div className="flex flex-wrap gap-2">
                    {previews.map((preview, i) => (
                      <motion.div 
                        key={i} 
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onImageClick?.(previews, i)}
                        className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-sm border border-border cursor-pointer active:opacity-80"
                      >
                        <img src={getOptimizedUrl(preview, 300)} className="w-full h-full object-cover" />
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
              
              {comment && (
                <div>
                  <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1.5 block mb-2">Cảm nhận của bé</label>
                  <div className="w-full p-4 bg-secondary border border-border rounded-2xl text-foreground text-[14px] leading-relaxed italic">
                    "{comment}"
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Upload Section */}
              <div className="text-left space-y-3">
                <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1.5 block">
                  {images.length > 0 ? 'Ảnh của bé' : 'Thêm ảnh'}
                </label>
                <div className="flex flex-wrap gap-3">
                  {previews.map((preview, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden bg-secondary border border-border">
                      <img src={preview} className="w-full h-full object-cover" />
                      <motion.button 
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg"
                      >
                        <X size={10} />
                      </motion.button>
                    </div>
                  ))}
                  
                  {images.length < 3 && (
                    <label className="w-16 h-16 rounded-xl border-2 border-dashed border-primary/30 bg-secondary flex flex-col items-center justify-center gap-1 text-primary hover:border-primary hover:bg-secondary transition-all cursor-pointer group">
                      <ImageIcon size={20} />
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
                    </label>
                  )}
                </div>
              </div>

            

              {/* Comment Section */}
              <div className="space-y-3 text-left">
                <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1.5 block">
                  Cảm nhận <span className="text-destructive">*</span>
                </label>
                <textarea 
                  ref={textareaRef}
                  value={comment}
                  onChange={e => {
                    setComment(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                  }}
                  placeholder="Món này ngon quá ạ! Bé rất thích..."
                  className="w-full p-4 bg-secondary border border-border rounded-[20px] outline-none focus:border-primary transition-all min-h-[100px] max-h-[160px] resize-none text-foreground leading-relaxed text-based w-full p-3 leading-snug text-base"
                />
              </div>

                {/* Quick Tags */}
              {rating > 0 && (
                <div className="space-y-3">
                  <label className="text-[13px] font-medium text-muted-foreground ml-1.5 block">Chọn nhanh 👇</label>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map(s => {
                      const isSelected = selectedTags.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleTagClick(s)}
                          className={`px-3.5 py-1.5 rounded-full text-[13px] font-bold transition-all active:scale-95 border ${
                            isSelected 
                            ? 'bg-primary border-primary text-primary-foreground cursor-pointer shadow-none' 
                            : 'bg-white border-gray-200 text-gray-700 hover:border-primary hover:text-primary cursor-pointer shadow-sm'
                          }`}
                        >
                          {isSelected ? `✓ ${s}` : s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </BottomSheet>
  );
}

export default function MyOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isReviewsPage = location.pathname === '/kids/reviews';
  const [orders, setOrders] = useState<Order[]>([]);
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [loading, setLoading] = useState(true);
  const [kitchenConfig, setKitchenConfig] = useState<any>(null);
  const [isKitchenOpen, setIsKitchenOpen] = useState(false);
  const [reviewingMeal, setReviewingMeal] = useState<{ recipes: Recipe[], orderId: string, orderDate: Date, orderDay: string } | null>(null);
  const [previewImages, setPreviewImages] = useState<string[] | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number>(0);
  const [direction, setDirection] = useState(0);
  const [weekIdx, setWeekIdx] = useState(0);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'unreviewed' | 'reviewed'>('all');

  useLockBodyScroll(!!reviewingMeal || !!previewImages);

  useEffect(() => {
    if (!user) return;

    // Snapshot for kitchen config
    const unsubscribeKitchen = onSnapshot(doc(db, 'config', 'main'), (snap) => {
      if (snap.exists()) {
        setKitchenConfig(snap.data());
      }
    });

    return () => unsubscribeKitchen();
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
    const timer = setInterval(checkKitchenStatus, 60000);
    return () => clearInterval(timer);
  }, [kitchenConfig]);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: newStatus,
        updatedAt: new Date()
      });

      // Notify chef
      const order = orders.find(o => o.id === orderId);
      if (order) {
        const orderRecipeIds = order.recipeIds || (order.recipeId ? [order.recipeId] : []);
        const kidName = user?.name || 'Bé';
        let recipeNames = 'món ăn';
        
        if (orderRecipeIds.length > 0) {
          const names = orderRecipeIds.map(id => recipes[id]?.title).filter(Boolean);
          if (names.length > 1) {
            recipeNames = `${names.length} món ăn`;
          } else if (names.length === 1) {
            recipeNames = names[0];
          }
        }
        
        const displayRecipeName = recipeNames.length > 30 ? recipeNames.substring(0, 27) + '...' : recipeNames;

        const messages: Record<string, { title: string; body: string }> = {
          on_the_way: {
            title: `Bé ${kidName} đang trên đường!`,
            body: `Bé đang đến lấy ${displayRecipeName}. Chuẩn bị nhé!`
          },
          arrived: {
            title: `Bé ${kidName} đã tới bếp!`,
            body: `Bé đang chờ nhận ${displayRecipeName}. Giao món thôi!`
          }
        };

        const msg = messages[newStatus];
        if (msg) {
          const chefIds = await getChefOneSignalIds();
          if (chefIds.length > 0) {
            await sendPushToUser(chefIds, msg.title, msg.body, '/chef/orders');
          }
        }
      }
    } catch (err) {
      console.error('Error updating order status:', err);
    }
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // 1. Snapshot for all orders of this user
    const q = query(
      collection(db, 'orders'),
      where('kidId', '==', user.userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snap) => {
      const loadedOrders = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setOrders(loadedOrders);

      // 2. Fetch recipes for these orders
      const allIdsSet = new Set<string>();
      loadedOrders.forEach(o => {
        if (o.recipeIds && o.recipeIds.length > 0) {
          o.recipeIds.forEach(id => allIdsSet.add(id));
        } else if (o.recipeId) {
          allIdsSet.add(o.recipeId);
        }
      });
      const allIds = Array.from(allIdsSet);
      const recipeMap: Record<string, Recipe> = { ...recipes };
      
      await Promise.all(allIds.map(async (id) => {
        if (!recipeMap[id]) {
          const rDoc = await getDoc(doc(db, 'recipes', id));
          if (rDoc.exists()) recipeMap[id] = { id: rDoc.id, ...rDoc.data() } as Recipe;
        }
      }));
      
      setRecipes(recipeMap);
      setLoading(false);
    }, (err) => {
      console.error('MyOrders snapshot error:', err);
      setLoading(false);
    });

    // 3. Snapshot for reviews of this user's orders
    const reviewsQuery = query(
      collection(db, 'reviews'),
      where('authorId', '==', user.userId)
    );

    const unsubscribeReviews = onSnapshot(reviewsQuery, (snap) => {
      const reviewMap: Record<string, Review> = {};
      snap.docs.forEach(doc => {
        const data = doc.data() as Review;
        if (data.orderId) {
          reviewMap[data.orderId] = { id: doc.id, ...data };
        }
      });
      setReviews(reviewMap);
    }, (err) => {
      console.error('Reviews snapshot error:', err);
    });

    return () => {
      unsubscribe();
      unsubscribeReviews();
    };
  }, [user]);

  // Group orders by weekId
  const weeks = (Array.from(new Set(orders.map(o => o.weekId))) as string[]).sort((a, b) => b.localeCompare(a));

  const getStatusDisplay = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return { 
          icon: <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-2 h-2 rounded-full bg-muted-foreground/50" />,
          label: 'Đang chờ', 
          color: 'text-muted-foreground bg-secondary',
        };
      case 'preparing':
        return { 
          icon: <Loader2 className="animate-spin text-primary" size={12} />,
          label: 'Đang làm', 
          color: 'text-primary bg-primary/10',
        };
      case 'ready':
        return { 
          icon: <motion.div animate={{ y: [0, -2, 0] }} transition={{ repeat: Infinity, duration: 0.6 }}><CircleCheckBig className="text-green-500" size={14} /></motion.div>,
          label: 'Sẵn sàng!', 
          color: 'text-green-600 bg-green-500/10 font-black',
        };
      case 'on_the_way':
        return { 
          icon: <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />,
          label: 'Đang đến', 
          color: 'text-blue-600 bg-blue-50',
        };
      case 'arrived':
        return { 
          icon: <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />,
          label: 'Đã đến', 
          color: 'text-indigo-600 bg-indigo-50',
        };
      case 'done':
        return { 
          icon: <CircleCheckBig className="text-muted-foreground/30" size={12} />,
          label: 'Hoàn thành', 
          color: 'text-muted-foreground bg-secondary',
        };
      case 'cancelled':
        return { 
          icon: <div className="w-2 h-2 rounded-full bg-destructive/50" />,
          label: 'Đã bị huỷ', 
          color: 'text-destructive bg-destructive/10 border-destructive/20 font-black',
        };
      default:
        return {
          icon: <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />,
          label: String(status),
          color: 'text-muted-foreground bg-secondary',
        };
    }
  };

  if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-primary" size={48} /></div>;

  const currentWeekId = weeks[weekIdx];
  let weekOrders = orders.filter(o => o.weekId === currentWeekId);
  
  // Filter logic for reviews page
  if (isReviewsPage) {
    weekOrders = weekOrders.filter(o => o.status === 'done');
    
    if (reviewFilter === 'unreviewed') {
      weekOrders = weekOrders.filter(o => !reviews[o.id!]);
    } else if (reviewFilter === 'reviewed') {
      weekOrders = weekOrders.filter(o => !!reviews[o.id!]);
    }
  }

  const weekNumber = currentWeekId?.split('-W')[1] || (currentWeekId as string)?.split('-')[1];

  return (
    <div className="h-full overflow-y-auto scrollbar-hide kid-page-content">
      <div className="max-w-[680px] mx-auto space-y-[2px]">
          <h1 className="text-[20px] font-semibold text-foreground">
            {isReviewsPage ? 'Lịch sử đánh giá' : 'Món Bé đã đặt'}
          </h1>
          <p className="text-[13px] font-normal text-muted-foreground">
            {isReviewsPage ? 'Xem lại những nhận xét của bé về các món ăn' : 'Hành trình khám phá ẩm thực của bé mỗi ngày'}
          </p>
        </div>

        <div className="max-w-[680px] mx-auto pb-20">
          {/* Week Selector - Sticky */}
          {weeks.length > 0 && (
            <div className="sticky top-0 z-[28] bg-background pb-6 pt-6">
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-center gap-4">
                  <button 
                    onClick={() => setWeekIdx(prev => Math.min(weeks.length - 1, prev + 1))}
                    disabled={weekIdx === weeks.length - 1}
                    className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-all shadow-sm"
                  >
                    <ChevronLeft size={20} />
                  </button>

                  <div className="flex items-center gap-2 bg-card px-6 py-2.5 rounded-xl shadow-sm border border-border font-black text-xs text-primary">
                    <Calendar size={16} />
                    <span className="uppercase tracking-widest">TUẦN {weekNumber}</span>
                  </div>

                  <button 
                    onClick={() => setWeekIdx(prev => Math.max(0, prev - 1))}
                    disabled={weekIdx === 0}
                    className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-all shadow-sm"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>

                {isReviewsPage && (
                  <div className="flex bg-secondary p-1 rounded-2xl max-w-sm mx-auto w-full">
                    {(['all', 'unreviewed', 'reviewed'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setReviewFilter(f)}
                        className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
                          reviewFilter === f 
                          ? 'bg-card text-primary shadow-sm' 
                          : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {f === 'all' && 'Tất cả'}
                        {f === 'unreviewed' && 'Chưa đánh giá'}
                        {f === 'reviewed' && 'Đã đánh giá'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-transparent to-background pointer-events-none translate-y-full" />
            </div>
          )}

          {weekOrders.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-24 text-center bg-card rounded-[32px] border border-border shadow-sm px-6 ${isReviewsPage && weeks.length > 0 ? 'mt-4': ''} ${!isReviewsPage ? 'mt-8' : ''}`}
              >
                <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-6 text-muted-foreground/30">
                  {isReviewsPage ? <Star size={40} /> : <Utensils size={40} />}
                </div>
              <h3 className="text-lg font-bold text-foreground">
                {isReviewsPage 
                  ? 'Chưa có món nào hoàn thành trong tuần này' 
                  : 'Bé chưa đặt món nào tuần này'
                }
              </h3>
              <p className="text-muted-foreground mt-1 mb-8 text-sm">
                {isReviewsPage 
                  ? 'Chỉ món đã hoàn thành mới có thể đánh giá nhé!' 
                  : 'Qua trang Đặt món để chọn nhé!'
                }
              </p>
              {!isReviewsPage && (
                <button 
                  onClick={() => navigate('/kids/order')}
                  className="px-8 py-3.5 rounded-2xl border-2 border-primary text-primary font-bold hover:bg-primary hover:text-primary-foreground transition-all text-sm"
                >
                  Đặt món ngay
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6 mt-3">
              <div className="space-y-5">
                {weekOrders.map(order => {
                  const orderRecipeIds = order.recipeIds || (order.recipeId ? [order.recipeId] : []);
                  const statusInfo = getStatusDisplay(order.status);
                  const dayLabel = { mon: 'Thứ Hai', tue: 'Thứ Ba', wed: 'Thứ Tư', thu: 'Thứ Năm', fri: 'Thứ Sáu' }[order.day];
                  const isActive = ['ready', 'on_the_way', 'arrived'].includes(order.status);
                  const review = reviews[order.id!];
                  const hasReview = !!review;

                    return (
                      <motion.div 
                        key={order.id}
                        layout
                        className={`bg-card rounded-[32px] border p-4 md:p-6 shadow-sm hover:shadow-md transition-all group overflow-hidden relative ${
                          isActive ? 'border-primary border-2' : 
                          order.status === 'cancelled' && order.cancelledBy === 'chef' ? 'border-destructive/30 bg-destructive/[0.02]' :
                          'border-border'
                        }`}
                      >
                        {order.status === 'cancelled' && order.cancelledBy === 'chef' && (
                          <div className="absolute top-0 right-0 left-0 h-1 bg-destructive/20" />
                        )}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex-1 flex items-center justify-between">
                          <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">{dayLabel}</span>
                          {isReviewsPage && (
                            <div>
                              {hasReview ? (
                                <div className="flex items-center gap-1 bg-secondary px-3 py-1.5 rounded-xl text-primary font-black text-[10px] uppercase tracking-wider w-fit">
                                  <Star size={12} className="fill-current" />
                                  ĐÃ ĐÁNH GIÁ
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 bg-secondary px-3 py-1.5 rounded-xl text-muted-foreground font-black text-[10px] uppercase tracking-wider w-fit">
                                  <Star size={12} className="fill-current" />
                                  CHƯA ĐÁNH GIÁ
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {!isReviewsPage && (
                          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${statusInfo.color}`}>
                            {statusInfo.icon}
                            <span className={`text-[10px] font-black uppercase tracking-wider`}>{statusInfo.label}</span>
                          </div>
                        )}
                      </div>

                      {orderRecipeIds.map((rid, idx) => {
                        const recipe = recipes[rid];
                        return (
                          <div key={rid + idx} className="mb-6 last:mb-0">
                            <div className="flex gap-5">
                              <div className={`w-20 h-20 rounded-2xl overflow-hidden bg-secondary flex-shrink-0 border border-border ${order.status === 'cancelled' ? 'grayscale opacity-50' : ''}`}>
                                {recipe?.imageUrl ? (
                                  <img src={getOptimizedUrl(recipe.imageUrl, 200)} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-secondary/50"><Utensils size={28} /></div>
                                )}
                              </div>
                              <div className="flex flex-col justify-center min-w-0 flex-1">
                                <h4 className={`font-medium text-foreground text-base mb-1 truncate leading-tight ${order.status === 'cancelled' ? 'text-muted-foreground' : ''}`}>{recipe?.title || 'Đang tải...'}</h4>
                                {(() => {
                                  const subtitle = recipe?.shortDescription || recipe?.description?.slice(0, 60) || '';
                                  if (!subtitle) return null;
                                  return (
                                    <p className="text-[11px] text-muted-foreground line-clamp-1 mb-1 font-medium italic">
                                      {subtitle}
                                    </p>
                                  );
                                })()}
                                <p className="text-[12px] text-muted-foreground">
                                  {(() => {
                                    const itemTime = order.itemAddedAt?.[rid] || order.createdAt;
                                    const date = itemTime?.toDate ? itemTime.toDate() : new Date();
                                    return format(date, 'HH:mm - dd/MM', { locale: vi });
                                  })()}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {order.status === 'cancelled' && order.cancelledBy === 'chef' && (
                        <div className="mt-4 space-y-3">
                          <div className="p-4 rounded-2xl bg-destructive/[0.03] border border-destructive/10">
                            <div className="text-[11px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Lý do huỷ món</div>
                            <div className="text-sm text-destructive font-bold italic leading-relaxed">
                              "{order.cancelReason || 'Đầu bếp chưa ghi lý do'}"
                            </div>
                            {order.cancelledAt && (
                              <div className="text-[10px] text-muted-foreground mt-2 font-medium">
                                Huỷ lúc {format(order.cancelledAt.toDate(), 'HH:mm', { locale: vi })}
                              </div>
                            )}
                          </div>
                          <p className="text-[12px] text-muted-foreground/60 italic font-medium px-1">
                            Đầu bếp xin lỗi vì sự bất tiện này! 🙏
                          </p>
                        </div>
                      )}

                      {isReviewsPage && hasReview && (
                        <div className="mt-4 pt-4 border-t border-border">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star 
                                key={star} 
                                size={20} 
                                className={star <= (review?.rating || 0) ? 'text-primary fill-primary' : 'text-muted/20 fill-muted/5'} 
                              />
                            ))}
                          </div>
                          {review.comment && (
                            <div className="p-3.5 bg-primary/5 rounded-2xl text-[13px] text-foreground/80 font-medium italic border border-primary/10 truncate mt-4 mb-4">
                              "{review.comment}"
                            </div>
                          )}

                          {review.imageUrls && review.imageUrls.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {review.imageUrls.slice(0, 2).map((url, i) => {
                                const isLastShow = i === 1 && review.imageUrls!.length > 2;
                                const remainingCount = review.imageUrls!.length - 2;
                                
                                return (
                                  <div
                                    key={i}
                                    className="relative w-16 h-16 rounded-xl overflow-hidden border border-border shadow-sm"
                                  >
                                    <img src={getOptimizedUrl(url, 200)} className="w-full h-full object-cover" />
                                    {isLastShow && (
                                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-black text-xs">
                                        +{remainingCount}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {(order.status === 'done' || isReviewsPage) && (
                        <div className="mt-6">
                           <button 
                            onClick={() => setReviewingMeal({ 
                              recipes: orderRecipeIds.map(id => recipes[id]).filter(Boolean), 
                              orderId: order.id!, 
                              orderDate: order.createdAt.toDate(),
                              orderDay: dayLabel
                            })}
                            className={`w-full h-12 rounded-2xl text-[11px] font-black tracking-widest transition-all border-2 flex items-center justify-center gap-2 ${
                              hasReview 
                              ? 'border-border text-muted-foreground hover:bg-secondary' 
                              : 'border-primary text-primary hover:bg-primary hover:text-primary-foreground shadow-lg shadow-primary-shadow/30 uppercase'
                            }`}
                          >
                            {hasReview ? (
                              <>
                                <Pencil size={14} />
                                Xem lại đánh giá
                              </>
                            ) : (
                              <>
                                <Star size={14} className="fill-current" />
                                ĐÁNH GIÁ NGAY
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {isActive && (
                        <div className="mt-4 pt-4 border-t border-border space-y-4">
                          <div className="h-px bg-border w-full" />
                          
                          {/* 3. Thông tin bếp */}
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <div className={`w-2 h-2 rounded-full ${isKitchenOpen ? 'bg-green-500 pulse' : 'bg-muted-foreground/20'}`} />
                              <span className={`text-[12px] font-bold ${isKitchenOpen ? 'text-green-600' : 'text-muted-foreground'}`}>
                                {isKitchenOpen ? 'Bếp đang mở' : 'Bếp đã đóng'}
                              </span>
                              <span className="text-border">·</span>
                              <span className="text-[12px] font-medium text-muted-foreground">
                                Giờ phục vụ: {kitchenConfig?.openTime} – {kitchenConfig?.closeTime}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-3">
                            {/* 4. Nút CTA cam */}
                            {order.status === 'ready' && (
                              <button
                                disabled={!isKitchenOpen}
                                onClick={() => updateOrderStatus(order.id!, 'on_the_way')}
                                className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all flex items-center justify-center gap-2 ${
                                  isKitchenOpen 
                                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary-shadow/30 hover:scale-[1.01] active:scale-[0.98]' 
                                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                                }`}
                              >
                                Bé đang đến lấy!
                              </button>
                            )}

                            {order.status === 'on_the_way' && (
                              <button
                                disabled={!isKitchenOpen}
                                onClick={() => updateOrderStatus(order.id!, 'arrived')}
                                className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all flex items-center justify-center gap-2 ${
                                  isKitchenOpen 
                                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary-shadow/30 hover:scale-[1.01] active:scale-[0.98]' 
                                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                                }`}
                              >
                                <MapPin size={16} />
                                Bé đã tới bếp!
                              </button>
                            )}

                            {/* 5. Link phụ */}
                            {kitchenConfig?.mapsShareLink && (
                              <button
                                onClick={() => window.open(kitchenConfig.mapsShareLink, '_blank')}
                                className="text-primary font-bold text-xs flex items-center justify-center gap-2 hover:underline py-1"
                              >
                                <Navigation size={14} />
                                Xem đường đến bếp
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      {/* Photo View Slider */}
      <AnimatePresence>
        {previewImages && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="fixed inset-0 z-[200] flex flex-col bg-background/95 backdrop-blur-xl" 
            onClick={() => setPreviewImages(null)}
          >
            {/* Header with counter */}
            <div className="relative z-10 flex items-center justify-center p-6 w-full">
              <div className="bg-black/20 backdrop-blur-md px-4 py-1.5 rounded-full text-white text-sm font-black tracking-widest border border-white/10">
                {previewIndex + 1} / {previewImages.length}
              </div>
            </div>

            {/* Slider Content */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
              <AnimatePresence mode="wait" initial={false} custom={direction}>
                <motion.div
                  key={previewIndex}
                  custom={direction}
                  variants={{
                    enter: (dir: number) => ({ x: dir > 0 ? '100%' : dir < 0 ? '-100%' : 0, opacity: 0, scale: 0.9 }),
                    center: { x: 0, opacity: 1, scale: 1 },
                    exit: (dir: number) => ({ x: dir > 0 ? '-100%' : dir < 0 ? '100%' : 0, opacity: 0, scale: 0.9 }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.x > 50 && previewIndex > 0) {
                      setDirection(-1);
                      setPreviewIndex(prev => prev - 1);
                    } else if (info.offset.x < -50 && previewIndex < previewImages.length - 1) {
                      setDirection(1);
                      setPreviewIndex(prev => prev + 1);
                    }
                  }}
                  className="w-full h-full max-w-4xl p-6 flex items-center justify-center"
                  onClick={e => e.stopPropagation()}
                >
                  <img 
                    src={getOptimizedUrl(previewImages[previewIndex], 1200)} 
                    className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl select-none pointer-events-none" 
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Thumbnails Footer */}
            <div className="p-8 flex justify-center gap-3 overflow-x-auto scrollbar-hide w-full max-w-lg mx-auto">
              {previewImages.map((url, i) => (
                <motion.button
                  key={i}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => { 
                    e.stopPropagation();
                    setDirection(i > previewIndex ? 1 : -1);
                    setPreviewIndex(i); 
                  }}
                  className={`relative w-12 h-12 rounded-xl overflow-hidden border-2 transition-all shrink-0 ${
                    previewIndex === i ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-40'
                  }`}
                >
                  <img src={getOptimizedUrl(url, 200)} className="w-full h-full object-cover" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Review Modal */}
      <AnimatePresence>
        {reviewingMeal && (
          <ReviewModal 
            recipes={reviewingMeal.recipes}
            orderId={reviewingMeal.orderId}
            orderDate={reviewingMeal.orderDate}
            orderDay={reviewingMeal.orderDay}
            user={user!}
            existingReview={reviews[reviewingMeal.orderId]}
            onClose={() => setReviewingMeal(null)}
            onSuccess={() => setReviewingMeal(null)}
            onImageClick={(images, index) => {
              setDirection(0);
              setPreviewImages(images);
              setPreviewIndex(index);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
