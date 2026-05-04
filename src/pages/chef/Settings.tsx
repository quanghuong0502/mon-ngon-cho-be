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
  Monitor
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';

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
  }, []);

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
    </div>
  );
}
