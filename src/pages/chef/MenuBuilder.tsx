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
  Heart,
  ChefHat
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-background pb-6 border-b border-border/50 mb-6 px-1">
        <div className="space-y-[4px]">
          <h1 className="text-[22px] md:text-[24px] font-bold text-foreground tracking-tight">Thực đơn của bếp</h1>
          <p className="text-[13px] font-medium text-muted-foreground/80">Thiết lập dinh dưỡng cân bằng mỗi ngày cho các con</p>
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          <div className="flex items-center bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm relative w-full md:w-auto p-1">
            <button onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))} className="p-2.5 hover:bg-secondary rounded-xl text-muted-foreground transition-colors"><ChevronLeft size={20} /></button>
            <div className="relative group cursor-pointer flex-1 md:flex-none md:min-w-[160px] text-center">
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
              <div className="px-3 py-2 flex items-center justify-center gap-2 group-hover:bg-secondary transition-colors h-full w-full rounded-xl">
                <Calendar size={15} className="text-primary shrink-0" />
                <span className="font-bold text-foreground text-[13px] whitespace-nowrap">
                  {format(currentWeek, 'dd/MM')} – {format(addDays(currentWeek, 6), 'dd/MM')}
                </span>
              </div>
            </div>
            <button onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))} className="p-2.5 hover:bg-secondary rounded-xl text-muted-foreground transition-colors"><ChevronRight size={20} /></button>
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <button 
              onClick={() => openSelectionModal(null)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-card text-foreground font-bold px-4 py-3 rounded-2xl border border-border/60 hover:bg-secondary transition-all text-[13px] shadow-sm"
            >
              <ListPlus size={18} className="text-primary" />
              Thiết lập nhanh
            </button>

            <button 
              onClick={handleSave}
              disabled={saving}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-3 rounded-2xl shadow-[0_8px_20px_rgba(var(--primary-rgb),0.25)] hover:shadow-none hover:translate-y-[1px] transition-all disabled:opacity-50 text-[13px] whitespace-nowrap"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : success ? <CheckCircle2 size={18} /> : <Save size={18} />}
              {success ? 'Đã lưu' : 'Lưu thực đơn'}
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="relative">
        <div 
          className="grid gap-6 pb-12 overflow-x-auto no-scrollbar scroll-smooth"
          style={{ 
            gridTemplateColumns: activeDays.length > 0 
              ? `repeat(${activeDays.length}, minmax(280px, 1fr))` 
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
            const idx = ALL_DAYS.findIndex(d => d.key === day.key);
            const dayDate = addDays(currentWeek, idx);
            const isDayPast = isBefore(dayDate, startOfDay(new Date()));
            
            return (
              <div key={day.key} className="flex flex-col gap-4">
                <div className="flex items-center justify-between px-1">
                  <div className="flex flex-col">
                    <span className={`text-[11px] font-black uppercase tracking-[0.1em] ${isDayPast ? 'text-muted-foreground/40' : 'text-primary'}`}>
                      {day.label}
                    </span>
                    <span className={`text-[12px] font-medium ${isDayPast ? 'text-muted-foreground/40' : 'text-muted-foreground'}`}>
                      {format(dayDate, 'dd/MM')}
                      {isDayPast && ' (Đã qua)'}
                    </span>
                  </div>
                  {menuData[day.key].length > 0 && !isDayPast && (
                    <button 
                      onClick={() => clearDay(day.key)}
                      className="p-1.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                
                <div 
                  className={`min-h-[400px] rounded-[32px] border-2 transition-all p-4 flex flex-col gap-3 relative shadow-sm ${
                    isDayPast
                    ? 'bg-secondary/20 border-border/40 cursor-not-allowed grayscale-[0.8]'
                    : menuData[day.key].length > 0 
                      ? 'bg-card border-border border-dashed hover:border-primary/20 hover:shadow-md' 
                      : 'bg-secondary/40 border-dashed border-border/60 hover:bg-primary/[0.02] hover:border-primary/20 cursor-pointer'
                  }`}
                  onClick={() => !isDayPast && menuData[day.key].length === 0 && openSelectionModal(day.key)}
                >
                  {menuData[day.key].length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/30 gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 border-dashed ${isDayPast ? 'border-border/30' : 'border-border/60 bg-background shadow-inner'}`}>
                        <Plus size={20} className={isDayPast ? 'opacity-20' : 'text-primary/40'} />
                      </div>
                      <span className="text-[12px] font-bold tracking-tight">{isDayPast ? 'Không phục vụ' : 'Bấm để thêm món'}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 space-y-3 overflow-y-auto no-scrollbar pr-0.5">
                        {menuData[day.key].map((recipe, rIdx) => (
                          <motion.div 
                            layout
                            key={`${day.key}-${recipe.id}-${rIdx}`} 
                            className={`group h-[100px] bg-card p-3 rounded-[24px] border border-border shadow-sm flex items-center gap-3 relative ${!isDayPast ? 'hover:border-primary/40 hover:shadow-md' : 'opacity-60'}`}
                          >
                            <div className="w-[76px] h-[76px] rounded-2xl bg-secondary overflow-hidden shrink-0 border border-border/50">
                              {recipe.imageUrl ? (
                                <img src={getOptimizedUrl(recipe.imageUrl, 200)} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                                  <ChefHat size={24} />
                                </div>
                              )}
                            </div>
                            
                            <div className="flex-1 min-w-0 pr-6">
                              <h4 className="text-[14px] font-bold text-foreground line-clamp-2 leading-tight mb-1 group-hover:text-primary transition-colors">{recipe.title}</h4>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                  <Star size={12} className="text-orange-400 fill-orange-400" />
                                  <span className="text-[11px] font-bold text-foreground/80">{(recipe.avgRating || 0).toFixed(1)}</span>
                                </div>
                                <div className="w-[1px] h-2.5 bg-border/60" />
                                <div className="flex items-center gap-1 text-rose-500">
                                  <Heart size={10} fill="currentColor" />
                                  <span className="text-[11px] font-bold">{recipe.favoriteCount || 0}</span>
                                </div>
                              </div>
                            </div>
    
                            {!isDayPast && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeRecipe(day.key, recipe.id!);
                                }}
                                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-secondary/50 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </motion.div>
                        ))}
                      </div>
                      {!isDayPast && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            openSelectionModal(day.key);
                          }}
                          className="mt-2 w-full py-3 flex items-center justify-center text-muted-foreground/40 hover:text-primary bg-secondary/20 hover:bg-primary/5 rounded-2xl transition-all border border-dashed border-border/60 hover:border-primary/30 group"
                        >
                          <Plus size={18} className="group-hover:scale-110 transition-transform" />
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
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-[860px] h-[560px] bg-card rounded-[40px] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="h-[72px] px-8 border-b border-border flex items-center justify-between shrink-0 bg-background/50 backdrop-blur-md">
                <div>
                  <h2 className="text-xl font-black text-foreground tracking-tight">
                    {targetDay ? `Thực đơn ${ALL_DAYS.find(d => d.key === targetDay)?.label}` : 'Thiết lập nhanh'}
                  </h2>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-all"
                  aria-label="Close"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Search Bar */}
              <div className="px-8 py-4 border-b border-border/50 flex flex-col md:flex-row md:items-center gap-4 shrink-0 bg-background/30">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50" size={18} />
                  <input 
                    type="text" 
                    placeholder="Tìm kiếm món ăn ngon cho bé..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-secondary border-none rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm text-foreground font-medium"
                  />
                </div>
                {!targetDay && (
                   <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
                      {activeDays.map((day) => {
                        const idx = ALL_DAYS.findIndex(d => d.key === day.key);
                        const dayDate = addDays(currentWeek, idx);
                        const isDayPast = isBefore(dayDate, startOfDay(new Date()));
                        if (isDayPast) return null;
                        
                        return (
                          <button
                            key={day.key}
                            onClick={() => setBulkDays(prev => 
                              prev.includes(day.key) ? prev.filter(k => k !== day.key) : [...prev, day.key]
                            )}
                            className={`px-4 py-2 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border ${
                              bulkDays.includes(day.key) 
                                ? 'bg-primary text-primary-foreground border-primary shadow-sm' 
                                : 'bg-card border-border text-muted-foreground hover:border-primary/40'
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                   </div>
                )}
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Left: Recipe List */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-secondary/10">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {recipes.filter(r => r.title.toLowerCase().includes(searchTerm.toLowerCase())).map(recipe => {
                      const isSelected = tempSelected.some(r => r.id === recipe.id);
                      return (
                        <motion.div 
                          layout
                          key={recipe.id}
                          onClick={() => toggleRecipe(recipe)}
                          className={`group relative p-3 rounded-[32px] border-2 transition-all cursor-pointer flex flex-col ${
                            isSelected ? 'bg-primary/5 border-primary shadow-lg shadow-primary-shadow/10' : 'bg-card border-border hover:border-primary/50 hover:shadow-md'
                          }`}
                        >
                          <div className="aspect-square rounded-2xl bg-secondary overflow-hidden mb-3 relative shrink-0 border border-border/50">
                            {recipe.imageUrl ? (
                              <img src={getOptimizedUrl(recipe.imageUrl, 400)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                                <ChefHat size={32} />
                              </div>
                            )}
                            {isSelected && (
                              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center backdrop-blur-[1px]">
                                <motion.div 
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg"
                                >
                                  <Check size={24} strokeWidth={4} />
                                </motion.div>
                              </div>
                            )}
                          </div>
                          <div className="px-1 flex-1 flex flex-col">
                            <p className="text-[14px] font-bold text-foreground line-clamp-2 leading-tight mb-2 group-hover:text-primary transition-colors">
                              {recipe.title}
                            </p>
                            <div className="mt-auto flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <Star size={10} className="text-orange-400 fill-orange-400" />
                                <span className="text-[10px] font-bold text-muted-foreground">{(recipe.avgRating || 0).toFixed(1)}</span>
                              </div>
                              <div className="flex items-center gap-1 text-rose-500">
                                <Heart size={10} fill="currentColor" />
                                <span className="text-[10px] font-bold">{recipe.favoriteCount || 0}</span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {/* Divider */}
                <div className="w-px h-full bg-border shrink-0 hidden md:block" />

                {/* Right: Summary */}
                <div className="w-[320px] bg-card flex flex-col shrink-0 border-l border-border/50 hidden lg:flex">
                  <div className="p-6 border-b border-border/50">
                    <h3 className="font-black text-foreground text-[10px] uppercase tracking-widest flex items-center gap-2 text-primary">
                      <CheckCircle2 size={16} />
                      Đã chọn ({tempSelected.length})
                    </h3>
                  </div>
                  <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-3">
                    {tempSelected.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                        <Utensils size={40} className="mb-4" />
                        <p className="text-xs font-bold leading-relaxed px-4">Hãy chọn món để thêm vào thực đơn nhé!</p>
                      </div>
                    ) : (
                      tempSelected.map(recipe => (
                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={recipe.id} 
                          className="bg-secondary/30 p-3 rounded-2xl border border-border/50 flex items-center gap-3 group/sel"
                        >
                          <div className="w-10 h-10 rounded-xl bg-secondary overflow-hidden shrink-0">
                            {recipe.imageUrl && <img src={getOptimizedUrl(recipe.imageUrl, 100)} className="w-full h-full object-cover" />}
                          </div>
                          <span className="text-[12px] font-bold text-foreground truncate flex-1 min-w-0">{recipe.title}</span>
                          <button 
                            onClick={() => toggleRecipe(recipe)}
                            className="p-1.5 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                          >
                            <X size={14} />
                          </button>
                        </motion.div>
                      ))
                    )}
                  </div>

                  <div className="p-6 bg-secondary/10 border-t border-border/50">
                    <button 
                      onClick={applySelection}
                      disabled={tempSelected.length === 0 || (!targetDay && bulkDays.length === 0)}
                      className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-[20px] shadow-lg shadow-primary-shadow/20 hover:shadow-none hover:translate-y-[1px] transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-[15px]"
                    >
                      Áp dụng {tempSelected.length} món
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile Footer for Modal */}
              <div className="lg:hidden p-4 bg-background border-t border-border shrink-0 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-[13px] font-bold text-foreground">Đã chọn {tempSelected.length} món</p>
                  <p className="text-[10px] text-muted-foreground">
                    {!targetDay ? `Áp dụng cho ${bulkDays.length} ngày` : `Cho ${ALL_DAYS.find(d => d.key === targetDay)?.label}`}
                  </p>
                </div>
                <button 
                  onClick={applySelection}
                  disabled={tempSelected.length === 0 || (!targetDay && bulkDays.length === 0)}
                  className="bg-primary text-primary-foreground font-bold px-6 py-3 rounded-xl shadow-lg transition-all disabled:opacity-50 text-[14px]"
                >
                  Xác nhận
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
