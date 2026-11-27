import { create } from 'zustand';
import { apiFetch, getToken, setToken, clearToken } from '../core/api';
import type { User } from '../core/types';

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (username: string, pwd: string) => Promise<{ ok: boolean; msg?: string }>;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,

  login: async (username, pwd) => {
    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password: pwd }),
      });
      const body = await res.json();
      setToken(body.token);
      set({ user: body.user });
      return { ok: true };
    } catch (e) {
      // apiFetch 已透传服务端真实错误（密码错误/用户不存在/会话过期等）
      return { ok: false, msg: (e as Error).message || '登录失败，请检查网络或服务状态' };
    }
  },

  logout: () => {
    clearToken();
    set({ user: null });
  },
}));

// 恢复会话：token 有效则拉取用户信息
export async function restoreSession(): Promise<void> {
  if (!getToken()) {
    useAuth.setState({ ready: true });
    return;
  }
  try {
    const res = await apiFetch('/auth/me');
    const user = await res.json();
    useAuth.setState({ user, ready: true });
  } catch {
    clearToken();
    useAuth.setState({ user: null, ready: true });
  }
}

// 会话过期事件（401 触发）→ 回到登录页
if (typeof window !== 'undefined') {
  window.addEventListener('auth-expired', () => {
    useAuth.setState({ user: null, ready: true });
  });
}

// 管理员重置密码
export async function resetPassword(userId: number, newPwd: string): Promise<void> {
  await apiFetch('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ userId, newPwd }),
  });
}
