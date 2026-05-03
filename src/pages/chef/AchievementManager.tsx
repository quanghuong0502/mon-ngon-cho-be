/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  Trophy, 
  Plus, 
  Edit2, 
  Trash2, 
  Check, 
  X, 
  Eye, 
  EyeOff, 
  Flame, 
  Utensils, 
  Star, 
  Heart,
  Award,
  ChevronRight,
  Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';

interface AchievementCondition {
  type: string;
  operator: 'gte' | 'lte' | 'eq' | 'gt' | 'lt';
  value: number;
  label: string;
}

interface Achievement {
  id?: string;
  title: string;
  description: string;
  emoji: string;
  isActive: boolean;
  order: number;
  logic: 'AND' | 'OR';
  conditions: AchievementCondition[];
  createdAt?: any;
}

const CONDITION_CATEGORIES = [
  {
    label: '🍱 Đặt món & Bữa ăn',
    types: [
      { value: 'total_orders_done', label: 'Tổng số bữa đã hoàn thành' },
      { value: 'total_orders_week', label: 'Số bữa trong tuần này' },
      { value: 'total_orders_month', label: 'Số bữa trong tháng này' },
      { value: 'orders_cancelled', label: 'Số lần huỷ đơn' },
      { value: 'unique_recipes_tried', label: 'Số món khác nhau đã thử' },
      { value: 'unique_recipes_this_week', label: 'Số món khác nhau đã thử tuần này' },
    ]
  },
  {
    label: '🔥 Streak',
    types: [
      { value: 'current_streak', label: 'Streak hiện tại' },
      { value: 'longest_streak', label: 'Kỷ lục streak dài nhất' },
      { value: 'perfect_week', label: 'Đặt đủ cả tuần (Mon-Fri)' },
    ]
  },
  {
    label: '⭐ Đánh giá',
    types: [
      { value: 'total_reviews', label: 'Tổng số đánh giá' },
      { value: 'five_star_reviews', label: 'Số lần cho 5 sao' },
      { value: 'reviews_with_photo', label: 'Đánh giá có ảnh' },
      { value: 'reviews_with_comment', label: 'Đánh giá có bình luận' },
    ]
  },
  {
    label: '❤️ Yêu thích',
    types: [
      { value: 'total_favorites', label: 'Số món yêu thích' },
      { value: 'favorites_tried', label: 'Món yêu thích đã được ăn' },
    ]
  },
  {
    label: '📅 Thời gian',
    types: [
      { value: 'days_since_joined', label: 'Số ngày từ khi tham gia' },
      { value: 'account_age_weeks', label: 'Số tuần đã tham gia' },
    ]
  }
];

const OPERATORS = [
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'eq', label: '=' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
];

const getConditionLabel = (condition: AchievementCondition) => {
  const typeLabel = CONDITION_CATEGORIES.flatMap(c => c.types).find(t => t.value === condition.type)?.label || condition.type;
  const opLabel = OPERATORS.find(o => o.value === condition.operator)?.label || condition.operator;
  return `${typeLabel} ${opLabel} ${condition.value}`;
};

const EMOJIS = ['🍱', '🔥', '⭐', '🏆', '❤️', '🌟', '🎯', '💪', '🎖️', '🥇', '🌈', '✨', '🎉', '🍜', '🍚'];

export default function AchievementManager() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAchievement, setEditingAchievement] = useState<Achievement | null>(null);
  const [formData, setFormData] = useState<Achievement>({
    title: '',
    description: '',
    emoji: '🍱',
    isActive: true,
    order: 0,
    logic: 'AND',
    conditions: [{ type: 'total_orders_done', operator: 'gte', value: 1, label: '' }]
  });

  useEffect(() => {
    const q = query(collection(db, 'achievements'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Achievement));
      setAchievements(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenModal = (achievement?: Achievement) => {
    if (achievement) {
      setEditingAchievement(achievement);
      setFormData({
        ...achievement,
        logic: achievement.logic || 'AND',
        conditions: achievement.conditions || [{ type: 'total_orders_done', operator: 'gte', value: 1, label: 'Tổng số bữa đã hoàn thành ≥ 1' }]
      });
    } else {
      setEditingAchievement(null);
      setFormData({
        title: '',
        description: '',
        emoji: '🍱',
        isActive: true,
        order: achievements.length + 1,
        logic: 'AND',
        conditions: [{ type: 'total_orders_done', operator: 'gte', value: 1, label: 'Tổng số bữa đã hoàn thành ≥ 1' }]
      });
    }
    setIsModalOpen(true);
  };

  const addCondition = () => {
    if (formData.conditions.length >= 4) {
      toast.error('Tối đa 4 điều kiện');
      return;
    }
    const newCondition: AchievementCondition = { type: 'total_orders_done', operator: 'gte', value: 1, label: 'Tổng số bữa đã hoàn thành ≥ 1' };
    setFormData({ ...formData, conditions: [...formData.conditions, newCondition] });
  };

  const updateCondition = (index: number, field: keyof AchievementCondition, value: any) => {
    const newConditions = [...formData.conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };
    newConditions[index].label = getConditionLabel(newConditions[index]);
    setFormData({ ...formData, conditions: newConditions });
  };

  const removeCondition = (index: number) => {
    if (formData.conditions.length === 1) return;
    const newConditions = formData.conditions.filter((_, i) => i !== index);
    setFormData({ ...formData, conditions: newConditions });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dataToSave = {
        ...formData,
        conditions: formData.conditions.map(c => ({ ...c, label: getConditionLabel(c) })),
        createdAt: serverTimestamp()
      };

      if (editingAchievement?.id) {
        await updateDoc(doc(db, 'achievements', editingAchievement.id), dataToSave);
        toast.success('Cập nhật thành công!');
      } else {
        await addDoc(collection(db, 'achievements'), dataToSave);
        toast.success('Thêm mới thành công!');
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving achievement:', error);
      toast.error('Có lỗi xảy ra!');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Xóa thành tích này sẽ không ảnh hưởng đến dữ liệu bé đã đạt. Bạn chắc chắn chứ?')) {
      try {
        await deleteDoc(doc(db, 'achievements', id));
        toast.success('Đã xóa thành tích');
      } catch (error) {
        console.error('Error deleting achievement:', error);
        toast.error('Có lỗi xảy ra!');
      }
    }
  };

  const toggleActive = async (achievement: Achievement) => {
    if (!achievement.id) return;
    try {
      await updateDoc(doc(db, 'achievements', achievement.id), {
        isActive: !achievement.isActive,
        updatedAt: serverTimestamp()
      });
      toast.success(achievement.isActive ? 'Đã ẩn thành tích' : 'Đã hiện thành tích');
    } catch (error: any) {
      console.error('Error toggling achievement:', error);
      toast.error('Lỗi khi cập nhật trạng thái');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-[18px] md:text-2xl font-bold flex items-center gap-2">
            <Trophy className="text-primary md:w-6 md:h-6" size={20} />
            Quản lý Thành tích
          </h2>
          <p className="text-muted-foreground text-[12px] md:text-sm">Tạo thành tích để khuyến khích các bé</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="w-fit bg-primary text-primary-foreground px-4 py-2.5 md:py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all text-[13px] md:text-sm"
        >
          <Plus size={18} className="md:w-5 md:h-5" />
          Thêm thành tích
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {achievements.map((achievement) => (
          <motion.div 
            layout
            key={achievement.id}
            className={`bg-card border border-border p-4 md:p-5 rounded-[24px] md:rounded-3xl shadow-sm hover:shadow-md transition-all ${!achievement.isActive ? 'opacity-60 grayscale-[0.5]' : ''}`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-secondary rounded-xl md:rounded-2xl flex items-center justify-center text-xl md:text-2xl">
                {achievement.emoji}
              </div>
              <div className="flex items-center gap-1 md:gap-2">
                <button 
                  onClick={() => toggleActive(achievement)}
                  className={`p-1.5 md:p-2 rounded-full transition-colors ${achievement.isActive ? 'text-green-500 hover:bg-green-500/10' : 'text-muted-foreground hover:bg-secondary'}`}
                  title={achievement.isActive ? 'Đang bật' : 'Đang tắt'}
                >
                  {achievement.isActive ? <Eye size={16} className="md:w-4.5 md:h-4.5" /> : <EyeOff size={16} className="md:w-4.5 md:h-4.5" />}
                </button>
                <button 
                  onClick={() => handleOpenModal(achievement)}
                  className="p-1.5 md:p-2 text-muted-foreground hover:text-primary transition-colors hover:bg-primary/10 rounded-full"
                >
                  <Edit2 size={16} className="md:w-4.5 md:h-4.5" />
                </button>
                <button 
                  onClick={() => handleDelete(achievement.id!)}
                  className="p-1.5 md:p-2 text-muted-foreground hover:text-destructive transition-colors hover:bg-destructive/10 rounded-full"
                >
                  <Trash2 size={16} className="md:w-4.5 md:h-4.5" />
                </button>
              </div>
            </div>

            <h3 className="font-bold text-foreground text-[14px] md:text-base mb-1">{achievement.title}</h3>
            <p className="text-[11px] md:text-xs text-muted-foreground mb-4 line-clamp-2 leading-relaxed">{achievement.description}</p>

            <div className="pt-3 md:pt-4 border-t border-border mt-auto">
              <div className="space-y-1.5">
                {achievement.conditions?.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] md:text-[11px] text-muted-foreground font-medium">
                    <Check size={10} className="text-primary md:w-3 md:h-3 shrink-0" />
                    <span className="truncate">{c.label}</span>
                  </div>
                ))}
              </div>
              {achievement.conditions?.length > 1 && (
                <div className="mt-2.5 text-[9px] md:text-[10px] font-black text-primary uppercase tracking-wider bg-primary/5 px-2 py-0.5 rounded inline-block">
                  Logic: {achievement.logic === 'AND' ? 'VÀ' : 'HOẶC'}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="bg-card w-full max-w-xl h-[92vh] sm:h-auto sm:max-h-[85vh] overflow-hidden rounded-t-[32px] sm:rounded-3xl shadow-2xl relative flex flex-col font-sans"
            >
              {/* Drag Handle */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-10 h-1 bg-border rounded-full" />
              </div>

              {/* Modal Header */}
              <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0 bg-card/80 backdrop-blur-md sticky top-0 z-20">
                <h3 className="text-[17px] font-semibold text-foreground">{editingAchievement ? 'Sửa thành tích' : ' Thêm thành tích'}</h3>
                <div className="w-11 h-11 -mr-2 flex items-center justify-center">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)} 
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-all"
                  >
                    <X size={22} />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSave} className="flex-1 overflow-y-auto no-scrollbar scroll-smooth">
                <div className="p-5 space-y-6">
                  {/* Basic Info Section */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="block text-[13px] font-semibold text-muted-foreground/80 px-0.5">Biểu tượng</label>
                        <div className="grid grid-cols-5 gap-1.5 p-1.5 bg-secondary/30 rounded-xl border border-border/50">
                          {EMOJIS.map(emoji => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => setFormData({...formData, emoji})}
                              className={`text-[19px] h-9 w-9 flex items-center justify-center rounded-lg transition-all ${
                                formData.emoji === emoji 
                                  ? 'bg-primary text-primary-foreground shadow-sm scale-105' 
                                  : 'hover:bg-background text-foreground'
                              }`}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[13px] font-semibold text-muted-foreground/80 px-0.5">Thứ tự</label>
                        <input 
                          type="number"
                          value={formData.order}
                          onChange={e => setFormData({...formData, order: parseInt(e.target.value)})}
                          className="w-full h-11 bg-background border border-border rounded-xl px-4 text-[15px] text-foreground focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/40"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[13px] font-semibold text-muted-foreground/80 px-0.5">Tiêu đề thành tích</label>
                      <input 
                        required
                        type="text"
                        value={formData.title}
                        placeholder="Ví dụ: 5 ngày liên tiếp"
                        onChange={e => setFormData({...formData, title: e.target.value})}
                        className="w-full h-11 bg-background border border-border rounded-xl px-4 text-[15px] text-foreground focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/40"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[13px] font-semibold text-muted-foreground/80 px-0.5">Logic kết hợp</label>
                      <select 
                        value={formData.logic}
                        onChange={e => setFormData({...formData, logic: e.target.value as any})}
                        className="w-full h-11 bg-background border border-border rounded-xl px-4 text-[15px] text-foreground focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%20stroke%3D%22currentColor%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[position:right_12px_center] bg-no-repeat"
                        disabled={formData.conditions.length <= 1}
                      >
                        <option value="AND">Tất cả điều kiện (VÀ)</option>
                        <option value="OR">Một trong các điều kiện (HOẶC)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[13px] font-semibold text-muted-foreground/80 px-0.5">Mô tả cho bé</label>
                      <textarea 
                        value={formData.description}
                        placeholder="Bé sẽ thấy mô tả này khi xem chi tiết..."
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        className="w-full bg-background border border-border rounded-xl px-4 py-3 text-[15px] text-foreground focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/40 h-24 resize-none"
                      />
                    </div>
                  </div>

                  {/* Conditions Section */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-3 px-0.5">
                      <label className="text-[13px] font-bold text-muted-foreground/80">Điều kiện đạt thành tích</label>
                      <button 
                        type="button"
                        onClick={addCondition}
                        className="h-9 px-3.5 bg-background text-primary text-[13px] font-semibold rounded-lg hover:bg-primary/5 transition-all flex items-center gap-1 border border-dashed border-primary/40"
                      >
                        <Plus size={14} />
                        Thêm điều kiện
                      </button>
                    </div>

                    <div className="space-y-4">
                      {formData.conditions.map((condition, idx) => (
                        <div key={idx} className="p-4 bg-secondary/20 rounded-2xl border border-border space-y-4 relative group">
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <label className="block text-[11px] font-medium text-muted-foreground">Loại điều kiện</label>
                              <select 
                                value={condition.type}
                                onChange={e => updateCondition(idx, 'type', e.target.value)}
                                className="w-full h-11 bg-background border border-border rounded-xl px-3 text-[14px] text-foreground focus:border-primary outline-none"
                              >
                                {CONDITION_CATEGORIES.map(cat => (
                                  <optgroup key={cat.label} label={cat.label}>
                                    {cat.types.map(t => (
                                      <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-4">
                              <div className="sm:w-[120px] space-y-1.5">
                                <label className="block text-[11px] font-medium text-muted-foreground">Dấu toán</label>
                                <div className="flex bg-background border border-border rounded-xl p-1 gap-1">
                                  {OPERATORS.filter(op => ['lt', 'eq', 'gt'].includes(op.value)).map(op => (
                                    <button
                                      key={op.value}
                                      type="button"
                                      onClick={() => updateCondition(idx, 'operator', op.value as any)}
                                      className={`flex-1 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-all ${
                                        condition.operator === op.value 
                                          ? 'bg-primary text-primary-foreground shadow-sm' 
                                          : 'hover:bg-secondary text-muted-foreground'
                                      }`}
                                    >
                                      {op.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex-1 space-y-1.5">
                                <label className="block text-[11px] font-medium text-muted-foreground">Số lượng</label>
                                <div className="flex items-center bg-background border border-border rounded-xl overflow-hidden h-11">
                                  <button 
                                    type="button"
                                    onClick={() => updateCondition(idx, 'value', Math.max(0, condition.value - 1))}
                                    className="w-12 h-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
                                  >
                                    <Minus size={16} />
                                  </button>
                                  <input 
                                    type="number"
                                    value={condition.value}
                                    onChange={e => updateCondition(idx, 'value', parseInt(e.target.value) || 0)}
                                    className="flex-1 min-w-0 h-full bg-transparent text-center text-[15px] font-bold text-foreground outline-none border-x border-border"
                                  />
                                  <button 
                                    type="button"
                                    onClick={() => updateCondition(idx, 'value', condition.value + 1)}
                                    className="w-12 h-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
                                  >
                                    <Plus size={16} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between p-3 bg-background rounded-xl border border-border">
                            <div className="flex items-center gap-2">
                              <span className="text-primary font-bold">•</span>
                              <span className="text-[13px] font-medium text-foreground">
                                {CONDITION_CATEGORIES.flatMap(c => c.types).find(t => t.value === condition.type)?.label || condition.type}{' '}
                                <span className="font-bold text-primary">
                                  {OPERATORS.find(o => o.value === condition.operator)?.label} {condition.value}
                                </span>
                              </span>
                            </div>
                            {formData.conditions.length > 1 && (
                              <button 
                                type="button"
                                onClick={() => removeCondition(idx)}
                                className="w-8 h-8 flex items-center justify-center text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Visibility section */}
                  <div className="py-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-semibold text-foreground">Hiển thị cho bé</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            formData.isActive ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'
                          }`}>
                            {formData.isActive ? 'Sẵn sàng' : 'Nháp'}
                          </span>
                        </div>
                        <p className="text-[12px] text-muted-foreground">Bé sẽ thấy thành tích này trong giao diện của mình</p>
                      </div>
                      <div 
                        onClick={() => setFormData({...formData, isActive: !formData.isActive})}
                        className={`w-12 h-6 rounded-full relative cursor-pointer transition-all duration-300 ${formData.isActive ? 'bg-primary' : 'bg-muted'}`}
                      >
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-background rounded-full shadow-sm transition-transform duration-300 ${formData.isActive ? 'translate-x-6' : ''}`} />
                      </div>
                    </div>
                  </div>

                  {/* Kid View Preview */}
                  <div className="mt-4 pt-5 border-t border-border/50">
                    <p className="text-[13px] font-bold text-muted-foreground/80 mb-4 px-0.5">Xem trước (Kid view)</p>
                    <div className="flex items-center gap-5 p-5 bg-secondary/20 rounded-[24px] border border-border shadow-sm">
                      <div className="w-[84px] h-[84px] bg-background rounded-[10px] shadow-sm flex flex-col items-center justify-center shrink-0 border border-border/50">
                        <span className="text-[32px] mb-1">{formData.emoji}</span>
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <h4 className="text-[15px] font-bold text-foreground line-clamp-1">{formData.title || 'Tiêu đề'}</h4>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] text-muted-foreground font-medium">Đạt khi:</span>
                          <span className="text-[12px] text-foreground leading-relaxed line-clamp-2">
                            {formData.conditions?.map((c, i) => (
                              <span key={i}>
                                {CONDITION_CATEGORIES.flatMap(cat => cat.types).find(t => t.value === c.type)?.label}{' '}
                                <span className="font-bold text-primary">
                                  {OPERATORS.find(op => op.value === c.operator)?.label} {c.value}
                                </span>
                                {i < formData.conditions.length - 1 ? (formData.logic === 'AND' ? ' & ' : ' | ') : ''}
                              </span>
                            ))}
                          </span>
                        </div>
                        <div className="space-y-1.5 pt-1">
                          <div className="flex justify-between items-center text-[10px] font-bold">
                            <span className="text-primary uppercase tracking-wide">Tiến độ: 1/1</span>
                            <span className="text-primary">Hoàn thành 100%</span>
                          </div>
                          <div className="h-2.5 bg-background rounded-full overflow-hidden p-0.5 border border-border">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: '100%' }}
                              className="h-full bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary-rgb),0.3)]" 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="p-5 flex items-center gap-3 border-t border-border bg-card sticky bottom-0 z-20 pb-20 sm:pb-5">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 h-10 px-4 text-muted-foreground text-[15px] font-semibold hover:bg-secondary rounded-xl transition-all"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 h-10 px-4 bg-primary text-primary-foreground text-[15px] font-semibold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all"
                  >
                    Lưu thành tích
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
