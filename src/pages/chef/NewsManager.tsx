/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  orderBy, 
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { uploadToCloudinary, getOptimizedUrl } from '../../lib/cloudinary';
import { sendPushToUser, getAllKidOneSignalIds } from '../../lib/oneSignal';
import { News } from '../../types';
import { getSession } from '../../lib/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Pin, 
  Trash2, 
  Edit3, 
  Image as ImageIcon, 
  X, 
  Save, 
  Loader2,
  AlertTriangle,
  Upload,
  Megaphone
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { format } from 'date-fns';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import NewsModal from '../../components/NewsModal';
import ConfirmModal from '../../components/ConfirmModal';

export default function NewsManager() {
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<News> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedPreviewNews, setSelectedPreviewNews] = useState<News | null>(null);
  const session = getSession();

  useLockBodyScroll(!!editing || !!deleteConfirm || !!selectedPreviewNews);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');

  useEffect(() => {
    fetchNews();
  }, []);

  const stripHtml = (html: string) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const fetchNews = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      setNews(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as News)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePin = async (item: News, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, 'news', item.id!), {
        isPinned: !item.isPinned,
        updatedAt: serverTimestamp(),
      });
      fetchNews();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = (item: News | null = null, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (item) {
      setEditing({ ...item });
      setImagePreview(item.imageUrl || '');
    } else {
      setEditing({ 
        title: '', 
        content: '', 
        isPinned: false,
        isPublished: true
      });
      setImagePreview('');
    }
    setImageFile(null);
  };

  const handleSave = async () => {
    if (!editing || !editing.title) return;
    setSaving(true);
    try {
      let imageUrl = editing.imageUrl || '';
      if (imageFile) {
        try {
          imageUrl = await uploadToCloudinary(imageFile, 'buacomchobe/news');
        } catch (err) {
          toast.error('Tải ảnh thất bại, thử lại nhé!');
          setSaving(false);
          return;
        }
      }

      const newsData = {
        title: editing.title,
        content: editing.content,
        isPinned: !!editing.isPinned,
        isPublished: !!editing.isPublished,
        imageUrl,
        updatedAt: serverTimestamp(),
      };

      if (editing.id) {
        // Find the old item to check transition
        const oldItem = news.find(n => n.id === editing.id);
        const wasDraft = oldItem && !oldItem.isPublished;
        const isNowPublished = editing.isPublished;

        await updateDoc(doc(db, 'news', editing.id), newsData);

        // Notify if transitioning from draft to published
        if (wasDraft && isNowPublished) {
          try {
            const kidIds = await getAllKidOneSignalIds();
            if (kidIds.length > 0) {
              const pushBody = editing.title!.length > 100 
                ? editing.title!.substring(0, 97) + '...' 
                : editing.title!;

              await sendPushToUser(
                kidIds,
                'Tin mới từ Đầu bếp',
                pushBody,
                '/kids/home'
              );
            }
          } catch (err) {
            console.error('Notify kids error:', err);
          }
        }
      } else {
        await addDoc(collection(db, 'news'), {
          ...newsData,
          createdAt: serverTimestamp(),
          createdBy: session?.userId,
        });
        
        // Notify all kids if published
        if (editing.isPublished) {
          try {
            const kidIds = await getAllKidOneSignalIds();
            if (kidIds.length > 0) {
              const pushBody = editing.title!.length > 100 
                ? editing.title!.substring(0, 97) + '...' 
                : editing.title!;

              await sendPushToUser(
                kidIds,
                'Tin mới từ Đầu bếp',
                pushBody,
                '/kids/home'
              );
            }
          } catch (err) {
            console.error('Notify kids error:', err);
          }
        }
      }
      
      fetchNews();
      setEditing(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'news', id));
      setNews(prev => prev.filter(n => n.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="p-24 flex justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>;

  const sortedNews = [...news].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
  });

  return (
    <div className="chef-page-content h-full overflow-y-auto scrollbar-hide">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-background">
        <div className="space-y-[2px]">
          <h1 className="text-[18px] md:text-[20px] font-semibold text-foreground">Quản lý Tin tức</h1>
          <p className="text-[12px] md:text-[13px] font-normal text-muted-foreground">Đăng thông báo và cập nhật cho bé</p>
        </div>
        <button 
          onClick={() => handleEdit()}
          className="flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold px-5 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-2xl shadow-lg shadow-primary-shadow/30 hover:opacity-90 transition-all text-[13px] md:text-base whitespace-nowrap"
        >
          <Plus size={18} className="md:w-5 md:h-5" />
          Đăng bài mới
        </button>
      </div>

      <div className="mt-4">
        {sortedNews.length === 0 ? (
          <div className="bg-card rounded-[32px] md:rounded-[40px] border border-primary/20 py-16 md:py-20 flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-6">
              <Megaphone size={32} className="md:w-10 md:h-10" />
            </div>
            <h3 className="text-lg md:text-xl font-bold text-foreground mb-2">Chưa có bài viết nào</h3>
            <p className="text-[13px] md:text-sm text-muted-foreground mb-8 max-w-sm">Bắt đầu truyền thông tới các bé ngay!</p>
            <button 
              onClick={() => handleEdit()}
              className="flex items-center gap-2 bg-primary text-primary-foreground font-bold px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-primary-shadow/30 text-sm md:text-base"
            >
              <Plus size={18} />
              Đăng tin đầu tiên
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 pb-12">
            {sortedNews.map(item => (
              <div 
                key={item.id} 
                onClick={() => setSelectedPreviewNews(item)}
                className="bg-card rounded-[24px] md:rounded-[32px] border border-border shadow-sm overflow-hidden group hover:shadow-xl hover:scale-[1.01] transition-all duration-300 flex flex-col cursor-pointer"
              >
                {/* Cover Image */}
                <div className="relative h-32 md:h-40 bg-secondary overflow-hidden shrink-0">
                  {item.imageUrl ? (
                    <img src={getOptimizedUrl(item.imageUrl, 600)} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center text-primary/20">
                      <ImageIcon size={32} className="md:w-10 md:h-10" />
                    </div>
                  )}
                  
                  {/* Badges */}
                  <div className="absolute top-[10px] left-[10px] flex flex-col gap-2 z-10">
                    {item.isPinned && (
                      <div className="bg-orange-500 text-white text-[9px] md:text-[10px] font-black uppercase tracking-widest px-2 md:px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1.5 border border-orange-400">
                        <Pin size={10} fill="white" className="-rotate-45 md:w-3 md:h-3" />
                        Ghim
                      </div>
                    )}
                    {!item.isPublished && (
                      <div className="bg-muted-foreground text-white text-[9px] md:text-[10px] font-black uppercase tracking-widest px-2 md:px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1 border border-muted-foreground/50">
                        Bản nháp
                      </div>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="p-4 md:p-5 flex-1 flex flex-col">
                  <h3 className="text-[14px] md:text-[15px] font-bold text-foreground mb-1.5 md:mb-2 line-clamp-2 leading-snug transition-colors">
                    {item.title}
                  </h3>
                  <div className="mt-auto flex items-center justify-between pt-3 md:pt-4 border-t border-border">
                    <span className="text-[9px] md:text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                      {item.createdAt ? format(item.createdAt.toDate(), 'dd/MM/yyyy') : '---'}
                    </span>
                    
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      <button 
                        onClick={(e) => handleTogglePin(item, e)}
                        className={`p-1.5 md:p-2 rounded-lg md:rounded-xl text-[9px] md:text-[11px] font-bold transition-all flex items-center gap-1 md:gap-1.5 ${
                          item.isPinned 
                            ? 'text-orange-500 bg-orange-500/10 hover:bg-orange-500/20' 
                            : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                        }`}
                      >
                        <Pin size={12} fill={item.isPinned ? "currentColor" : "none"} className="md:w-3.5 md:h-3.5" />
                        <span className="hidden xs:inline">{item.isPinned ? 'Bỏ ghim' : 'Ghim'}</span>
                      </button>
                      <button 
                        onClick={(e) => handleEdit(item, e)} 
                        className="p-1.5 md:p-2 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg md:rounded-xl transition-all"
                      >
                        <Edit3 size={14} className="md:w-4 md:h-4" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.id!); }} 
                        className="p-1.5 md:p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg md:rounded-xl transition-all"
                      >
                        <Trash2 size={14} className="md:w-4 md:h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedPreviewNews && (
          <NewsModal news={selectedPreviewNews} onClose={() => setSelectedPreviewNews(null)} />
        )}
      </AnimatePresence>

      {/* Editor Modal */}
      <AnimatePresence>
        {editing && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              className="bg-card rounded-[32px] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative"
            >
              <div className="p-6 border-b border-border/50 flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground">{editing.id ? 'Chỉnh sửa tin' : 'Đăng bài mới'}</h2>
                <button 
                  onClick={() => setEditing(null)}
                  className="modal-close-btn text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="md:col-span-2 space-y-6">
                    <div>
                      <label className="block text-sm font-bold text-muted-foreground mb-2">Tiêu đề bản tin</label>
                      <input 
                        type="text" 
                        value={editing.title}
                        onChange={e => setEditing({...editing, title: e.target.value})}
                        placeholder="Nhập tiêu đề..."
                        className="w-full px-5 py-4 bg-secondary border border-border rounded-2xl focus:border-primary outline-none transition-all text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-muted-foreground mb-2">Nội dung chi tiết</label>
                      <div className="min-h-[180px] mb-12 resize-y overflow-auto quill-unified-container">
                        <ReactQuill 
                          theme="snow" 
                          value={editing.content} 
                          onChange={val => setEditing({...editing, content: val})} 
                          className="h-full rounded-2xl text-foreground"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-secondary p-6 rounded-3xl border border-border flex items-center justify-between shadow-sm">
                       <div>
                          <p className="text-sm font-bold text-foreground">Công khai</p>
                          <p className="text-xs text-muted-foreground">Bé có thể xem thấy</p>
                       </div>
                       <button 
                        onClick={() => setEditing({...editing, isPublished: !editing.isPublished})}
                        className={`w-12 h-6 rounded-full relative transition-colors ${editing.isPublished ? 'bg-green-500' : 'bg-muted/40'}`}
                       >
                         <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${editing.isPublished ? 'translate-x-6' : ''}`} />
                       </button>
                    </div>

                    <div className="bg-secondary p-6 rounded-3xl border border-border flex items-center justify-between shadow-sm">
                       <div>
                          <p className="text-sm font-bold text-foreground">Ghim lên đầu</p>
                          <p className="text-xs text-muted-foreground">Tin này sẽ luôn ở trên cùng</p>
                       </div>
                       <button 
                        onClick={() => setEditing({...editing, isPinned: !editing.isPinned})}
                        className={`w-12 h-6 rounded-full relative transition-colors ${editing.isPinned ? 'bg-primary' : 'bg-muted/40'}`}
                       >
                         <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${editing.isPinned ? 'translate-x-6' : ''}`} />
                       </button>
                    </div>

                    <div>
                       <label className="block text-sm font-bold text-muted-foreground mb-2">Ảnh bìa</label>
                       <div className="aspect-video bg-secondary border-2 border-dashed border-border rounded-2xl overflow-hidden relative group">
                          {imagePreview ? (
                            <img src={getOptimizedUrl(imagePreview, 600)} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/30">
                               <Upload size={32} />
                               <span className="text-xs font-bold mt-2">Tải ảnh</span>
                            </div>
                          )}
                          <label className={`absolute inset-0 cursor-pointer ${saving ? 'pointer-events-none' : ''}`}>
                            <input type="file" className="hidden" accept="image/*" disabled={saving} onChange={e => {
                               if (e.target.files?.[0]) {
                                 setImageFile(e.target.files[0]);
                                 setImagePreview(URL.createObjectURL(e.target.files[0]));
                               }
                            }} />
                          </label>
                          {saving && imageFile && (
                            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                              <Loader2 size={32} className="text-primary animate-spin mb-2" />
                              <span className="text-[10px] font-bold text-muted-foreground">Đang tải ảnh lên...</span>
                            </div>
                          )}
                       </div>
                    </div>

                    <div className="bg-secondary p-6 rounded-3xl border border-border flex items-center justify-between shadow-sm">
                       <div>
                          <p className="text-sm font-bold text-foreground">Ghim lên đầu</p>
                          <p className="text-xs text-muted-foreground">Tin này sẽ luôn ở trên cùng</p>
                       </div>
                       <button 
                        onClick={() => setEditing({...editing, isPinned: !editing.isPinned})}
                        className={`w-12 h-6 rounded-full relative transition-colors ${editing.isPinned ? 'bg-primary' : 'bg-muted/40'}`}
                       >
                         <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${editing.isPinned ? 'translate-x-6' : ''}`} />
                       </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-border bg-secondary flex justify-end gap-4">
                 <button onClick={() => setEditing(null)} className="px-8 py-3 text-muted-foreground font-bold hover:text-foreground transition-colors">Hủy bỏ</button>
                 <button 
                  onClick={handleSave} 
                  disabled={saving || !editing.title}
                  className={`font-bold px-10 py-3 rounded-2xl shadow-lg transition-all flex items-center gap-2 ${
                    !editing.title 
                     ? 'bg-muted text-muted-foreground cursor-not-allowed shadow-none' 
                     : 'bg-primary text-primary-foreground shadow-primary-shadow/30 hover:opacity-90 cursor-pointer'
                  } ${saving ? 'opacity-70' : ''}`}
                 >
                   {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                   {editing.id ? 'Cập nhật tin' : 'Đăng bản tin'}
                 </button>
              </div>

              <style>{`
                .quill-unified-container .quill {
                  border: 1px solid var(--border);
                  background: var(--card);
                  border-radius: 8px;
                  overflow: hidden;
                  display: flex;
                  flex-direction: column;
                }
                .quill-unified-container .ql-toolbar {
                  border: none !important;
                  border-bottom: 1px solid var(--border) !important;
                  background: var(--secondary);
                }
                .quill-unified-container .ql-container {
                  border: none !important;
                  flex: 1;
                  min-height: 140px;
                  color: var(--foreground);
                }
                .quill-unified-container .ql-stroke {
                  stroke: var(--muted-foreground) !important;
                }
                .quill-unified-container .ql-fill {
                  fill: var(--muted-foreground) !important;
                }
                .quill-unified-container .ql-picker {
                  color: var(--muted-foreground) !important;
                }
              `}</style>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        icon={<Trash2 size={24} className="text-destructive" />}
        title="Xác nhận xóa?"
        message="Bản tin này sẽ bị xóa khỏi hệ thống cho tất cả người dùng."
        confirmText="Xóa bài"
        cancelText="Hủy"
        confirmStyle="danger"
      />
    </div>
  );
}
