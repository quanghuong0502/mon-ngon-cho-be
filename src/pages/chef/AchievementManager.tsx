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
  ChevronRight
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
  { value: 'gte', label: '≥ ít nhất' },
  { value: 'lte', label: '≤ tối đa' },
  { value: 'eq', label: '= đúng bằng' },
  { value: 'gt', label: '> lớn hơn' },
  { value: 'lt', label: '< nhỏ hơn' },
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="text-primary" />
            Quản lý Thành tích
          </h2>
          <p className="text-muted-foreground text-sm">Tạo thành tích để khuyến khích các bé</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all text-sm"
        >
          <Plus size={20} />
          Thêm thành tích
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {achievements.map((achievement) => (
          <motion.div 
            layout
            key={achievement.id}
            className={`bg-card border border-border p-4 rounded-3xl shadow-sm hover:shadow-md transition-all ${!achievement.isActive ? 'opacity-60 grayscale-[0.5]' : ''}`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-secondary rounded-2xl flex items-center justify-center text-2xl">
                {achievement.emoji}
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => toggleActive(achievement)}
                  className={`p-2 rounded-full transition-colors ${achievement.isActive ? 'text-green-500 hover:bg-green-500/10' : 'text-muted-foreground hover:bg-secondary'}`}
                  title={achievement.isActive ? 'Đang bật' : 'Đang tắt'}
                >
                  {achievement.isActive ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
                <button 
                  onClick={() => handleOpenModal(achievement)}
                  className="p-2 text-muted-foreground hover:text-primary transition-colors hover:bg-primary/10 rounded-full"
                >
                  <Edit2 size={18} />
                </button>
                <button 
                  onClick={() => handleDelete(achievement.id!)}
                  className="p-2 text-muted-foreground hover:text-destructive transition-colors hover:bg-destructive/10 rounded-full"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <h3 className="font-bold text-foreground mb-1">{achievement.title}</h3>
            <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{achievement.description}</p>

            <div className="pt-4 border-t border-border mt-auto">
              <div className="space-y-1">
                {achievement.conditions?.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
                    <Check size={12} className="text-primary" />
                    <span>{c.label}</span>
                  </div>
                ))}
              </div>
              {achievement.conditions?.length > 1 && (
                <div className="mt-2 text-[10px] font-black text-primary uppercase tracking-wider bg-primary/5 px-2 py-0.5 rounded inline-block">
                  Logic: {achievement.logic === 'AND' ? 'Tất cả (VÀ)' : 'Một trong (HOẶC)'}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-card w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl relative"
            >
              <form onSubmit={handleSave} className="p-6">
                <div className="flex items-center justify-between mb-6 sticky top-0 bg-card z-10 pb-4 border-b border-border">
                  <h3 className="text-xl font-bold">{editingAchievement ? 'Sửa thành tích' : 'Thêm thành tích'}</h3>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="text-muted-foreground">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold mb-2">Biểu tượng (Emoji)</label>
                      <div className="grid grid-cols-5 gap-2 p-2 bg-secondary/50 rounded-xl">
                        {EMOJIS.map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setFormData({...formData, emoji})}
                            className={`text-xl p-1 rounded-lg transition-all ${formData.emoji === emoji ? 'bg-primary scale-110 shadow-sm' : 'hover:bg-secondary'}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold mb-2">Thứ tự sắp xếp</label>
                      <input 
                        type="number"
                        value={formData.order}
                        onChange={e => setFormData({...formData, order: parseInt(e.target.value)})}
                        className="w-full bg-secondary border-none rounded-xl p-3 focus:ring-2 focus:ring-primary h-[52px]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold mb-2">Tiêu đề</label>
                      <input 
                        required
                        type="text"
                        value={formData.title}
                        placeholder="Ví dụ: 5 ngày liên tiếp"
                        onChange={e => setFormData({...formData, title: e.target.value})}
                        className="w-full bg-secondary border-none rounded-xl p-3 focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold mb-2">Logic kết hợp</label>
                      <select 
                        value={formData.logic}
                        onChange={e => setFormData({...formData, logic: e.target.value as any})}
                        className="w-full bg-secondary border-none rounded-xl p-3 focus:ring-2 focus:ring-primary"
                        disabled={formData.conditions.length <= 1}
                      >
                        <option value="AND">Tất cả (VÀ)</option>
                        <option value="OR">Một trong (HOẶC)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-2">Mô tả</label>
                    <textarea 
                      value={formData.description}
                      placeholder="Mô tả cho bé thấy"
                      onChange={e => setFormData({...formData, description: e.target.value})}
                      className="w-full bg-secondary border-none rounded-xl p-3 focus:ring-2 focus:ring-primary h-20"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-bold">Điều kiện đạt thành tích</label>
                      <button 
                        type="button"
                        onClick={addCondition}
                        className="text-[11px] font-black text-primary uppercase bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20 flex items-center gap-1"
                      >
                        <Plus size={14} />
                        Thêm điều kiện
                      </button>
                    </div>

                    <div className="space-y-3">
                      {formData.conditions.map((condition, idx) => (
                        <div key={idx} className="p-4 bg-secondary/30 rounded-2xl border border-border space-y-3 relative group">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Loại điều kiện</label>
                              <select 
                                value={condition.type}
                                onChange={e => updateCondition(idx, 'type', e.target.value)}
                                className="w-full bg-secondary border-none rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary"
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
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Dấu toán</label>
                                <select 
                                  value={condition.operator}
                                  onChange={e => updateCondition(idx, 'operator', e.target.value as any)}
                                  className="w-full bg-secondary border-none rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary"
                                >
                                  {OPERATORS.map(op => (
                                    <option key={op.value} value={op.value}>{op.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Số lượng</label>
                                <input 
                                  type="number"
                                  value={condition.value}
                                  onChange={e => updateCondition(idx, 'value', parseInt(e.target.value))}
                                  className="w-full bg-secondary border-none rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-medium text-primary bg-primary/5 px-3 py-1.5 rounded-lg">
                            <span>{condition.label || getConditionLabel(condition)}</span>
                            {formData.conditions.length > 1 && (
                              <button 
                                type="button"
                                onClick={() => removeCondition(idx)}
                                className="text-destructive hover:scale-110 transition-transform"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div 
                        onClick={() => setFormData({...formData, isActive: !formData.isActive})}
                        className={`w-12 h-6 rounded-full relative transition-colors ${formData.isActive ? 'bg-primary' : 'bg-muted/30'}`}
                      >
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${formData.isActive ? 'translate-x-6' : ''}`} />
                      </div>
                      <span className="text-sm font-bold">Hiển thị cho bé (Sẵn sàng)</span>
                    </label>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Xem trước (Kid View)</p>
                    <div className="flex items-center gap-4 bg-secondary/20 p-4 rounded-2xl">
                      <div className="bg-[#FFF7ED] border border-[#FED7AA] rounded-[16px] p-4 flex flex-col items-center justify-center min-w-[100px] h-[100px] shadow-sm">
                        <div className="text-2xl mb-1">{formData.emoji}</div>
                        <span className="text-[9px] font-black text-center leading-tight line-clamp-2">{formData.title || 'Tiêu đề'}</span>
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-[12px] font-bold text-foreground line-clamp-1">{formData.title}</p>
                        <div className="text-[10px] text-muted-foreground font-medium">
                          Đạt khi: {formData.conditions?.map(c => c.label).join(formData.logic === 'AND' ? ' VÀ ' : ' HOẶC ')}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex gap-3 sticky bottom-0 bg-card pt-4 border-t border-border">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-3 bg-secondary rounded-xl font-bold"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20"
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
