/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserSession } from '../types';

const SESSION_KEY = 'becu-session';

export function saveSession(session: UserSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): UserSession | null {
  const data = localStorage.getItem(SESSION_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data) as UserSession;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function isAuthenticated(): boolean {
  return !!getSession();
}
