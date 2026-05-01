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
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className="bg-card rounded-[32px] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl relative z-10 flex flex-col"
      >
        {/* Header with Image */}
        <div className="relative h-[300px] shrink-0">
          {recipe.imageUrl ? (
            <img 
              src={getOptimizedUrl(recipe.imageUrl, 800)} 
              alt={recipe.title} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-primary/30">
              <ChefHat size={80} />
            </div>
          )}
          <button 
            onClick={onClose}
            className="modal-close-btn bg-background/50 text-foreground"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar">
          <div className="flex flex-wrap gap-2 mb-4">
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${
              recipe.isPublished ? 'bg-green-500 text-white' : 'bg-muted-foreground text-foreground-inverse'
            }`}>
              {recipe.isPublished ? 'Công khai' : 'Bản nháp'}
            </span>
            {recipe.tags?.map(tag => (
              <span key={tag} className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded-full uppercase border border-primary/20">
                {tag}
              </span>
            ))}
          </div>

          <h2 className="text-[28px] font-bold text-foreground mb-2 leading-tight">{recipe.title}</h2>
          
          <div className="flex items-center gap-3 mb-6 text-muted-foreground">
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star 
                  key={i} 
                  size={16} 
                  className={i < Math.round(recipe.avgRating || 0) ? "fill-orange-400 text-orange-400" : "text-muted/20"} 
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">{recipe.avgRating?.toFixed(1) || '0.0'}</span>
              <span className="text-sm font-medium text-muted-foreground">({recipe.totalRatings || 0} đánh giá)</span>
            </div>
            <div className="flex items-center gap-2 border-l border-border pl-3">
              <Heart size={16} className="fill-rose-500 text-rose-500" />
              <span className="text-sm font-bold text-foreground">{recipe.favoriteCount || 0}</span>
              <span className="text-sm font-medium text-muted-foreground">yêu thích</span>
            </div>
          </div>

          <div className="h-px bg-border mb-8" />

          {/* Ingredients */}
          <section className="mb-10">
            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-primary rounded-full" />
              Nguyên liệu
            </h3>
            <ul className="space-y-4">
              {recipe.ingredients.map((ing, idx) => (
                <li key={idx} className="flex items-start gap-4 text-foreground/80 group">
                  <div className="w-2 h-2 rounded-full bg-primary/20 mt-2 shrink-0 group-hover:bg-primary transition-colors" />
                  <span className="text-[15px]">{ing}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Steps */}
          <section className="mb-10">
            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-primary rounded-full" />
              Cách làm
            </h3>
            <div className="space-y-8 relative">
              <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-primary/10" />
              {recipe.steps.map((step, idx) => (
                <div key={idx} className="flex gap-6 relative">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0 text-sm shadow-lg shadow-primary-shadow/30 z-10">
                    {idx + 1}
                  </div>
                  <p className="text-foreground/80 leading-relaxed text-[15px] pt-1">
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Reviews */}
          {reviews.length > 0 && (
            <section className="mt-12">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-primary rounded-full" />
                  Đánh giá gần đây
                </h3>
                <Link 
                  to="/chef/reviews" 
                  className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
                >
                  Tất cả đánh giá <ArrowRight size={14} />
                </Link>
              </div>
              <div className="space-y-4">
                {reviews.map(review => (
                  <div key={review.id} className="bg-secondary p-5 rounded-3xl border border-border/50">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-bold text-sm text-foreground/80">{review.authorName}</span>
                      <div className="flex gap-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={12} className={i < (review.rating || 0) ? "fill-orange-400 text-orange-400" : "text-muted/20"} />
                        ))}
                      </div>
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed italic">"{review.comment}"</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border bg-card shrink-0">
          <button 
            onClick={() => onEdit(recipe.id!)}
            className="w-full py-4 border-2 border-primary text-primary font-bold rounded-2xl hover:bg-primary/5 transition-all flex items-center justify-center gap-2 group"
          >
            <Edit3 size={20} className="group-hover:scale-110 transition-transform" />
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
            <h1 className="text-[20px] font-semibold text-foreground">Thư viện Công thức</h1>
            <p className="text-[13px] font-normal text-muted-foreground">Quản lý các món ăn dinh dưỡng cho bé</p>
          </div>
          <Link 
            to="/chef/recipes/new"
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-3 rounded-2xl shadow-lg shadow-primary-shadow/30 hover:opacity-90 transition-all"
          >
            <Plus size={20} />
            Thêm công thức
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input 
              type="text" 
              placeholder="Tìm kiếm theo tên..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-secondary border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground"
            />
          </div>
          <div className="flex items-center gap-4">
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-3 bg-secondary border border-border rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
            >
              <option value="newest">Mới nhất</option>
              <option value="popular">Phổ biến nhất ❤️</option>
            </select>
            <div className="h-8 w-px bg-border hidden md:block" />
            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
              <Filter size={18} className="text-muted-foreground shrink-0" />
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                    selectedTag === tag 
                      ? 'bg-primary/20 text-primary' 
                      : 'text-muted-foreground hover:bg-secondary'
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
            <AnimatePresence>
              {filteredRecipes.map((recipe) => (
              <motion.div
                key={recipe.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => setViewingRecipe(recipe)}
                className="group bg-card rounded-3xl border border-border overflow-hidden shadow-sm hover:shadow-xl hover:scale-[1.01] cursor-pointer transition-all duration-300 flex flex-col"
              >
                <div className="relative aspect-video bg-secondary overflow-hidden">
                  {recipe.imageUrl ? (
                    <img 
                      src={getOptimizedUrl(recipe.imageUrl, 400)} 
                      alt={recipe.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/30 bg-primary/5">
                      <ChefHat size={32} className="mb-1" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Chưa có ảnh</span>
                    </div>
                  )}
                  <div className="absolute top-4 left-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${
                      recipe.isPublished ? 'bg-green-500 text-white' : 'bg-muted-foreground text-foreground-inverse'
                    }`}>
                      {recipe.isPublished ? 'Công khai' : 'Bản nháp'}
                    </span>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors">{recipe.title}</h3>
                  </div>
                  
                  <div className="flex items-center gap-1 mb-4">
                    <div className="flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded-lg">
                      <Star size={12} className="fill-orange-400 text-orange-400" />
                      <span className="text-xs font-bold text-primary">{recipe.avgRating?.toFixed(1) || '0.0'}</span>
                    </div>
                    {recipe.favoriteCount !== undefined && (
                      <div className="flex items-center gap-1 bg-rose-500/10 px-2 py-0.5 rounded-lg">
                        <Heart size={10} className="fill-rose-500 text-rose-500" />
                        <span className="text-xs font-bold text-rose-600">{recipe.favoriteCount}</span>
                      </div>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">({recipe.totalRatings || 0} đánh giá)</span>
                  </div>

                  <div className="mt-auto pt-4 flex items-center justify-between border-t border-border">
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Link 
                        to={`/chef/recipes/${recipe.id}`}
                        className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                        title="Chỉnh sửa"
                      >
                        <Edit3 size={18} />
                      </Link>
                      <button 
                        onClick={() => setDeleteConfirm(recipe.id!)}
                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all"
                        title="Xóa"
                      >
                        <Trash2 size={18} />
                      </button>
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
        icon="🗑️"
        title="Xác nhận xóa?"
        message="Hành động này không thể hoàn tác. Công thức sẽ bị xóa vĩnh viễn khỏi thư viện."
        confirmText="Xóa ngay"
        cancelText="Hủy"
        confirmStyle="danger"
      />
    </div>
  );
}
