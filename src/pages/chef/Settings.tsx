/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Settings as SettingsIcon, 
  MapPin, 
  Clock, 
  MessageSquare, 
  Save, 
  Map as MapIcon,
  Info,
  Sun,
  Moon,
  Monitor,
  GripVertical,
  Trash2,
  Edit2,
  Plus,
  CircleAlert,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  where,
  writeBatch,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';
import { CancelReason, Category } from '../../types';
import ConfirmModal from '../../components/ConfirmModal';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Tag,
  Palette
} from 'lucide-react';

interface OrderTime {
  start: string;
  end: string;
}

interface KitchenConfig {
  name: string;
  directions: string;
  mapsShareLink: string;
  openTime: string;
  closeTime: string;
  orderStartTime: string;
  orderEndTime: string;
  orderTimes?: Record<string, OrderTime>;
  servingDays: string[];
  readyMessage: string;
}

const DAYS_MAP = [
  { key: 'mon', label: 'T2', full: 'Thứ Hai' },
  { key: 'tue', label: 'T3', full: 'Thứ Ba' },
  { key: 'wed', label: 'T4', full: 'Thứ Tư' },
  { key: 'thu', label: 'T5', full: 'Thứ Năm' },
  { key: 'fri', label: 'T6', full: 'Thứ Sáu' },
  { key: 'sat', label: 'T7', full: 'Thứ Bảy' },
  { key: 'sun', label: 'CN', full: 'Chủ Nhật' },
];

const DEFAULT_CONFIG: KitchenConfig = {
  name: 'Món ngon cho bé',
  directions: '',
  mapsShareLink: '',
  openTime: '11:00',
  closeTime: '13:00',
  orderStartTime: '07:00',
  orderEndTime: '17:00',
  orderTimes: {
    mon: { start: '07:00', end: '17:00' },
    tue: { start: '07:00', end: '17:00' },
    wed: { start: '07:00', end: '17:00' },
    thu: { start: '07:00', end: '17:00' },
    fri: { start: '07:00', end: '17:00' },
    sat: { start: '07:00', end: '17:00' },
    sun: { start: '07:00', end: '17:00' },
  },
  servingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  readyMessage: 'Món ăn của bé đã sẵn sàng! Qua bếp lấy nhé'
};

export default function ChefSettings() {
  const { theme, setTheme } = useTheme();
  const [config, setConfig] = useState<KitchenConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Cancel Reasons State
  const [reasons, setReasons] = useState<CancelReason[]>([]);
  const [isReasonModalOpen, setIsReasonModalOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<CancelReason | null>(null);
  const [reasonLabel, setReasonLabel] = useState('');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Categories State
  const [categories, setCategories] = useState<Category[]>([]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryEmoji, setCategoryEmoji] = useState('🍚');
  const [categoryColor, setCategoryColor] = useState('#F97316');
  const [isDeletingCategory, setIsDeletingCategory] = useState<string | null>(null);
  const [recipesUsingCategory, setRecipesUsingCategory] = useState<number>(0);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'config', 'main');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          // Migration/Compatibility handle
          const validatedData: KitchenConfig = {
            name: data.name || DEFAULT_CONFIG.name,
            directions: data.directions || DEFAULT_CONFIG.directions,
            mapsShareLink: data.mapsShareLink || data.mapsEmbedUrl || '',
            openTime: data.openTime || DEFAULT_CONFIG.openTime,
            closeTime: data.closeTime || DEFAULT_CONFIG.closeTime,
            orderStartTime: data.orderStartTime || DEFAULT_CONFIG.orderStartTime,
            orderEndTime: data.orderEndTime || DEFAULT_CONFIG.orderEndTime,
            orderTimes: data.orderTimes || DEFAULT_CONFIG.orderTimes,
            servingDays: Array.isArray(data.servingDays) ? data.servingDays : DEFAULT_CONFIG.servingDays,
            readyMessage: data.readyMessage || DEFAULT_CONFIG.readyMessage,
          };
          setConfig(validatedData);
        }
      } catch (error) {
        console.error('Error fetching kitchen config:', error);
        toast.error('Không thể tải cài đặt bếp');
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();

    // Fetch Cancel Reasons
    const qReasons = query(collection(db, 'cancelReasons'), orderBy('order', 'asc'));
    const unsubReasons = onSnapshot(qReasons, (snap) => {
      const loadedReasons = snap.docs.map(d => ({ id: d.id, ...d.data() } as CancelReason));
      setReasons(loadedReasons);

      // Seed default reasons if empty
      if (snap.empty) {
        seedDefaultReasons();
      }
    });

    // Fetch Categories
    const qCategories = query(collection(db, 'categories'), orderBy('order', 'asc'));
    const unsubCategories = onSnapshot(qCategories, (snap) => {
      const loadedCategories = snap.docs.map(d => ({ id: d.id, ...d.data() } as Category));
      setCategories(loadedCategories);

      // Seed default categories if empty
      if (snap.empty) {
        seedDefaultCategories();
      }
    });

    return () => {
      unsubReasons();
      unsubCategories();
    };
  }, []);

  const seedDefaultCategories = async () => {
    const defaults = [
      { name: "Món chính", emoji: "🍚", color: "#F97316", order: 1, isActive: true },
      { name: "Món phụ", emoji: "🥦", color: "#22C55E", order: 2, isActive: true },
      { name: "Đồ ăn kèm", emoji: "🥟", color: "#8B5CF6", order: 3, isActive: true },
      { name: "Tráng miệng", emoji: "🍮", color: "#EC4899", order: 4, isActive: true },
      { name: "Trái cây", emoji: "🍊", color: "#F59E0B", order: 5, isActive: true },
      { name: "Sữa & sữa chua", emoji: "🥛", color: "#06B6D4", order: 6, isActive: true },
      { name: "Đồ uống", emoji: "🥤", color: "#3B82F6", order: 7, isActive: true },
      { name: "Ăn vặt & snack", emoji: "🍿", color: "#EF4444", order: 8, isActive: true },
      { name: "Bánh & xôi", emoji: "🧁", color: "#D97706", order: 9, isActive: true },
      { name: "Đồ ăn nhanh", emoji: "🍔", color: "#6B7280", order: 10, isActive: true }
    ];

    try {
      const batch = writeBatch(db);
      defaults.forEach(c => {
        const ref = doc(collection(db, 'categories'));
        batch.set(ref, { ...c, createdAt: serverTimestamp() });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error seeding categories:", error);
    }
  };

  const seedDefaultReasons = async () => {
    const defaults = [
      { label: "Hết nguyên liệu", order: 1, isActive: true },
      { label: "Bếp gặp sự cố", order: 2, isActive: true },
      { label: "Món không đảm bảo chất lượng", order: 3, isActive: true },
      { label: "Thời tiết xấu", order: 4, isActive: true },
      { label: "Lý do khác", order: 99, isActive: true }
    ];

    try {
      const batch = writeBatch(db);
      defaults.forEach(r => {
        const ref = doc(collection(db, 'cancelReasons'));
        batch.set(ref, { ...r, createdAt: serverTimestamp() });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error seeding reasons:", error);
    }
  };

  const handleSaveReason = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!reasonLabel.trim()) return;

    try {
      if (editingReason) {
        await updateDoc(doc(db, 'cancelReasons', editingReason.id!), {
          label: reasonLabel,
          updatedAt: serverTimestamp()
        });
        toast.success('Đã cập nhật lý do');
      } else {
        const nextOrder = reasons.length > 0 ? Math.max(...reasons.map(r => r.order)) + 1 : 1;
        await addDoc(collection(db, 'cancelReasons'), {
          label: reasonLabel,
          order: nextOrder,
          isActive: true,
          createdAt: serverTimestamp()
        });
        toast.success('Đã thêm lý do mới');
      }
      setIsReasonModalOpen(false);
      setEditingReason(null);
      setReasonLabel('');
    } catch (error) {
      toast.error('Lỗi khi lưu lý do');
    }
  };

  const deleteReason = async (id: string) => {
    const reason = reasons.find(r => r.id === id);
    if (reason?.label === 'Lý do khác') {
      toast.error('Không thể xóa lý do này');
      return;
    }

    try {
      await deleteDoc(doc(db, 'cancelReasons', id));
      toast.success('Đã xóa lý do');
      setIsDeleting(null);
    } catch (error) {
      toast.error('Lỗi khi xóa lý do');
    }
  };

  const toggleReasonActive = async (id: string) => {
    const reason = reasons.find(r => r.id === id);
    if (!reason) return;

    const activeCount = reasons.filter(r => r.isActive).length;
    if (reason.isActive && activeCount <= 1) {
      toast.error('Phải có ít nhất 1 lý do hoạt động');
      return;
    }

    try {
      await updateDoc(doc(db, 'cancelReasons', id), {
        isActive: !reason.isActive
      });
    } catch (error) {
      toast.error('Lỗi khi cập nhật trạng thái');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = reasons.findIndex(r => r.id === active.id);
      const newIndex = reasons.findIndex(r => r.id === over.id);

      const newReasons = arrayMove(reasons, oldIndex, newIndex) as CancelReason[];
      setReasons(newReasons);

      // Update orders in batch
      try {
        const batch = writeBatch(db);
        newReasons.forEach((r: CancelReason, idx: number) => {
          batch.update(doc(db, 'cancelReasons', r.id!), {
            order: idx + 1
          });
        });
        await batch.commit();
      } catch (error) {
        toast.error('Lỗi khi sắp xếp lại');
      }
    }
  };

  const handleDragEndCategory = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = categories.findIndex(c => c.id === active.id);
      const newIndex = categories.findIndex(c => c.id === over.id);

      const newCategories = arrayMove(categories, oldIndex, newIndex) as Category[];
      setCategories(newCategories);

      try {
        const batch = writeBatch(db);
        newCategories.forEach((c: Category, idx: number) => {
          batch.update(doc(db, 'categories', c.id!), {
            order: idx + 1
          });
        });
        await batch.commit();
      } catch (error) {
        toast.error('Lỗi khi sắp xếp lại');
      }
    }
  };

  const handleSaveCategory = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!categoryName.trim()) return;

    try {
      if (editingCategory) {
        await updateDoc(doc(db, 'categories', editingCategory.id!), {
          name: categoryName,
          emoji: categoryEmoji,
          color: categoryColor,
          updatedAt: serverTimestamp()
        });
        toast.success('Đã cập nhật danh mục');
      } else {
        const nextOrder = categories.length > 0 ? Math.max(...categories.map(c => c.order)) + 1 : 1;
        await addDoc(collection(db, 'categories'), {
          name: categoryName,
          emoji: categoryEmoji,
          color: categoryColor,
          order: nextOrder,
          isActive: true,
          createdAt: serverTimestamp()
        });
        toast.success('Đã thêm danh mục mới');
      }
      setIsCategoryModalOpen(false);
      setEditingCategory(null);
      setCategoryName('');
      setCategoryEmoji('🍚');
      setCategoryColor('#F97316');
    } catch (error) {
      toast.error('Lỗi khi lưu danh mục');
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      // Find recipes using this category
      const q = query(collection(db, 'recipes'), where('categoryId', '==', id));
      const snap = await getDocs(q);
      
      const batch = writeBatch(db);
      snap.docs.forEach(d => {
        batch.update(d.ref, { categoryId: null });
      });
      batch.delete(doc(db, 'categories', id));
      await batch.commit();
      
      toast.success('Đã xóa danh mục');
      setIsDeletingCategory(null);
    } catch (error) {
      toast.error('Lỗi khi xóa danh mục');
    }
  };

  const toggleCategoryActive = async (id: string) => {
    const category = categories.find(c => c.id === id);
    if (!category) return;
    
    try {
      await updateDoc(doc(db, 'categories', id), {
        isActive: !category.isActive
      });
    } catch (error) {
      toast.error('Lỗi khi cập nhật trạng thái');
    }
  };

  const checkRecipesUsingCategory = async (id: string) => {
    const q = query(collection(db, 'recipes'), where('categoryId', '==', id));
    const snap = await getDocs(q);
    setRecipesUsingCategory(snap.size);
    setIsDeletingCategory(id);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'main'), config);
      toast.success('Đã lưu cài đặt bếp!');
    } catch (error) {
      console.error('Error saving kitchen config:', error);
      toast.error('Không thể lưu cài đặt');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (dayKey: string) => {
    setConfig(prev => {
      const current = prev.servingDays;
      const next = current.includes(dayKey)
        ? current.filter(d => d !== dayKey)
        : [...current, dayKey];
      return { ...prev, servingDays: next };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="chef-page-content h-full overflow-y-auto scrollbar-hide">
      <div className="mb-6 md:mb-8 md:pt-5 text-center md:text-left pt-2">
        <h1 className="text-[20px] md:text-3xl font-black text-foreground tracking-tight flex items-center justify-center md:justify-start gap-2 md:gap-3">
          <SettingsIcon size={24} className="text-primary md:w-8 md:h-8" />
          Cài đặt bếp
        </h1>
        <p className="text-[12px] md:text-muted-foreground font-medium mt-1">Thông tin bếp và giờ phục vụ</p>
      </div>

      <div className="mt-4">
        <form onSubmit={handleSave} className="max-w-[680px] mx-auto space-y-4 md:space-y-6 pb-20">
          {/* Section 1: Thông tin bếp */}
          <section className="bg-card p-5 md:p-8 rounded-[24px] md:rounded-[32px] border border-border shadow-sm space-y-4 md:space-y-6">
            <div className="flex items-center gap-2 md:gap-3 text-base md:text-lg font-bold text-foreground mb-2">
              <Info size={18} className="text-primary md:w-5 md:h-5" />
              Thông tin bếp
            </div>
            
            <div className="space-y-3 md:space-y-4">
              <div>
                <label className="block text-[10px] md:text-xs font-black uppercase text-muted-foreground tracking-widest mb-1 md:mb-1.5 ml-1">Tên bếp</label>
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  placeholder="Món ngon cho bé"
                  className="w-full px-4 py-2.5 md:py-3 rounded-xl md:rounded-2xl bg-secondary border-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] md:text-xs font-black uppercase text-muted-foreground tracking-widest mb-1 md:mb-1.5 ml-1">Mô tả đường đi</label>
                <textarea
                  rows={3}
                  value={config.directions}
                  onChange={(e) => setConfig({ ...config, directions: e.target.value })}
                  placeholder="Ví dụ: Đi vào cổng chính, rẽ trái, phòng số 101..."
                  className="w-full px-4 py-2.5 md:py-3 rounded-xl md:rounded-2xl bg-secondary border-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium resize-none text-foreground placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
          </section>

          {/* Section 2: Google Maps */}
          <section className="bg-card p-5 md:p-8 rounded-[24px] md:rounded-[32px] border border-border shadow-sm space-y-4 md:space-y-6">
            <div className="flex items-center gap-2 md:gap-3 text-base md:text-lg font-bold text-foreground mb-2">
              <MapIcon size={18} className="text-primary md:w-5 md:h-5" />
              Google Maps
            </div>

            <div className="space-y-3 md:space-y-4">
              <div>
                <label className="block text-[10px] md:text-xs font-black uppercase text-muted-foreground tracking-widest mb-1 md:mb-1.5 ml-1">Link Google Maps</label>
                <input
                  type="text"
                  value={config.mapsShareLink}
                  onChange={(e) => setConfig({ ...config, mapsShareLink: e.target.value })}
                  placeholder="Paste link Google Maps của bếp..."
                  className="w-full px-4 py-2.5 md:py-3 rounded-xl md:rounded-2xl bg-secondary border-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium"
                />
              </div>
            </div>
          </section>

          {/* Section 3: Giờ phục vụ */}
          <section className="bg-card p-5 md:p-8 rounded-[24px] md:rounded-[32px] border border-border shadow-sm space-y-4 md:space-y-6">
            <div className="flex items-center gap-2 md:gap-3 text-base md:text-lg font-bold text-foreground mb-2">
              <Clock size={18} className="text-primary md:w-5 md:h-5" />
              Giờ phục vụ
            </div>

            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="block text-[10px] md:text-xs font-black uppercase text-muted-foreground tracking-widest mb-1 md:mb-1.5 ml-1">Giờ mở</label>
                <input
                  type="time"
                  value={config.openTime}
                  onChange={(e) => setConfig({ ...config, openTime: e.target.value })}
                  className="w-full px-4 py-2.5 md:py-3 rounded-xl md:rounded-2xl bg-secondary border-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium text-foreground"
                />
              </div>
              <div>
                <label className="block text-[10px] md:text-xs font-black uppercase text-muted-foreground tracking-widest mb-1 md:mb-1.5 ml-1">Giờ đóng</label>
                <input
                  type="time"
                  value={config.closeTime}
                  onChange={(e) => setConfig({ ...config, closeTime: e.target.value })}
                  className="w-full px-4 py-2.5 md:py-3 rounded-xl md:rounded-2xl bg-secondary border-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium text-foreground"
                />
              </div>
            </div>
          </section>

          {/* Section: Giờ đặt món */}
          <section className="bg-card p-5 md:p-8 rounded-[24px] md:rounded-[32px] border border-border shadow-sm space-y-4 md:space-y-6">
            <div className="flex items-center gap-2 md:gap-3 text-base md:text-lg font-bold text-foreground mb-2">
              <Clock size={18} className="text-primary md:w-5 md:h-5" />
              Khung giờ đặt món cho Ngày Mai
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed italic">
              Bé chỉ có thể đặt hoặc thay đổi món của ngày mai trong khoảng thời gian này. Các ngày xa hơn sẽ không bị giới hạn.
            </p>

            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="block text-[10px] md:text-xs font-black uppercase text-muted-foreground tracking-widest mb-1 md:mb-1.5 ml-1">Bắt đầu</label>
                <input
                  type="time"
                  value={config.orderStartTime}
                  onChange={(e) => setConfig({ ...config, orderStartTime: e.target.value })}
                  className="w-full px-4 py-2.5 md:py-3 rounded-xl md:rounded-2xl bg-secondary border-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium text-foreground"
                />
              </div>
              <div>
                <label className="block text-[10px] md:text-xs font-black uppercase text-muted-foreground tracking-widest mb-1 md:mb-1.5 ml-1">Kết thúc</label>
                <input
                  type="time"
                  value={config.orderEndTime}
                  onChange={(e) => setConfig({ ...config, orderEndTime: e.target.value })}
                  className="w-full px-4 py-2.5 md:py-3 rounded-xl md:rounded-2xl bg-secondary border-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium text-foreground"
                />
              </div>
            </div>
          </section>

          {/* Section 4: Ngày phục vụ */}
          <section className="bg-card p-5 md:p-8 rounded-[24px] md:rounded-[32px] border border-border shadow-sm space-y-4 md:space-y-6">
            <div className="flex items-center gap-2 md:gap-3 text-base md:text-lg font-bold text-foreground mb-2">
              <Sun size={18} className="text-primary md:w-5 md:h-5" />
              Ngày phục vụ
            </div>
            
            <div className="col-span-2">
                <div className="flex flex-wrap gap-2">
                  {DAYS_MAP.map((day) => {
                    const isSelected = config.servingDays.includes(day.key);
                    return (
                      <button
                        key={day.key}
                        type="button"
                        onClick={() => toggleDay(day.key)}
                        className={`
                          px-3 md:px-4 py-1.5 md:py-2 rounded-[10px] md:rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest border transition-all
                          ${isSelected 
                            ? 'bg-primary border-primary text-primary-foreground shadow-md shadow-primary-shadow/30' 
                            : 'bg-card border-border text-muted-foreground hover:border-primary/50'}
                        `}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
          </section>

          {/* Section 4: Tin nhắn cho bé */}
          <section className="bg-card p-5 md:p-8 rounded-[24px] md:rounded-[32px] border border-border shadow-sm space-y-4 md:space-y-6">
            <div className="flex items-center gap-2 md:gap-3 text-base md:text-lg font-bold text-foreground mb-2">
              <MessageSquare size={18} className="text-primary md:w-5 md:h-5" />
              Tin nhắn cho bé
            </div>

            <div>
              <label className="block text-[10px] md:text-xs font-black uppercase text-muted-foreground tracking-widest mb-1 md:mb-1.5 ml-1">Lời nhắn khi sẵn sàng</label>
              <textarea
                rows={2}
                value={config.readyMessage}
                onChange={(e) => setConfig({ ...config, readyMessage: e.target.value })}
                className="w-full px-4 py-2.5 md:py-3 rounded-xl md:rounded-2xl bg-secondary border-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium resize-none text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
          </section>

          {/* Section 5: Giao diện */}
          <section className="bg-card p-5 md:p-8 rounded-[24px] md:rounded-[32px] border border-border shadow-sm space-y-4 md:space-y-6">
            <div className="flex items-center gap-2 md:gap-3 text-base md:text-lg font-bold text-foreground mb-2">
              <Sun size={18} className="text-primary md:w-5 md:h-5" />
              Giao diện ứng dụng
            </div>

            <div className="flex bg-secondary p-1 rounded-xl md:rounded-2xl gap-1 md:gap-2">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex-1 flex items-center justify-center gap-1.5 md:gap-3 py-2 md:py-3 rounded-[10px] md:rounded-xl text-[12px] md:text-sm font-bold transition-all ${
                  theme === 'light' 
                    ? 'bg-card text-primary shadow-sm ring-1 ring-border' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sun size={16} className="md:w-4.5 md:h-4.5" />
                Sáng
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex-1 flex items-center justify-center gap-1.5 md:gap-3 py-2 md:py-3 rounded-[10px] md:rounded-xl text-[12px] md:text-sm font-bold transition-all ${
                  theme === 'dark' 
                    ? 'bg-card text-primary shadow-sm ring-1 ring-border' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Moon size={16} className="md:w-4.5 md:h-4.5" />
                Tối
              </button>
              <button
                type="button"
                onClick={() => setTheme('system')}
                className={`flex-1 flex items-center justify-center gap-1.5 md:gap-3 py-2 md:py-3 rounded-[10px] md:rounded-xl text-[12px] md:text-sm font-bold transition-all ${
                  theme === 'system' 
                    ? 'bg-card text-primary shadow-sm ring-1 ring-border' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Monitor size={16} className="md:w-4.5 md:h-4.5" />
                Hệ thống
              </button>
            </div>
          </section>

          {/* Section: Lý do huỷ đơn */}
          <section className="bg-card p-5 md:p-8 rounded-[24px] md:rounded-[32px] border border-border shadow-sm space-y-4 md:space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 md:gap-3 text-base md:text-lg font-bold text-foreground">
                <Trash2 size={18} className="text-primary md:w-5 md:h-5" />
                Lý do huỷ đơn 🚫
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingReason(null);
                  setReasonLabel('');
                  setIsReasonModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-[11px] font-black uppercase tracking-wider hover:bg-primary/20 transition-all"
              >
                <Plus size={14} />
                Thêm lý do
              </button>
            </div>
            
            <p className="text-[11px] text-muted-foreground font-medium">Quản lý các lý do khi huỷ đơn của bé</p>

            <div className="space-y-2">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={reasons.map(r => r.id!)}
                  strategy={verticalListSortingStrategy}
                >
                  {reasons.map((reason) => (
                    <SortableReasonItem
                      key={reason.id}
                      reason={reason}
                      onEdit={() => {
                        setEditingReason(reason);
                        setReasonLabel(reason.label);
                        setIsReasonModalOpen(true);
                      }}
                      onDelete={() => setIsDeleting(reason.id!)}
                      onToggle={() => toggleReasonActive(reason.id!)}
                      isOnlyActive={reasons.filter(r => r.isActive).length <= 1}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </section>

          {/* Section: Danh mục món ăn */}
          <section className="bg-card p-5 md:p-8 rounded-[24px] md:rounded-[32px] border border-border shadow-sm space-y-4 md:space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 md:gap-3 text-base md:text-lg font-bold text-foreground">
                <Tag size={18} className="text-primary md:w-5 md:h-5" />
                Danh mục món ăn 🏷️
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingCategory(null);
                  setCategoryName('');
                  setCategoryEmoji('🍚');
                  setCategoryColor('#F97316');
                  setIsCategoryModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-[11px] font-black uppercase tracking-wider hover:bg-primary/20 transition-all"
              >
                <Plus size={14} />
                Thêm danh mục
              </button>
            </div>
            
            <p className="text-[11px] text-muted-foreground font-medium">Quản lý các danh mục để phân loại công thức</p>

            <div className="space-y-2">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndCategory}
              >
                <SortableContext
                  items={categories.map(c => c.id!)}
                  strategy={verticalListSortingStrategy}
                >
                  {categories.map((category) => (
                    <SortableCategoryItem
                      key={category.id}
                      category={category}
                      onEdit={() => {
                        setEditingCategory(category);
                        setCategoryName(category.name);
                        setCategoryEmoji(category.emoji);
                        setCategoryColor(category.color);
                        setIsCategoryModalOpen(true);
                      }}
                      onDelete={() => checkRecipesUsingCategory(category.id!)}
                      onToggle={() => toggleCategoryActive(category.id!)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </section>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-4 bg-primary text-primary-foreground rounded-[20px] md:rounded-[24px] font-black uppercase tracking-widest text-[13px] md:text-sm flex items-center justify-center gap-3 shadow-lg shadow-primary-shadow/30 hover:opacity-90 transition-all disabled:opacity-50"
          >
            <Save size={18} />
            {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
          </button>
        </form>
      </div>

      <ConfirmModal
        isOpen={isReasonModalOpen}
        onClose={() => setIsReasonModalOpen(false)}
        onConfirm={handleSaveReason}
        title={editingReason ? "Sửa lý do" : "Thêm lý do mới"}
        confirmText="Lưu lại"
        cancelText="Huỷ"
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-2 ml-1">Tên lý do (tối đa 30 ký tự)</label>
            <input
              type="text"
              maxLength={30}
              value={reasonLabel}
              onChange={(e) => setReasonLabel(e.target.value)}
              placeholder="Nhập lý do huỷ..."
              className="w-full px-4 py-3 rounded-2xl bg-secondary border-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Xem trước chip</p>
            <div className="flex justify-center p-6 bg-secondary/30 rounded-2xl border border-dashed border-border">
              <span className={`px-4 py-1.5 rounded-full text-[13px] font-bold border transition-all ${
                reasonLabel ? 'bg-primary text-primary-foreground border-primary' : 'bg-white text-muted-foreground border-border'
              }`}>
                {reasonLabel || 'Lý do của bạn'}
              </span>
            </div>
          </div>
        </div>
      </ConfirmModal>

      <ConfirmModal
        isOpen={!!isDeleting}
        onClose={() => setIsDeleting(null)}
        onConfirm={() => isDeleting && deleteReason(isDeleting)}
        title="Xoá lý do này?"
        message="Hành động này không thể hoàn tác. Bé sẽ không nhìn thấy lý do này khi chọn huỷ đơn."
        confirmText="Xoá vĩnh viễn"
        cancelText="Giữ lại"
        variant="destructive"
      />

      <ConfirmModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onConfirm={handleSaveCategory}
        title={editingCategory ? "Sửa danh mục" : "Thêm danh mục mới"}
        confirmText="Lưu lại"
        cancelText="Huỷ"
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-2 ml-1">Tên danh mục (tối đa 20 ký tự)</label>
            <input
              type="text"
              maxLength={20}
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="Nhập tên danh mục..."
              className="w-full px-4 py-3 rounded-2xl bg-secondary border-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-2 ml-1">Chọn Emoji</label>
            <div className="bg-secondary/50 rounded-2xl p-3 border border-border">
              <div className="grid grid-cols-8 gap-1 mb-3">
                {['🍚', '🍜', '🍝', '🍛', '🥗', '🥦', '🥟', '🍮', '🍊', '🥛', '🥤', '🍿', '🧁', '🍔', '🍰', '🥚', '🍗', '🥩', '🫕', '🍱', '🧆', '🥙', '🫔', '🌮', '🥪', '🍙', '🍘', '🍣', '🍤', '🦐', '🥜', '🫘', '🌽', '🥕', '🫑', '🍆', '🥔', '🧀', '🥞', '🧇'].map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setCategoryEmoji(emoji)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-all ${
                      categoryEmoji === emoji ? 'bg-primary text-white scale-110 shadow-sm' : 'hover:bg-primary/10'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase shrink-0">Custom:</span>
                <input
                  type="text"
                  value={categoryEmoji}
                  onChange={(e) => setCategoryEmoji(e.target.value.substring(0, 2))}
                  className="w-12 h-8 px-2 py-1 rounded-lg bg-card border border-border text-center text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-2 ml-1">Chọn màu sắc</label>
            <div className="bg-secondary/50 rounded-2xl p-3 border border-border">
              <div className="flex flex-wrap gap-2 mb-3">
                {['#F97316', '#22C55E', '#8B5CF6', '#EC4899', '#F59E0B', '#06B6D4', '#3B82F6', '#EF4444', '#D97706', '#6B7280'].map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setCategoryColor(color)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      categoryColor === color ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full border border-border" style={{ backgroundColor: categoryColor }} />
                <input
                  type="text"
                  value={categoryColor}
                  onChange={(e) => setCategoryColor(e.target.value)}
                  className="flex-1 h-8 px-3 py-1 rounded-lg bg-card border border-border text-xs font-mono"
                  placeholder="#HEX"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Xem trước</p>
            <div className="flex justify-center p-6 bg-secondary/30 rounded-2xl border border-dashed border-border">
              <span 
                className="px-3 py-1 rounded-full text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                style={{ backgroundColor: `${categoryColor}15`, color: categoryColor, border: `1px solid ${categoryColor}30` }}
              >
                <span>{categoryEmoji}</span>
                <span>{categoryName || 'Tên danh mục'}</span>
              </span>
            </div>
          </div>
        </div>
      </ConfirmModal>

      <ConfirmModal
        isOpen={!!isDeletingCategory}
        onClose={() => setIsDeletingCategory(null)}
        onConfirm={() => isDeletingCategory && deleteCategory(isDeletingCategory)}
        title="Xoá danh mục này?"
        message={recipesUsingCategory > 0 ? (
          <div>
            Có <span className="font-bold text-destructive">{recipesUsingCategory}</span> công thức đang dùng danh mục này. 
            Sau khi xóa, các công thức đó sẽ không có danh mục.
          </div>
        ) : "Bé sẽ không nhìn thấy danh mục này khi lọc món ăn."}
        confirmText="Xoá vĩnh viễn"
        cancelText="Giữ lại"
        variant="destructive"
      />
    </div>
  );
}

interface SortableReasonItemProps {
  reason: CancelReason;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void | Promise<void>;
  isOnlyActive: boolean;
}

const SortableReasonItem: React.FC<SortableReasonItemProps> = ({ reason, onEdit, onDelete, onToggle, isOnlyActive }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: reason.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    position: 'relative' as const
  };

  const isOther = reason.label === 'Lý do khác';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 p-3 rounded-2xl border transition-all ${
        isDragging ? 'bg-card border-primary shadow-xl scale-[1.02]' : 'bg-card border-border hover:border-primary/30'
      } ${!reason.isActive ? 'opacity-60 bg-secondary/50' : ''}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-primary transition-colors">
        <GripVertical size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <span className={`text-sm font-bold truncate block ${!reason.isActive ? 'text-muted-foreground' : 'text-foreground'}`}>
          {reason.label}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggle}
          disabled={reason.isActive && isOnlyActive}
          className={`p-2 transition-colors ${
            reason.isActive ? 'text-primary' : 'text-muted-foreground'
          } hover:bg-primary/5 rounded-lg disabled:opacity-30`}
          title={reason.isActive && isOnlyActive ? "Phải có ít nhất 1 lý do hoạt động" : ""}
        >
          {reason.isActive ? <ToggleRight size={20} className="text-primary" /> : <ToggleLeft size={20} />}
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="p-2 text-muted-foreground hover:text-primary transition-colors hover:bg-primary/5 rounded-lg"
        >
          <Edit2 size={16} />
        </button>

        {isOther ? (
          <div className="p-2 text-muted-foreground/30 cursor-not-allowed" title="Lý do này không thể xóa">
            <Trash2 size={16} />
          </div>
        ) : (
          <button
            type="button"
            onClick={onDelete}
            className="p-2 text-muted-foreground hover:text-destructive transition-colors hover:bg-destructive/5 rounded-lg"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

interface SortableCategoryItemProps {
  category: Category;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}

const SortableCategoryItem: React.FC<SortableCategoryItemProps> = ({ category, onEdit, onDelete, onToggle }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: category.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    position: 'relative' as const
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 p-3 rounded-2xl border transition-all ${
        isDragging ? 'bg-card border-primary shadow-xl scale-[1.02]' : 'bg-card border-border hover:border-primary/30'
      } ${!category.isActive ? 'opacity-60 bg-secondary/50' : ''}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-primary transition-colors">
        <GripVertical size={16} />
      </div>

      <div className="flex-1 flex items-center gap-3 min-w-0">
        <span className="text-xl shrink-0">{category.emoji}</span>
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-bold truncate block ${!category.isActive ? 'text-muted-foreground' : 'text-foreground'}`}>
            {category.name}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: category.color }} />
            <span className="text-[10px] font-mono text-muted-foreground uppercase">{category.color}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggle}
          className={`p-2 transition-colors ${
            category.isActive ? 'text-primary' : 'text-muted-foreground'
          } hover:bg-primary/5 rounded-lg`}
        >
          {category.isActive ? <ToggleRight size={20} className="text-primary" /> : <ToggleLeft size={20} />}
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="p-2 text-muted-foreground hover:text-primary transition-colors hover:bg-primary/5 rounded-lg"
        >
          <Edit2 size={16} />
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="p-2 text-muted-foreground hover:text-destructive transition-colors hover:bg-destructive/5 rounded-lg"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};
