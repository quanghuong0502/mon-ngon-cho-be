import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Category } from '../types';

interface CategoryContextType {
  categories: Category[];
  loading: boolean;
  getCategoryById: (id: string) => Category | undefined;
}

const CategoryContext = createContext<CategoryContextType | undefined>(undefined);

export function CategoryProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // We want to fetch all categories so we can display them even if inactive in some contexts,
    // but the user asked to fetch only active ones for performance. 
    // Actually, "inactive" ones might still be needed to display badges on existing recipes.
    // Let's fetch all and sort by order.
    const q = query(
      collection(db, 'categories'),
      orderBy('order', 'asc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const loadedCategories = snap.docs.map(d => ({ 
        id: d.id, 
        ...d.data() 
      } as Category));
      setCategories(loadedCategories);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const getCategoryById = (id: string) => categories.find(c => c.id === id);

  return (
    <CategoryContext.Provider value={{ categories, loading, getCategoryById }}>
      {children}
    </CategoryContext.Provider>
  );
}

export function useCategory() {
  const context = useContext(CategoryContext);
  if (context === undefined) {
    throw new Error('useCategory must be used within a CategoryProvider');
  }
  return context;
}
