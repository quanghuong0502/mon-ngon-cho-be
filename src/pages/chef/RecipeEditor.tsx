/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp, 
  updateDoc,
  collection
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { uploadToCloudinary, getOptimizedUrl } from '../../lib/cloudinary';
import { Recipe } from '../../types';
import { getSession } from '../../lib/auth';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import ConfirmModal from '../../components/ConfirmModal';
import { 
  ArrowLeft, 
  Upload, 
  Plus, 
  Trash2, 
  GripVertical, 
  Save,
  Loader2,
  X,
  CheckCircle2
} from 'lucide-react';

interface Ingredient {
  amount: string;
  unit: string;
  name: string;
}

export default function RecipeEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const session = getSession();
  const isNew = !id || id === 'new';
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isInitialMount = useRef(true);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ amount: '', unit: '', name: '' }]);
  const [steps, setSteps] = useState<string[]>(['']);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const autoSaveTimer = useRef<any>(null);

  useEffect(() => {
    if (isNew) {
      isInitialMount.current = false;
    }
    if (!isNew) {
      fetchRecipe();
    }
    
    return () => {
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    };
  }, [id]);

  // Record changes to trigger dirty state
  useEffect(() => {
    if (!loading && !isInitialMount.current) {
      setIsDirty(true);
    }
  }, [title, description, ingredients, steps, tags, isPublished, imageFile]);

  // Auto-save logic
  useEffect(() => {
    if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    
    if (!isNew && title) {
      autoSaveTimer.current = setInterval(() => {
        handleSave(true);
      }, 30000); // 30 seconds
    }
  }, [title, description, ingredients, steps, tags, isPublished, imageUrl]);

  const fetchRecipe = async () => {
    try {
      const docRef = doc(db, 'recipes', id!);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as Recipe;
        setTitle(data.title);
        setDescription(data.description);
        setIngredients(data.ingredients.map(item => {
          const parts = item.split(' ');
          return {
            amount: parts[0] || '',
            unit: parts[1] || '',
            name: parts.slice(2).join(' ') || ''
          };
        }));
        setSteps(data.steps);
        setTags(data.tags || []);
        setIsPublished(data.isPublished);
        setImageUrl(data.imageUrl || '');
        setImagePreview(data.imageUrl || '');
        // Reset mount ref after data is loaded to allow dirty tracking
        setTimeout(() => {
          isInitialMount.current = false;
          setIsDirty(false);
        }, 100);
      }
    } catch (error) {
      console.error('Error fetching recipe:', error);
      toast.error('Không thể tải công thức');
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setIsDirty(true);
    }
  };

  const handleBack = () => {
    if (isDirty) {
      setShowLeaveConfirm(true);
    } else {
      navigate('/chef/recipes');
    }
  };

  const handleSave = async (isAuto = false) => {
    if (!title) return;
    if (!isAuto) setSaving(true);

    try {
      let finalImageUrl = imageUrl;
      if (imageFile) {
        setUploadingImage(true);
        try {
          finalImageUrl = await uploadToCloudinary(imageFile, 'buacomchobe/recipes');
          setImageUrl(finalImageUrl);
          setImageFile(null);
        } catch (err) {
          throw new Error('Tải ảnh thất bại: ' + (err instanceof Error ? err.message : 'Lỗi không xác định'));
        } finally {
          setUploadingImage(false);
        }
      }

      const formattedIngredients = ingredients
        .filter(i => i.name.trim())
        .map(i => `${i.amount} ${i.unit} ${i.name}`.trim());

      const recipeData: any = {
        title,
        description,
        ingredients: formattedIngredients,
        steps: steps.filter(s => s.trim()),
        tags,
        imageUrl: finalImageUrl,
        isPublished,
        updatedAt: serverTimestamp(),
        createdBy: session?.userId,
      };

      if (isNew) {
        recipeData.avgRating = 0;
        recipeData.totalRatings = 0;
        recipeData.createdAt = serverTimestamp();
      }

      if (isNew) {
        const newRef = doc(collection(db, 'recipes'));
        await setDoc(newRef, recipeData);
        setIsDirty(false);
        if (!isAuto) {
          toast.success('Đã lưu công thức!', { duration: 2000 });
          navigate('/chef/recipes');
        }
      } else {
        await updateDoc(doc(db, 'recipes', id!), recipeData);
        setIsDirty(false);
        if (!isAuto) {
          toast.success('Đã lưu công thức!', { duration: 2000 });
          navigate('/chef/recipes');
        }
      }
    } catch (error) {
      console.error('Error saving recipe:', error);
      if (!isAuto) {
        toast.error('Lỗi khi lưu công thức');
      }
    } finally {
      if (!isAuto) setSaving(false);
    }
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { amount: '', unit: '', name: '' }]);
    setIsDirty(true);
  };
  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
    setIsDirty(true);
  };
  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const newIngs = [...ingredients];
    newIngs[index][field] = value;
    setIngredients(newIngs);
    setIsDirty(true);
  };

  const addStep = () => {
    setSteps([...steps, '']);
    setIsDirty(true);
  };
  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
    setIsDirty(true);
  };
  const updateStep = (index: number, value: string) => {
    const newSteps = [...steps];
    newSteps[index] = value;
    setSteps(newSteps);
    setIsDirty(true);
  };

  const addTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
        setIsDirty(true);
      }
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
    setIsDirty(true);
  };

  if (loading) return (
    <div className="flex items-center justify-center p-24">
      <Loader2 className="animate-spin text-primary" size={40} />
    </div>
  );

  return (
    <div className="page-container px-4">
      <div className="page-header shrink-0 pt-5 mb-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={handleBack}
              className="p-3 bg-card rounded-2xl border border-border text-muted-foreground hover:text-primary transition-all flex items-center gap-2 group"
            >
              <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
            </button>
            <div className="space-y-[2px]">
              <h1 className="text-[20px] font-semibold text-foreground">
                {isNew ? 'Thêm công thức' : 'Chỉnh sửa công thức'}
              </h1>
              <p className="text-[13px] font-normal text-muted-foreground">
                {isNew ? 'Tạo món ăn mới cho thực đơn của bé' : 'Cập nhật lại thông tin món ăn'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => handleSave()}
              disabled={saving || !title}
              className="flex items-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-3 rounded-2xl shadow-lg shadow-primary-shadow/30 hover:opacity-90 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              Lưu công thức
            </button>
          </div>
        </div>
      </div>

      <div className="page-content">
        <div className="max-w-4xl mx-auto pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              {/* Main Info */}
              <section className="bg-card p-8 rounded-3xl border border-border shadow-sm space-y-6">
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-2">Tên công thức</label>
                  <input 
                    type="text" 
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Ví dụ: Cháo Cá Hồi Cà Rốt"
                    className="w-full px-5 py-4 bg-secondary border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-2">Mô tả ngắn</label>
                  <textarea 
                    rows={3}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Món ăn giàu Omega-3, tốt cho não bộ của bé..."
                    className="w-full px-5 py-4 bg-secondary border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none text-foreground"
                  />
                </div>
              </section>

              {/* Ingredients */}
              <section className="bg-card p-8 rounded-3xl border border-border shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-foreground">Nguyên liệu</h2>
                  <button 
                    onClick={addIngredient}
                    className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-all"
                  >
                    <Plus size={20} />
                  </button>
                </div>
                <div className="space-y-4">
                  {ingredients.map((ing, idx) => (
                    <div key={idx} className="flex gap-3">
                      <input 
                        type="text" 
                        placeholder="Lượng"
                        value={ing.amount}
                        onChange={e => updateIngredient(idx, 'amount', e.target.value)}
                        className="w-20 px-4 py-2 bg-secondary border border-border rounded-xl focus:border-primary outline-none text-foreground"
                      />
                      <input 
                        type="text" 
                        placeholder="Đv"
                        value={ing.unit}
                        onChange={e => updateIngredient(idx, 'unit', e.target.value)}
                        className="w-20 px-4 py-2 bg-secondary border border-border rounded-xl focus:border-primary outline-none text-foreground"
                      />
                      <input 
                        type="text" 
                        placeholder="Tên nguyên liệu"
                        value={ing.name}
                        onChange={e => updateIngredient(idx, 'name', e.target.value)}
                        className="flex-1 px-4 py-2 bg-secondary border border-border rounded-xl focus:border-primary outline-none text-foreground"
                      />
                      <button 
                        onClick={() => removeIngredient(idx)}
                        className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Steps */}
              <section className="bg-card p-8 rounded-3xl border border-border shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-foreground">Các bước thực hiện</h2>
                  <button 
                    onClick={addStep}
                    className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-all"
                  >
                    <Plus size={20} />
                  </button>
                </div>
                <div className="space-y-6">
                  {steps.map((step, idx) => (
                    <div key={idx} className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0 mt-2">
                        {idx + 1}
                      </div>
                      <div className="flex-1 relative">
                        <textarea 
                          rows={2}
                          value={step}
                          onChange={e => updateStep(idx, e.target.value)}
                          placeholder={`Bước ${idx + 1}...`}
                          className="w-full px-5 py-4 bg-secondary border border-border rounded-2xl focus:border-primary outline-none resize-none text-foreground"
                        />
                        <button 
                          onClick={() => removeStep(idx)}
                          className="absolute top-2 right-2 text-muted-foreground hover:text-destructive p-1"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-8">
              {/* Image Upload */}
              <section className="bg-card p-6 rounded-3xl border border-border shadow-sm">
                <h2 className="text-sm font-bold text-muted-foreground mb-4 px-1">Ảnh món ăn</h2>
                <div className="relative group aspect-square rounded-2xl bg-secondary border-2 border-dashed border-border overflow-hidden flex flex-col items-center justify-center text-center p-4">
                  {imagePreview ? (
                    <>
                      <img src={getOptimizedUrl(imagePreview, 800)} className="absolute inset-0 w-full h-full object-cover" />
                      {uploadingImage && (
                        <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] flex items-center justify-center z-10">
                          <Loader2 className="animate-spin text-primary" size={32} />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <label className={`cursor-pointer bg-white/20 backdrop-blur-md text-white p-4 rounded-full border border-white/40 ${uploadingImage ? 'pointer-events-none' : ''}`}>
                          <Upload size={24} />
                          <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} disabled={uploadingImage} />
                        </label>
                      </div>
                    </>
                  ) : (
                    <label className={`cursor-pointer flex flex-col items-center ${uploadingImage ? 'pointer-events-none' : ''}`}>
                      {uploadingImage ? (
                        <Loader2 className="animate-spin text-primary" size={32} />
                      ) : (
                        <>
                          <Upload size={32} className="text-muted-foreground/30 mb-2" />
                          <span className="text-xs font-bold text-muted-foreground/40">Tải ảnh lên</span>
                        </>
                      )}
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} disabled={uploadingImage} />
                    </label>
                  )}
                  {uploadingImage && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                      <Loader2 size={32} className="text-primary animate-spin mb-2" />
                      <span className="text-xs font-bold text-muted-foreground">Đang tải ảnh lên...</span>
                    </div>
                  )}
                </div>
              </section>

              {/* Status & Options */}
              <section className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-muted-foreground">Công khai</span>
                  <button 
                    onClick={() => setIsPublished(!isPublished)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${isPublished ? 'bg-green-500' : 'bg-muted/40'}`}
                  >
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${isPublished ? 'translate-x-6' : ''}`} />
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-3 px-1">Gắn thẻ</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {tags.map(tag => (
                      <span 
                        key={tag} 
                        className="flex items-center gap-1 bg-primary/10 text-primary text-xs font-bold px-3 py-1.5 rounded-xl border border-primary/20"
                      >
                        {tag}
                        <button onClick={() => removeTag(tag)} className="hover:text-destructive">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={addTag}
                      placeholder="Nhập thẻ + Enter"
                      className="w-full px-4 py-2 text-sm bg-secondary border border-border rounded-xl outline-none focus:border-primary text-foreground"
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={() => navigate('/chef/recipes')}
        icon="⚠️"
        title="Chưa lưu thay đổi?"
        message="Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời trang không?"
        confirmText="Rời khỏi trang"
        cancelText="Tiếp tục chỉnh sửa"
        confirmStyle="warning"
      />
    </div>
  );
}
