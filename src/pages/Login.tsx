/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { User, UserRole } from '../types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null, // No Firebase Auth used here
      email: null,
      emailVerified: null,
      isAnonymous: null,
    },
    operationType,
    path
  }
  const errString = JSON.stringify(errInfo);
  console.error('Firestore Error: ', errString);
  throw new Error(errString);
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    setIsLoading(true);

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', username));
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'users');
        return; // handleFirestoreError throws, but for TS
      }

      if (querySnapshot.empty) {
        setError('Sai tên đăng nhập hoặc mật khẩu');
        setIsLoading(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data() as User;

      if (userData.password !== password) {
        setError('Sai tên đăng nhập hoặc mật khẩu');
        setIsLoading(false);
        return;
      }

      const session = {
        userId: userDoc.id,
        username: userData.username,
        role: userData.role,
        name: userData.name,
      };

      login(session);
      
      if (userData.role === 'chef') {
        navigate('/chef/dashboard');
      } else {
        navigate('/kids/home');
      }
    } catch (err) {
      console.error(err);
      setError('Đã có lỗi xảy ra, vui lòng thử lại');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-[32px] p-10 shadow-login border border-orange-50 flex flex-col items-center">
          <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-orange-50 overflow-hidden p-2">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Món ngon cho bé</h1>
            <p className="text-slate-400 text-sm">Vui lòng đăng nhập để tiếp tục</p>
          </div>

          <form onSubmit={handleLogin} className="w-full space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600 ml-1">
                Tên đăng nhập
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-5 py-4 bg-orange-50/50 border border-orange-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary transition-all placeholder:text-slate-300"
                placeholder="Ví dụ: quanghuong"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600 ml-1">
                Mật khẩu
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-5 py-4 bg-orange-50/50 border border-orange-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-red-500 text-xs font-medium bg-red-50 py-2 px-3 rounded-xl border border-red-100 text-center"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-white font-bold py-4 rounded-2xl shadow-lg shadow-orange-200 hover:bg-orange-600 transition-all active:scale-[0.98] mt-4 flex items-center justify-center space-x-3 disabled:opacity-70 disabled:pointer-events-none"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  <span>Đang đăng nhập...</span>
                </>
              ) : (
                'Đăng nhập'
              )}
            </button>
          </form>

          <div className="mt-8 text-xs text-slate-400 text-center font-medium uppercase tracking-widest">
            Phiên bản Beta v1.0.0
          </div>
        </div>

        <p className="text-center mt-8 text-slate-400 text-sm">
          Phiên bản Beta v1.0.0
        </p>
      </motion.div>
    </div>
  );
}
