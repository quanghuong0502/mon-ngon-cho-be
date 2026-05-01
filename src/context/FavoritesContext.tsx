import React, { createContext, useContext } from 'react';
import { useFavorites } from '../hooks/useFavorites';

interface FavoritesContextType {
  favorites: string[];
  toggleFavorite: (recipeId: string) => Promise<void>;
  isFavorite: (recipeId: string) => boolean;
  loaded: boolean;
}

const FavoritesContext = createContext<FavoritesContextType | null>(null);

export const FavoritesProvider: React.FC<{ userId: string | undefined; children: React.ReactNode }> = ({ userId, children }) => {
  const favData = useFavorites(userId);
  return (
    <FavoritesContext.Provider value={favData}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavoritesContext = () => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavoritesContext must be used within a FavoritesProvider');
  }
  return context;
};
