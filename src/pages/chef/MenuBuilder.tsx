/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc,
  orderBy
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Recipe, WeeklyMenu } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Save, 
  Loader2, 
  X, 
  Calendar,
  CheckCircle2,
  Plus,
  Trash2,
  ListPlus,
  Check,
  LayoutGrid,
  GripVertical,
  Star,
  Utensils,
  Heart
} from 'lucide-react';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isBefore, startOfDay } from 'date-fns';
import { getOptimizedUrl } from '../../lib/cloudinary';

const ALL_DAYS = [
  { key: 'mon', label: 'Thứ Hai' },
  { key: 'tue', label: 'Thứ Ba' },
  { key: 'wed', label: 'Thứ Tư' },
  { key: 'thu', label: 'Thứ Năm' },
  { key: 'fri', label: 'Thứ Sáu' },
  { key: 'sat', label: 'Thứ Bảy' },
  { key: 'sun', label: 'Chủ Nhật' },
];

export default function MenuBuilder() {
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuLoading, setMenuLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [servingDays, setServingDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  
  // Selection States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetDay, setTargetDay] = useState<string | null>(null); // null if bulk
  const [tempSelected, setTempSelected] = useState<Recipe[]>([]);
  const [bulkDays, setBulkDays] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const weekId = format(currentWeek, 'yyyy-ww');

  const [weeklyCache, setWeeklyCache] = useState<Record<string, Record<string, Recipe[]>>>({});
  const initialData = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  const menuData = weeklyCache[weekId] || initialData;

  const updateMenuData = (newValOrFn: any) => {
    setWeeklyCache(prev => {
      const current = prev[weekId] || { ...initialData };
      const next = typeof newValOrFn === 'function' ? newValOrFn(current) : newValOrFn;
      return { ...prev, [weekId]: next };
    });
  };

  useEffect(() => {
    // Fetch config
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'config', 'main');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.servingDays && Array.isArray(data.servingDays)) {
            setServingDays(data.servingDays);
          }
        }
      } catch (err) {
        console.error('Error fetching kitchen config:', err);
      }
    };
    fetchConfig();
    
    // Only fetch recipes once
    const init = async () => {
      setLoading(true);
      try {
        const recipesSnap = await getDocs(query(
          collection(db, 'recipes'), 
          orderBy('title')
        ));
        const loadedRecipes = recipesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recipe));
        setRecipes(loadedRecipes);
        await fetchMenu(weekId, loadedRecipes);
      } catch (err) {
        console.error('Error fetching recipes:', err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []); // Run only on mount

  const activeDays = ALL_DAYS.filter(d => servingDays.includes(d.key));

  useEffect(() => {
    if (!loading && recipes.length > 0 && !weeklyCache[weekId]) {
      fetchMenu(weekId, recipes);
    }
  }, [weekId, loading, recipes]);

  const fetchMenu = async (id: string, currentRecipes: Recipe[]) => {
    setMenuLoading(true);
    try {
      const menuRef = doc(db, 'weeklyMenu', id);
      const menuSnap = await getDoc(menuRef);
      
      if (menuSnap.exists()) {
        const data = menuSnap.data() as WeeklyMenu;
        const mappedMenu: Record<string, Recipe[]> = {};
        for (const [day, recipeIds] of Object.entries(data.slots)) {
          mappedMenu[day] = (recipeIds as string[])
            .map(rid => currentRecipes.find(r => r.id === rid))
            .filter(Boolean) as Recipe[];
        }
        setWeeklyCache(prev => ({ ...prev, [id]: { ...initialData, ...mappedMenu } }));
      } else {
        setWeeklyCache(prev => ({ ...prev, [id]: { ...initialData } }));
      }
    } catch (err) {
      console.error('Error fetching menu:', err);
    } finally {
      setMenuLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const slots: any = {};
      ALL_DAYS.forEach(day => {
        slots[day.key] = (menuData[day.key] || []).map(r => r.id);
      });
      await setDoc(doc(db, 'weeklyMenu', weekId), {
        weekStart: format(currentWeek, 'yyyy-MM-dd'),
        slots
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving menu:', err);
    } finally {
      setSaving(false);
    }
  };

  const openSelectionModal = (dayKey: string | null) => {
    setTargetDay(dayKey);
    if (dayKey) {
      setTempSelected([...menuData[dayKey]]);
    } else {
      setTempSelected([]);
      setBulkDays([]);
    }
    setIsModalOpen(true);
  };

  const toggleRecipe = (recipe: Recipe) => {
    setTempSelected(prev => {
      const exists = prev.find(r => r.id === recipe.id);
      if (exists) return prev.filter(r => r.id !== recipe.id);
      return [...prev, recipe];
    });
  };

  const applySelection = () => {
    if (targetDay) {
      updateMenuData((prev: any) => ({ ...prev, [targetDay]: tempSelected }));
    } else {
      // Bulk Assign
      updateMenuData((prev: any) => {
        const next = { ...prev };
        bulkDays.forEach(day => {
          next[day] = [...tempSelected];
        });
        return next;
      });
    }
    setIsModalOpen(false);
  };

  const removeRecipe = (dayKey: string, recipeId: string) => {
    updateMenuData((prev: any) => ({
      ...prev,
      [dayKey]: prev[dayKey].filter((r: any) => r.id !== recipeId)
    }));
  };

  const clearDay = (dayKey: string) => {
    updateMenuData((prev: any) => ({ ...prev, [dayKey]: [] }));
  };

  if (loading) return <div className="p-24 flex justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>;

  return (
    <div className="chef-page-content h-full overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-background pb-6">
        <div className="space-y-[2px]">
          <h1 className="text-[20px] font-semibold text-foreground">Thực đơn tuần</h1>
          <p className="text-[13px] font-normal text-muted-foreground">Thiết lập thực đơn dinh dưỡng cho trẻ</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => openSelectionModal(null)}
            className="flex items-center gap-2 bg-card text-muted-foreground font-bold px-4 py-2 rounded-2xl border border-border hover:bg-secondary transition-all text-sm shadow-sm hover:text-foreground"
          >
            <ListPlus size={18} className="text-primary" />
            Thiết lập nhanh
          </button>

          <div className="flex items-center bg-card border border-border rounded-2xl overflow-hidden shadow-sm relative">
            <button onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))} className="p-3 hover:bg-secondary text-muted-foreground"><ChevronLeft size={20} /></button>
            <div className="relative group cursor-pointer border-x border-border min-w-[140px]">
              <input 
                type="date" 
                id="week-picker"
                className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full"
                onChange={(e) => {
                  if (e.target.value) {
                    setCurrentWeek(startOfWeek(new Date(e.target.value), { weekStartsOn: 1 }));
                  }
                }}
              />
              <div className="px-4 py-2 flex items-center justify-center gap-2 group-hover:bg-secondary transition-colors h-full w-full">
                <Calendar size={16} className="text-primary shrink-0" />
                <span className="font-bold text-foreground text-sm whitespace-nowrap">
                  {format(currentWeek, 'dd/MM')} - {format(addDays(currentWeek, 6), 'dd/MM')}
                </span>
              </div>
            </div>
            <button onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))} className="p-3 hover:bg-secondary text-muted-foreground"><ChevronRight size={20} /></button>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-3 rounded-2xl shadow-lg shadow-primary-shadow/30 hover:opacity-90 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={20} /> : success ? <CheckCircle2 size={20} /> : <Save size={20} />}
            {success ? 'Đã lưu' : 'Lưu Thực đơn'}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="mt-6">
        <div 
          className="flex-1 grid gap-4 pb-6 scrollbar-hide relative min-h-[500px]"
          style={{ 
            gridTemplateColumns: activeDays.length > 0 
              ? `repeat(${activeDays.length}, minmax(200px, 1fr))` 
              : 'repeat(5, 1fr)' 
          }}
        >
          <AnimatePresence>
            {menuLoading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-x-0 inset-y-0 bg-background/20 backdrop-blur-[2px] z-20 flex items-start justify-center pt-20"
              >
                <div className="bg-card p-4 rounded-3xl shadow-xl border border-border flex items-center gap-3">
                  <Loader2 className="animate-spin text-primary" size={20} />
                  <span className="text-xs font-bold text-muted-foreground">Đang tải thực đơn...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {activeDays.map((day) => {
            // Find index in ALL_DAYS to calculate date correctly
            const idx = ALL_DAYS.findIndex(d => d.key === day.key);
            const dayDate = addDays(currentWeek, idx);
            const isDayPast = isBefore(dayDate, startOfDay(new Date()));
            
            return (
              <div key={day.key} className={`flex flex-col gap-3 group ${isDayPast ? 'opacity-70' : ''}`}>
                <div className="flex items-center justify-between px-2">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${isDayPast ? 'text-muted-foreground/30' : 'text-muted-foreground'}`}>
                    {day.label} {isDayPast && '(Đã qua)'} {menuData[day.key].length > 0 && <span className={isDayPast ? 'text-muted-foreground/30' : 'text-primary/60'}>· {menuData[day.key].length} món</span>}
                  </span>
                  {menuData[day.key].length > 0 && !isDayPast && (
                    <button 
                      onClick={() => clearDay(day.key)}
                      className="text-muted-foreground/30 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                
                <div 
                  className={`min-h-[200px] rounded-[32px] border-2 border-dashed transition-all p-3 flex flex-col gap-2 overflow-hidden ${
                    isDayPast
                    ? 'bg-secondary/30 border-border cursor-not-allowed'
                    : menuData[day.key].length > 0 
                      ? 'bg-card border-border hover:border-primary/30' 
                      : 'bg-secondary/50 border-border hover:bg-primary/5 hover:border-primary/20 cursor-pointer'
                  }`}
                  onClick={() => !isDayPast && menuData[day.key].length === 0 && openSelectionModal(day.key)}
                >
                  {menuData[day.key].length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 gap-2">
                      {!isDayPast && (
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                          <Plus size={16} />
                        </div>
                      )}
                      <span className="text-[10px] font-bold">{isDayPast ? 'Nghỉ' : 'Chưa có món'}</span>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                        {menuData[day.key].map((recipe, idx) => (
                          <div 
                            key={`${day.key}-${recipe.id}-${idx}`} 
                            className={`group/item h-[72px] bg-card p-[10px_12px] rounded-2xl border border-border flex items-center gap-3 transition-all ${!isDayPast ? 'hover:border-primary/50 hover:bg-primary/5' : ''}`}
                          >
                            <div className="w-12 h-12 rounded-lg bg-secondary overflow-hidden shrink-0 border border-border">
                              {recipe.imageUrl ? (
                                <img src={getOptimizedUrl(recipe.imageUrl, 200)} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                                  <Utensils size={18} />
                                </div>
                              )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[13px] font-medium text-foreground truncate leading-tight mb-0.5">{recipe.title}</h4>
                              <div className="flex items-center gap-1">
                                <div className="flex items-center">
                                  {[1, 2, 3, 4, 5].map(star => (
                                    <Star key={star} size={8} className={`${star <= (recipe.avgRating || 5) ? 'text-orange-400 fill-orange-400' : 'text-muted-foreground/20 fill-muted-foreground/20'}`} />
                                  ))}
                                </div>
                                <span className="text-[10px] font-black text-orange-400 mt-0.5">{(recipe.avgRating || 0).toFixed(1)}</span>
                                {recipe.favoriteCount !== undefined && (
                                  <div className="flex items-center gap-0.5 text-destructive ml-2">
                                    <Heart size={8} fill="currentColor" />
                                    <span className="text-[10px] font-black">{recipe.favoriteCount}</span>
                                  </div>
                                )}
                              </div>
                            </div>
    
                            {!isDayPast && (
                              <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                <div className="p-1 text-muted-foreground/30 cursor-grab active:cursor-grabbing">
                                  <GripVertical size={16} />
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeRecipe(day.key, recipe.id!);
                                  }}
                                  className="p-1 text-muted-foreground/30 hover:text-destructive transition-colors"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {!isDayPast && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            openSelectionModal(day.key);
                          }}
                          className="mt-1 w-full py-2 flex items-center justify-center text-muted-foreground/30 hover:text-primary hover:bg-primary/5 rounded-xl transition-all border border-dashed border-border hover:border-primary/50"
                        >
                          <Plus size={16} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-[860px] h-[560px] bg-card rounded-[40px] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="h-[64px] px-8 border-b border-border flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    {targetDay ? `Thực đơn ${ALL_DAYS.find(d => d.key === targetDay)?.label}` : 'Thiết lập nhanh'}
                  </h2>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="modal-close-btn text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Search Bar - Fixed height ~52px */}
              <div className="h-[52px] px-8 border-b border-border/50 flex items-center shrink-0">
                <div className="relative w-full max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" size={16} />
                  <input 
                    type="text" 
                    placeholder="Tìm kiếm món ăn..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-1.5 bg-secondary border border-border rounded-xl focus:border-primary outline-none transition-all text-sm text-foreground"
                  />
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Left: Recipe List */}
                <div className="flex-1 overflow-y-auto p-[12px] custom-scrollbar">
                  <div className="grid gap-[12px]" style={{ gridTemplateColumns: 'repeat(auto-fill, 160px)' }}>
                    {recipes.filter(r => r.title.toLowerCase().includes(searchTerm.toLowerCase())).map(recipe => {
                      const isSelected = tempSelected.some(r => r.id === recipe.id);
                      return (
                        <div 
                          key={recipe.id}
                          onClick={() => toggleRecipe(recipe)}
                          className={`w-[160px] h-[220px] flex-shrink-0 group relative p-2 rounded-2xl border-2 transition-all cursor-pointer flex flex-col ${
                            isSelected ? 'bg-primary/5 border-primary shadow-md' : 'bg-card border-border hover:border-primary/50'
                          }`}
                        >
                          <div className="w-[140px] h-[140px] mx-auto rounded-xl bg-secondary overflow-hidden mb-2 relative shrink-0">
                            {recipe.imageUrl ? (
                              <img src={getOptimizedUrl(recipe.imageUrl, 300)} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                                <Search size={24} />
                              </div>
                            )}
                            {isSelected && (
                              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center backdrop-blur-[1px]">
                                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                  <Check size={20} strokeWidth={3} />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="px-1 flex-1 min-h-0 flex flex-col justify-between">
                            <p className="text-[13px] font-bold text-foreground line-clamp-2 leading-tight h-[32px] overflow-hidden">
                              {recipe.title}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1 uppercase font-black tracking-tighter truncate">
                              {recipe.category}
                            </p>
                            {recipe.favoriteCount !== undefined && (
                              <div className="flex items-center gap-1 text-destructive mt-1">
                                <Heart size={10} fill="currentColor" />
                                <span className="text-[10px] font-bold">{recipe.favoriteCount}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Divider */}
                <div className="w-px h-full bg-border shrink-0" />

                {/* Right: Summary & Day Selection */}
                <div className="w-[280px] bg-secondary/30 flex flex-col shrink-0 overflow-hidden">
                  <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                    {!targetDay && (
                      <div className="mb-6 shrink-0">
                        <h3 className="font-bold text-foreground text-xs mb-3 flex items-center gap-2 uppercase tracking-widest opacity-70">
                          <LayoutGrid size={14} className="text-primary" />
                          Áp dụng cho
                        </h3>
                        <div className="grid grid-cols-1 gap-1.5">
                          {activeDays.map((day) => {
                            const idx = ALL_DAYS.findIndex(d => d.key === day.key);
                            const dayDate = addDays(currentWeek, idx);
                            const isDayPast = isBefore(dayDate, startOfDay(new Date()));
                            
                            return (
                              <button
                                key={day.key}
                                disabled={isDayPast}
                                onClick={() => setBulkDays(prev => 
                                  prev.includes(day.key) ? prev.filter(k => k !== day.key) : [...prev, day.key]
                                )}
                                className={`flex items-center justify-between p-2.5 rounded-xl border-2 font-bold text-[11px] transition-all ${
                                  isDayPast
                                    ? 'bg-secondary/50 border-transparent text-muted-foreground/30 cursor-not-allowed'
                                    : bulkDays.includes(day.key) 
                                      ? 'bg-primary/5 border-primary text-primary' 
                                      : 'bg-card border-border text-muted-foreground hover:border-primary/50 shadow-sm'
                                }`}
                              >
                                {day.label}
                                {bulkDays.includes(day.key) && <Check size={12} />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between mb-3 shrink-0">
                      <h3 className="font-bold text-foreground text-xs flex items-center gap-2 uppercase tracking-widest opacity-70">
                        <CheckCircle2 size={14} className="text-primary" />
                        Món đã chọn
                      </h3>
                    </div>

                    <div className="space-y-2">
                      {tempSelected.length === 0 ? (
                        <div className="bg-card border border-dashed border-border rounded-2xl p-6 text-center shadow-sm">
                          <p className="text-muted-foreground/50 text-[11px] italic">Chưa có món nào</p>
                        </div>
                      ) : (
                        tempSelected.map(recipe => (
                          <div key={recipe.id} className="bg-card p-2.5 rounded-xl border border-border shadow-sm flex items-center gap-2 group/sel transition-all hover:border-primary/50">
                            <div className="w-8 h-8 rounded-lg bg-secondary overflow-hidden shrink-0">
                              {recipe.imageUrl && <img src={getOptimizedUrl(recipe.imageUrl, 100)} className="w-full h-full object-cover" />}
                            </div>
                            <span className="text-[11px] font-bold text-foreground truncate flex-1 min-w-0">{recipe.title}</span>
                            <button 
                              onClick={() => toggleRecipe(recipe)}
                              className="w-6 h-6 rounded-lg bg-secondary text-muted-foreground/30 hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-all"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-card border-t border-border shrink-0">
                    <button 
                      onClick={applySelection}
                      disabled={tempSelected.length === 0 || (!targetDay && bulkDays.length === 0)}
                      className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-2xl shadow-lg shadow-primary-shadow/30 hover:opacity-90 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 text-sm"
                    >
                      Xác nhận
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
