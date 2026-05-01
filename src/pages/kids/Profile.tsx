import React, { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { useAuth } from '../../context/AuthContext';
import { UserCircle, Camera, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import Avatar from '../../components/Avatar';
import { User } from '../../types';
import { useNavigate } from 'react-router-dom';
import { useStreak } from '../../hooks/useStreak';
import { useTheme } from '../../context/ThemeContext';

export default function Profile() {
  const { user, login } = useAuth();
  const { streak, longestStreak } = useStreak(user?.userId);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.userId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    // Listen to user profile changes
    const unsubscribeUser = onSnapshot(doc(db, 'users', user.userId), (snap) => {
      if (snap.exists()) {
        const userData = snap.data() as User;
        setProfile(userData);
      } else {
        // Fallback for profile data if document doesn't exist yet
        setProfile({
          userId: user.userId,
          name: user.name,
          username: user.username,
          role: user.role,
        } as unknown as User);
      }
      setLoading(false);
    }, (err) => {
      console.error('Profile snapshot error:', err);
      setLoading(false);
      // Fallback on error too
      setProfile({
        userId: user.userId,
        name: user.name,
        username: user.username,
        role: user.role,
      } as unknown as User);
    });

    return () => unsubscribeUser();
  }, [user?.userId, user?.name, user?.username, user?.role]);

  const cropImageToSquare = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        const size = Math.min(img.width, img.height);
        canvas.width = 512; // Standard size for avatar
        canvas.height = 512;

        const offsetX = (img.width - size) / 2;
        const offsetY = (img.height - size) / 2;

        ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, 512, 512);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas to Blob failed'));
          }
          URL.revokeObjectURL(img.src);
        }, 'image/jpeg', 0.9);
      };
      img.onerror = () => {
        reject(new Error('Failed to load image'));
        URL.revokeObjectURL(img.src);
      };
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn tệp hình ảnh!');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // Allow slightly larger initial file for cropping
      toast.error('Dung lượng ảnh ban đầu không được quá 5MB!');
      return;
    }

    try {
      const croppedBlob = await cropImageToSquare(file);
      handleUpload(croppedBlob);
    } catch (err) {
      console.error('Cropping error:', err);
      toast.error('Có lỗi khi xử lý ảnh!');
    }
  };

  const handleUpload = async (fileBlob: Blob) => {
    if (!user?.userId) return;
    setUploading(true);

    try {
      // Convert Blob to File for Cloudinary helper
      const file = new File([fileBlob], `${user.userId}.jpg`, { type: 'image/jpeg' });
      const downloadURL = await uploadToCloudinary(file, 'buacomchobe/avatars');
      
      // Update Firestore
      await updateDoc(doc(db, 'users', user.userId), {
        avatar: downloadURL
      });

      // Update Local State
      setProfile(prev => prev ? { ...prev, avatar: downloadURL } : null);
      
      // Update Auth Context/Session
      login({ ...user, avatar: downloadURL });

      toast.success('Đã cập nhật ảnh đại diện!');
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Tải ảnh thất bại, thử lại nhé!');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!profile) return null;

  const getJoinDate = () => {
    if (!profile.createdAt) return '25/04/2026';
    
    let date: Date;
    if (profile.createdAt.toDate) {
      date = profile.createdAt.toDate();
    } else if (profile.createdAt instanceof Date) {
      date = profile.createdAt;
    } else {
      date = new Date(profile.createdAt);
    }

    if (isNaN(date.getTime())) return '25/04/2026';
    
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="max-w-[480px] mx-auto kid-page-content">
      <div className="flex flex-col items-center">
        <h2 className="text-2xl font-bold text-foreground mb-10 w-full text-center">Hồ sơ của bé</h2>

        {/* Avatar Section */}
        <div className="relative mb-6">
          <div className="ring-4 ring-secondary rounded-full p-1">
            <Avatar 
              src={profile.avatar} 
              name={profile.name} 
              size={96} 
            />
          </div>
          
          {uploading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-full text-white">
              <Loader2 className="w-8 h-8 animate-spin mb-1" />
              <span className="text-[10px] font-bold">Đang tải...</span>
            </div>
          )}

            <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all border-2 border-card"
          >
            <Camera size={16} />
          </button>
        </div>

        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-primary text-[13px] font-bold hover:underline mb-8"
        >
          Đổi ảnh đại diện
        </button>

        {/* Streak Stats */}
        <div className="flex items-center gap-3 mb-8">
          {streak >= 1 && (
            <div className="bg-primary text-primary-foreground px-4 py-2 rounded-full flex items-center gap-2 shadow-sm">
              <span className="text-[14px]">🔥</span>
              <span className="text-[13px] font-bold">{streak} ngày liên tiếp</span>
            </div>
          )}
          {longestStreak > 0 && (
            <div className="bg-secondary text-secondary-foreground px-4 py-2 rounded-full flex items-center gap-2 border border-border">
              <span className="text-[11px] font-bold uppercase tracking-wider">Kỷ lục: {longestStreak} ngày</span>
            </div>
          )}
        </div>

        <input 
          type="file" 
          ref={fileInputRef}
          className="hidden"
          accept="image/jpeg,image/png"
          onChange={handleFileSelect}
        />

        {/* Profile Info */}
        <div className="w-full bg-card rounded-3xl border border-border p-8 shadow-sm text-center">
          <h3 className="text-[18px] font-bold text-foreground mb-1">{profile.name}</h3>
          <p className="text-[13px] text-muted-foreground mb-4">@{profile.username}</p>
          
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-accent/50 text-accent-foreground rounded-full text-xs font-bold mb-6">
            <UserCircle size={14} />
            Em bé
          </div>

          <div className="pt-6 border-t border-border flex flex-col items-center gap-6">
            <p className="text-[12px] text-muted-foreground font-medium pt-2 border-t border-border w-full">
              Tham gia từ {getJoinDate()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
