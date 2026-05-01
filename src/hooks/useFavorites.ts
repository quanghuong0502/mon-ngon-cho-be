import { useState, useEffect, useCallback } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove, getDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'react-hot-toast';

export const useFavorites = (userId: string | undefined) => {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setFavorites([]);
      setLoaded(true);
      return;
    }
    
    const fetchFavorites = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          setFavorites(userDoc.data()?.favorites || []);
        }
      } catch (error) {
        console.error('Error fetching favorites:', error);
      } finally {
        setLoaded(true);
      }
    };
    
    fetchFavorites();
  }, [userId]);

  const toggleFavorite = useCallback(async (recipeId: string) => {
    if (!userId) return;

    const isFav = favorites.includes(recipeId);
    
    // Optimistic update
    setFavorites(prev => 
      isFav ? prev.filter(id => id !== recipeId) : [...prev, recipeId]
    );

    // Sync Firestore in background
    try {
      const userRef = doc(db, 'users', userId);
      const recipeRef = doc(db, 'recipes', recipeId);

      if (isFav) {
        await updateDoc(userRef, { favorites: arrayRemove(recipeId) });
        await updateDoc(recipeRef, { favoriteCount: increment(-1) });
      } else {
        await updateDoc(userRef, { favorites: arrayUnion(recipeId) });
        await updateDoc(recipeRef, { favoriteCount: increment(1) });
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      // Revert on error
      setFavorites(prev => 
        isFav ? [...prev, recipeId] : prev.filter(id => id !== recipeId)
      );
      toast.error('Có lỗi xảy ra, thử lại nhé!');
    }
  }, [favorites, userId]);

  const isFavorite = useCallback((recipeId: string) => 
    favorites.includes(recipeId), [favorites]);

  return { favorites, toggleFavorite, isFavorite, loaded };
};
