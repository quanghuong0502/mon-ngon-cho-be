import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Heart, Star, ChevronRight, ChefHat, Loader2 } from 'lucide-react';
import { Recipe, User } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import RecipeModal from '../../components/RecipeModal';
import HeartButton from '../../components/HeartButton';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { getOptimizedUrl } from '../../lib/cloudinary';
import { useFavoritesContext } from '../../context/FavoritesContext';

export default function Favorites() {
  const { favorites, loaded: favoritesLoaded } = useFavoritesContext();
  const navigate = useNavigate();
  const [favoriteRecipes, setFavoriteRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Initial fetch of recipes
  useEffect(() => {
    if (!favoritesLoaded) return;

    const fetchInitialRecipes = async () => {
      if (favorites.length === 0) {
        setFavoriteRecipes([]);
        setLoading(false);
        setIsInitialLoad(false);
        return;
      }

      try {
        const recipesQuery = query(
          collection(db, 'recipes'),
          where('__name__', 'in', favorites.slice(0, 30))
        );
        const rSnap = await getDocs(recipesQuery);
        const recipes = rSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recipe));
        
        // Maintain order based on current favorites context
        const sortedRecipes = favorites
          .map(id => recipes.find(r => r.id === id))
          .filter(Boolean) as Recipe[];
          
        setFavoriteRecipes(sortedRecipes);
      } catch (err) {
        console.error('Error fetching favorites:', err);
      } finally {
        setLoading(false);
        setIsInitialLoad(false);
      }
    };

    if (isInitialLoad) {
      fetchInitialRecipes();
    }
  }, [favoritesLoaded, favorites, isInitialLoad]);

  // Synchronize favoritesRecipes with favorites context (local filtering)
  useEffect(() => {
    if (isInitialLoad) return;

    // Filter out recipes that are no longer in favorites
    setFavoriteRecipes(prev => {
      const filtered = prev.filter(r => favorites.includes(r.id!));
      
      // If we have new IDs that we don't have recipe data for, we would need to fetch them
      // but on this page we mainly handle removals. For simplicity, we just sync removals here.
      if (filtered.length !== favorites.length && favorites.length > 0) {
        // Find missing IDs - this might happen if user favorites something 
        // in a modal while ON this page
        const existingIds = filtered.map(r => r.id);
        const missingIds = favorites.filter(id => !existingIds.includes(id));
        
        if (missingIds.length > 0) {
          // Trigger a re-load if items were added
          setIsInitialLoad(true);
        }
      }
      
      return filtered;
    });
  }, [favorites, isInitialLoad]);

  if (loading || !favoritesLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto kid-page-content">
      <header className="flex items-center justify-between mb-8">
        <div className="flex-1">
          <h1 className="text-[22px] font-black text-foreground tracking-tight">Món bé thích</h1>
          <p className="text-[13px] text-muted-foreground font-medium mt-0.5">Những món bé thích</p>
        </div>
        <AnimatePresence>
          {favoriteRecipes.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="bg-accent text-accent-foreground px-4 py-2 rounded-2xl text-[12px] font-black uppercase tracking-widest border border-accent/20 shadow-sm"
            >
              {favoriteRecipes.length} món
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <AnimatePresence mode="wait">
        {favoriteRecipes.length === 0 ? (
          <motion.div 
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center justify-center py-24 text-center bg-card rounded-[32px] border border-border shadow-sm px-6"
          >
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-6 text-primary">
              <Heart size={40} className="fill-primary/20" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Bé chưa thích món nào</h3>
            <p className="text-muted-foreground mt-1 mb-8 text-sm max-w-[240px] mx-auto leading-relaxed">
              Khám phá thực đơn để tìm món yêu thích nhé!
            </p>
            <button 
              onClick={() => navigate('/kids/order')}
              className="px-8 py-3.5 rounded-2xl border-2 border-primary text-primary font-bold hover:bg-primary hover:text-primary-foreground transition-all text-sm active:scale-95"
            >
              Đến thực đơn ngay
            </button>
          </motion.div>
        ) : (
          <motion.div 
            key="grid"
            className="grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <AnimatePresence>
              {favoriteRecipes.map((recipe) => (
                <motion.div
                  layout
                  key={recipe.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ 
                    layout: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 }
                  }}
                  className="bg-card rounded-[32px] border border-border shadow-sm overflow-hidden hover:shadow-xl transition-all cursor-pointer group flex flex-col h-full"
                  onClick={() => setSelectedRecipe(recipe)}
                >
                  <div className="relative aspect-square w-full shrink-0 overflow-hidden">
                    {recipe.imageUrl ? (
                      <img 
                        src={getOptimizedUrl(recipe.imageUrl, 400)} 
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                        referrerPolicy="no-referrer"
                        alt={recipe.title}
                      />
                    ) : (
                      <div className="w-full h-full bg-secondary flex items-center justify-center text-muted-foreground">
                        <ChefHat size={40} />
                      </div>
                    )}
                    <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
                      <div className="drop-shadow-lg">
                        <HeartButton 
                          recipeId={recipe.id!} 
                          size={32} 
                        />
                      </div>
                    </div>
                  </div>
                  <div className="p-4 md:p-5 flex flex-col flex-1">
                    <h4 className="text-[15px] md:text-[16px] font-bold text-foreground line-clamp-1 mb-2">
                      {recipe.title.charAt(0).toUpperCase() + recipe.title.slice(1).toLowerCase()}
                    </h4>
                    <div className="mt-auto flex items-center justify-between text-[10px] md:text-[11px] font-black uppercase tracking-widest">
                      <div className="flex items-center gap-1.5 text-primary">
                        <Star 
                      size={16} 
                      className={`text-primary fill-primary`}
                      strokeWidth={1}
                    />
                        <span>{recipe.avgRating?.toFixed(1) || '5.0'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Heart size={16} className="fill-destructive text-destructive" />
                        <span>{recipe.favoriteCount || 0}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <RecipeModal 
        recipe={selectedRecipe} 
        onClose={() => setSelectedRecipe(null)} 
      />
    </div>
  );
}
