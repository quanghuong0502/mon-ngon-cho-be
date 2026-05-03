/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  orderBy, 
  deleteDoc,
  doc,
  where,
  limit
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Recipe } from '../../types';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useNavigate } from 'react-router-dom';
import { getOptimizedUrl } from '../../lib/cloudinary';
import { 
  Plus, 
  Search, 
  Filter, 
  Star, 
  Trash2, 
  Edit3, 
  Loader2,
  AlertTriangle,
  X,
  ChefHat,
  MessageSquare,
  ArrowRight,
  Heart,
  SortAsc
} from 'lucide-react';
import { Review } from '../../types';
import ConfirmModal from '../../components/ConfirmModal';

interface RecipeDetailModalProps {
  recipe: Recipe;
  onClose: () => void;
  onEdit: (id: string) => void;
}

function RecipeDetailModal({ recipe, onClose, onEdit }: RecipeDetailModalProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const q = query(
          collection(db, 'reviews'),
          where('recipeId', '==', recipe.id),
          orderBy('createdAt', 'desc'),
          limit(3)
        );
        const snap = await getDocs(q);
        setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as Review)));
      } catch (err) {
        console.error('Error fetching reviews:', err);
      } finally {
        setLoadingReviews(false);
      }
    };
    fetchReviews();
  }, [recipe.id]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className="bg-card rounded-[24px] md:rounded-[32px] w-full max-w-2xl max-h-[92vh] md:max-h-[90vh] overflow-hidden shadow-2xl relative z-10 flex flex-col"
      >
        {/* Header with Image */}
        <div className="relative h-[220px] md:h-[300px] shrink-0">
          {recipe.imageUrl ? (
            <img 
              src={getOptimizedUrl(recipe.imageUrl, 800)} 
              alt={recipe.title} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-primary/30">
              <ChefHat size={60} className="md:w-20 md:h-20" />
            </div>
          )}
          <button 
            onClick={onClose}
            className="modal-close-btn bg-background/50 text-foreground w-8 h-8 md:w-10 md:h-10 flex items-center justify-center"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 md:px-8 py-5 md:py-8 custom-scrollbar">
          <div className="flex flex-wrap gap-1.5 md:gap-2 mb-3 md:mb-4">
            <span className={`px-2 md:px-3 py-1 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest shadow-sm ${
              recipe.isPublished ? 'bg-green-500 text-white' : 'bg-muted-foreground text-white'
            }`}>
              {recipe.isPublished ? 'Công khai' : 'Nháp'}
            </span>
            {recipe.tags?.map(tag => (
              <span key={tag} className="px-2 md:px-3 py-1 bg-primary/10 text-primary text-[9px] md:text-[10px] font-bold rounded-full uppercase border border-primary/20">
                {tag}
              </span>
            ))}
          </div>

          <h2 className="text-[22px] md:text-[28px] font-bold text-foreground mb-1.5 md:mb-2 leading-tight">{recipe.title}</h2>
          
          <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-4 md:mb-6 text-muted-foreground">
            <div className="flex items-center gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star 
                  key={i} 
                  size={14} 
                  className={i < Math.round(recipe.avgRating || 0) ? "fill-orange-400 text-orange-400" : "text-muted/20"} 
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs md:text-sm font-bold text-foreground">{recipe.avgRating?.toFixed(1) || '0.0'}</span>
              <span className="text-xs md:text-sm font-medium text-muted-foreground">({recipe.totalRatings || 0})</span>
            </div>
            <div className="flex items-center gap-1.5 border-l border-border pl-2 md:pl-3">
              <Heart size={14} className="fill-rose-500 text-rose-500" />
              <span className="text-xs md:text-sm font-bold text-foreground">{recipe.favoriteCount || 0}</span>
            </div>
          </div>

          <div className="h-px bg-border mb-6 md:mb-8" />

          {/* Ingredients */}
          <section className="mb-8 md:mb-10">
            <h3 className="text-base md:text-lg font-bold text-foreground mb-3 md:mb-4 flex items-center gap-2">
              <span className="w-1 md:w-1.5 h-5 md:h-6 bg-primary rounded-full" />
              Nguyên liệu
            </h3>
            <ul className="space-y-3 md:space-y-4">
              {recipe.ingredients.map((ing, idx) => (
                <li key={idx} className="flex items-start gap-3 md:gap-4 text-foreground/80 group">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/20 mt-1.5 md:mt-2 shrink-0 group-hover:bg-primary transition-colors" />
                  <span className="text-[14px] md:text-[15px]">{ing}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Steps */}
          <section className="mb-8 md:mb-10">
            <h3 className="text-base md:text-lg font-bold text-foreground mb-3 md:mb-4 flex items-center gap-2">
              <span className="w-1 md:w-1.5 h-5 md:h-6 bg-primary rounded-full" />
              Cách làm
            </h3>
            <div className="space-y-6 md:space-y-8 relative">
              <div className="absolute left-3 md:left-4 top-4 bottom-4 w-0.5 bg-primary/10" />
              {recipe.steps.map((step, idx) => (
                <div key={idx} className="flex gap-4 md:gap-6 relative">
                  <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0 text-xs md:text-sm shadow-lg shadow-primary-shadow/30 z-10">
                    {idx + 1}
                  </div>
                  <p className="text-foreground/80 leading-relaxed text-[14px] md:text-[15px] pt-0.5 md:pt-1">
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Reviews */}
          {reviews.length > 0 && (
            <section className="mt-8 md:mt-12">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h3 className="text-base md:text-lg font-bold text-foreground flex items-center gap-2">
                  <span className="w-1 md:w-1.5 h-5 md:h-6 bg-primary rounded-full" />
                  Đánh giá
                </h3>
                <Link 
                  to="/chef/reviews" 
                  className="text-[11px] font-bold text-primary flex items-center gap-1 hover:underline"
                >
                  Tất cả <ArrowRight size={12} />
                </Link>
              </div>
              <div className="space-y-3 md:space-y-4">
                {reviews.map(review => (
                  <div key={review.id} className="bg-secondary/40 p-4 md:p-5 rounded-2xl md:rounded-3xl border border-border/50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-[13px] md:text-sm text-foreground/80">{review.authorName}</span>
                      <div className="flex gap-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={10} className={i < (review.rating || 0) ? "fill-orange-400 text-orange-400" : "text-muted/20"} />
                        ))}
                      </div>
                    </div>
                    <p className="text-muted-foreground text-[13px] md:text-sm leading-relaxed italic line-clamp-2 md:line-clamp-none">"{review.comment}"</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 md:p-6 border-t border-border bg-card shrink-0">
          <button 
            onClick={() => onEdit(recipe.id!)}
            className="w-full py-3 md:py-4 border-2 border-primary text-primary font-bold rounded-xl md:rounded-2xl hover:bg-primary/5 transition-all flex items-center justify-center gap-2 group text-sm md:text-base"
          >
            <Edit3 size={18} className="md:w-5 md:h-5 group-hover:scale-110 transition-transform" />
            Chỉnh sửa công thức
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function RecipeList() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  const [sortBy, setSortBy] = useState<'newest' | 'popular'>('newest');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const navigate = useNavigate();

  useLockBodyScroll(!!deleteConfirm || !!viewingRecipe);

  const fetchRecipes = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'recipes'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      setRecipes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Recipe)));
    } catch (error) {
      console.error('Error fetching recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipes();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'recipes', id));
      setRecipes(prev => prev.filter(r => r.id !== id));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting recipe:', error);
    }
  };

  const allTags = ['All', ...new Set(recipes.flatMap(r => r.tags || []))];

  const filteredRecipes = recipes.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = selectedTag === 'All' || r.tags?.includes(selectedTag);
    return matchesSearch && matchesTag;
  }).sort((a, b) => {
    if (sortBy === 'popular') {
      return (b.favoriteCount || 0) - (a.favoriteCount || 0);
    }
    return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
  });

  return (
    <div className="chef-page-content h-full overflow-y-auto scrollbar-hide">
      <div className="space-y-6 bg-background pb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          <div className="space-y-[2px]">
            <h1 className="text-[18px] md:text-[20px] font-semibold text-foreground">Thư viện Công thức</h1>
            <p className="text-[12px] md:text-[13px] font-normal text-muted-foreground">Quản lý các món ăn dinh dưỡng cho bé</p>
          </div>
          <Link 
            to="/chef/recipes/new"
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold px-5 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-2xl shadow-lg shadow-primary-shadow/30 hover:opacity-90 transition-all text-sm md:text-base"
          >
            <Plus size={18} className="md:w-5 md:h-5" />
            Thêm công thức
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-2 bg-card p-4 rounded-xl md:rounded-2xl border border-border shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50" size={16} />
            <input 
              type="text" 
              placeholder="Tìm món ăn..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-secondary/50 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all text-sm text-foreground"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth">
            <div className="flex items-center gap-2 shrink-0">
              <select 
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="pl-3 pr-8 py-2.5 bg-secondary/50 border border-border/50 rounded-xl text-[13px] font-semibold focus:outline-none transition-all text-foreground shrink-0 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[position:right_8px_center] bg-no-repeat"
              >
                <option value="newest">Mới nhất</option>
                <option value="popular">Phổ biến</option>
              </select>
            </div>
            <div className="h-4 w-[1px] bg-border/60 shrink-0 mx-1" />
            <div className="flex items-center gap-2 shrink-0">
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-4 py-2 rounded-xl text-[12px] font-semibold whitespace-nowrap transition-all border ${
                    selectedTag === tag 
                      ? 'bg-primary text-primary-foreground border-primary' 
                      : 'bg-secondary/50 text-muted-foreground border-border/50 hover:bg-secondary'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="animate-spin text-primary" size={40} />
            <p className="text-muted-foreground font-medium">Đang tải công thức...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
            <AnimatePresence>
              {filteredRecipes.map((recipe) => (
              <motion.div
                key={recipe.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => setViewingRecipe(recipe)}
                className="group bg-card rounded-2xl md:rounded-3xl border border-border overflow-hidden shadow-sm hover:shadow-md cursor-pointer transition-all duration-300 flex flex-col relative"
              >
                {/* Action buttons in corner */}
                <div 
                  className="absolute top-2 right-2 flex gap-1 z-20 opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link 
                    to={`/chef/recipes/${recipe.id}`}
                    className="p-2 bg-background/80 backdrop-blur-md text-foreground hover:text-primary rounded-full shadow-sm transition-all"
                  >
                    <Edit3 size={14} />
                  </Link>
                  <button 
                    onClick={() => setDeleteConfirm(recipe.id!)}
                    className="p-2 bg-background/80 backdrop-blur-md text-foreground hover:text-destructive rounded-full shadow-sm transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className={`relative bg-secondary overflow-hidden ${recipe.imageUrl ? 'aspect-video' : 'h-[120px]'}`}>
                  {recipe.imageUrl ? (
                    <img 
                      src={getOptimizedUrl(recipe.imageUrl, 400)} 
                      alt={recipe.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/20 bg-primary/5">
                      <ChefHat size={24} className="mb-1" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Chưa có ảnh</span>
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest shadow-sm ${
                      recipe.isPublished ? 'bg-green-500 text-white' : 'bg-muted-foreground text-white'
                    }`}>
                      {recipe.isPublished ? 'Công khai' : 'Nháp'}
                    </span>
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col gap-2">
                  <div className="space-y-1">
                    <h3 className="font-bold text-[15px] text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                      {recipe.title}
                    </h3>
                    
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Star size={12} className="fill-orange-400 text-orange-400" />
                        <span className="text-[12px] font-bold text-foreground/80">{recipe.avgRating?.toFixed(1) || '0.0'}</span>
                        <span className="text-[11px] text-muted-foreground">({recipe.totalRatings || 0})</span>
                      </div>
                      <div className="w-[1px] h-3 bg-border" />
                      <div className="flex items-center gap-1">
                        <Heart size={12} className="fill-rose-500 text-rose-500" />
                        <span className="text-[12px] font-bold text-foreground/80">{recipe.favoriteCount || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>

      <AnimatePresence>
        {viewingRecipe && (
          <RecipeDetailModal 
            recipe={viewingRecipe}
            onClose={() => setViewingRecipe(null)}
            onEdit={(id) => {
              setViewingRecipe(null);
              navigate(`/chef/recipes/${id}`);
            }}
          />
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        icon={<Trash2 size={24} className="text-destructive" />}
        title="Xác nhận xóa?"
        message="Hành động này không thể hoàn tác. Công thức sẽ bị xóa vĩnh viễn khỏi thư viện."
        confirmText="Xóa ngay"
        cancelText="Hủy"
        confirmStyle="danger"
      />
    </div>
  );
}
