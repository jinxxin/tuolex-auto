// 功能安全「项目深链」：?project=<id>
// 用途：外链直达某演示项目的功能安全页（如 /#/fs/overview?project=6）。
// 说明：应用为 HashRouter，查询串位于 hash 内（#/fs/xxx?project=6），也兼容 history 的 location.search。
// 规则：仅当 id 属于当前可见的功能安全项目集时生效；否则回退到首个项目。用户手动切换项目（activePid）优先。
export function fsPidFromUrl(fsProjectIds: number[], activePid?: number): number | undefined {
  if (activePid != null) return activePid;
  const q = projectIdFromUrl();
  if (q != null && fsProjectIds.includes(q)) return q;
  return fsProjectIds[0];
}

function projectIdFromUrl(): number | null {
  const m = `${window.location.search} ${window.location.hash}`.match(/[?&]project=(\d+)/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}
