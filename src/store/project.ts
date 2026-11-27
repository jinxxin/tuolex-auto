import { create } from 'zustand';

// ============ 全局当前项目（跨页面共享 + 本地记忆）============
// 顶栏切换一次，所有带项目上下文的页面自动跟随，并记住上次选择。
const KEY = 'tuolex_current_project';

function load(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

interface ProjectState {
  projectId: number | null;
  setProjectId: (id: number | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projectId: load(),
  setProjectId: (id) => {
    try {
      if (id) localStorage.setItem(KEY, String(id));
      else localStorage.removeItem(KEY);
    } catch { /* ignore */ }
    set({ projectId: id });
  },
}));
