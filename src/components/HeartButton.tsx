import React, { memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart } from 'lucide-react';
import { useFavoritesContext } from '../context/FavoritesContext';

interface HeartButtonProps {
  recipeId: string;
  size?: number;
}

const HeartButton: React.FC<HeartButtonProps> = memo(({ recipeId, size = 30 }) => {
  const { isFavorite, toggleFavorite } = useFavoritesContext();
  const fav = isFavorite(recipeId);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(recipeId);
  };

  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={handleToggle}
      className={`relative flex items-center justify-center rounded-full bg-card shadow-sm border transition-all ${
        fav ? 'border-destructive/20' : 'border-border text-muted-foreground/30'
      }`}
      style={{ width: size, height: size }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={fav ? 'filled' : 'outline'}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 10 }}
        >
          {fav ? (
            <Heart size={size * 0.55} className="fill-destructive text-destructive" />
          ) : (
            <Heart size={size * 0.55} />
          )}
        </motion.div>
      </AnimatePresence>
    </motion.button>
  );
});

export default HeartButton;
