/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  BookOpen, 
  Calendar, 
  ClipboardList, 
  Newspaper, 
  Home, 
  Utensils, 
  History, 
  Star,
  Heart,
  UserCircle,
  LogOut,
  Settings,
  Menu,
  X,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import { clearSession } from '../lib/auth';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Avatar from './Avatar';

import { format, getWeek } from 'date-fns';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (!user) return null;

  const handleLogout = () => {
    logout();
  };

  const chefLinks = [
    { to: '/chef/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { to: '/chef/recipes', label: 'Công thức', icon: BookOpen },
    { to: '/chef/menu', label: 'Thực đơn tuần', icon: Calendar },
    { to: '/chef/orders', label: 'Đơn hàng', icon: ClipboardList },
    { to: '/chef/news', label: 'Tin tức', icon: Newspaper },
    { to: '/chef/settings', label: 'Cài đặt', icon: Settings },
  ];

  const kidLinks = [
    { to: '/kids/home', label: 'Trang chủ', icon: Home },
    { to: '/kids/order', label: 'Đặt món', icon: Utensils },
    { to: '/kids/my-orders', label: 'Đơn món', icon: History },
    { to: '/kids/favorites', label: 'Yêu thích', icon: Heart },
    { to: '/kids/reviews', label: 'Đánh giá', icon: Star },
    { to: '/kids/profile', label: 'Hồ sơ', icon: UserCircle },
  ];

  const links = user.role === 'chef' ? chefLinks : kidLinks;

  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border shadow-sm z-0">
        <Link 
          to={user.role === 'chef' ? '/chef/dashboard' : '/kids/home'} 
          className="p-6 flex items-center space-x-3 mb-4 hover:opacity-80 transition-opacity"
        >
          <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" />
          <span className="font-bold text-xl text-foreground tracking-tight">Món ngon cho bé</span>
        </Link>

        <nav className="flex-1 px-4 space-y-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
                  isActive
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-secondary hover:text-primary'
                }`
              }
            >
              <link.icon size={20} />
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <NavLink
            to={user.role === 'chef' ? '/chef/settings' : '/kids/profile'}
            className="flex items-center p-3 rounded-xl bg-secondary mb-2 hover:opacity-80 transition-opacity group"
          >
            <Avatar 
              src={user.avatar} 
              name={user.name} 
              size={40} 
              className="mr-3 ring-2 ring-card group-hover:ring-primary/20 transition-all"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground italic lowercase">{user.role === 'chef' ? 'Đầu bếp' : 'Em bé'}</p>
            </div>
          </NavLink>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-muted-foreground hover:text-destructive transition-colors"
          >
            <LogOut size={16} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-background relative min-w-0 overflow-hidden pb-20 md:pb-0">
        <header className="h-16 px-4 md:px-8 flex items-center justify-between border-b border-border bg-card/50 backdrop-blur-md">
          <h1 className="text-lg font-semibold text-foreground md:block hidden">
            {user.role === 'chef' ? 'Chào buổi sáng, Đầu bếp!' : `Chào Em bé ${user.name.split(' ').pop()}!`}
          </h1>
          <Link 
            to={user.role === 'chef' ? '/chef/dashboard' : '/kids/home'}
            className="md:hidden flex items-center gap-2 text-primary font-bold hover:opacity-80 transition-opacity"
          >
            <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
            <span>Món ngon cho bé</span>
          </Link>
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleTheme}
              className="p-2 text-muted-foreground hover:text-primary transition-colors hover:bg-secondary rounded-full"
              title="Chuyển chế độ giao diện"
            >
              <ThemeIcon size={20} />
            </button>
            <div className="bg-card px-3 py-1 rounded-full border border-border text-xs text-primary font-bold">
              Tuần {getWeek(new Date())}
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-muted-foreground hover:text-destructive transition-colors"
              title="Đăng xuất"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border px-2 py-1 flex justify-around items-center z-50">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 p-2 min-w-[64px] transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`
            }
          >
            <link.icon size={20} />
            <span className="text-[10px] font-medium">{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
