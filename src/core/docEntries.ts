// ============ 在线文档：条目化引用 注册表（通用原则）============
// 原则：在线文档中的条目内容 = 对系统条目的「引用 + 快照」。
//   · 引用建立时冻结快照（snapshot = 引用时刻的条目内容 + 版本）
//   · 条目变化不自动进文档，给「有更新」提示：更新到最新 / 指定版本 / 保持
//   · 签署前可更新；签署后锁定，要改须「发起改版（重新签署）」并记录过程与原因
// 本平台登记的可引用实体：需求(req_items) / 测试(test_cases) / 风险(fmea_items) / 文档(vdocs)

import { db } from './db';

// 本平台在线文档可引用的条目类型（子集；各应用按各自实体登记）
export type DocEntryType = 'req' | 'tc' | 'fmea' | 'vdoc';

export interface EntrySnap {
  type: DocEntryType;
  id: number;
  version?: number;
  code: string;
  title: string;
  desc: string;
  meta: string;
  fields: Record<string, string>;
  fieldLabels: Record<string, string>;
}

export interface EntryDef {
  label: string;
  icon: string;
  color: string;
  dbKey: string;
  build: (it: Record<string, unknown>) => Omit<EntrySnap, 'type' | 'id'>;
}

const TC_RESULT: Record<string, string> = { pass: '通过', fail: '失败', na: '不适用', not_run: '未执行' };
const num = (v: unknown, d = 0): number => (typeof v === 'number' ? v : d);
const str = (v: unknown, d = ''): string => (v == null ? d : String(v));

export const ENTRY_DEFS: Record<DocEntryType, EntryDef> = {
  req: {
    label: '需求', icon: '📄', color: '#1b6ca8', dbKey: 'req_items',
    build: (it) => ({
      version: num(it.version, 1), code: str(it.reqId), title: str(it.desc).slice(0, 40), desc: str(it.desc),
      meta: `${str(it.priority)}优先级${it.sourceReg && it.sourceReg !== '—' ? ' · ' + str(it.sourceReg) : ''}${it.version ? ' · v' + it.version : ''}`,
      fields: { desc: str(it.desc) }, fieldLabels: { desc: '需求描述' },
    }),
  },
  tc: {
    label: '测试', icon: '🧪', color: '#0ca678', dbKey: 'test_cases',
    build: (it) => ({
      version: num(it.version, 1), code: str(it.tcId), title: str(it.title), desc: `${str(it.steps)}\n预期：${str(it.expected)}`,
      meta: `结果：${TC_RESULT[str(it.result)] || str(it.result)}${it.version ? ' · v' + it.version : ''}`,
      fields: { steps: str(it.steps), expected: str(it.expected) }, fieldLabels: { steps: '测试步骤', expected: '预期结果' },
    }),
  },
  fmea: {
    label: '风险', icon: '⚠️', color: '#cf1322', dbKey: 'fmea_items',
    build: (it) => {
      const rpn = num(it.rpn);
      return {
        version: num(it.version, 1), code: `RPN-${rpn}`, title: str(it.failureMode), desc: `影响：${str(it.effect)}\n原因：${str(it.cause)}`,
        meta: `风险等级 ${rpn >= 100 ? '高' : rpn >= 50 ? '中' : '低'}${it.version ? ' · v' + it.version : ''}`,
        fields: { failureMode: str(it.failureMode), effect: str(it.effect) }, fieldLabels: { failureMode: '失效模式', effect: '潜在影响' },
      };
    },
  },
  vdoc: {
    label: '文档', icon: '📁', color: '#722ed1', dbKey: 'vdocs',
    build: (it) => ({
      code: str(it.docType), title: str(it.title), desc: `版本 ${str(it.version)} · 状态 ${str(it.status)}`, meta: `${str(it.docType)} · v${str(it.version)}`,
      fields: { title: str(it.title) }, fieldLabels: { title: '标题' },
    }),
  },
};

export const DOC_ENTRY_TYPES = Object.keys(ENTRY_DEFS) as DocEntryType[];

export async function loadEntries(type: DocEntryType): Promise<Record<string, unknown>[]> {
  const key = ENTRY_DEFS[type].dbKey;
  const client = (db as unknown as Record<string, { toArray?: () => Promise<Record<string, unknown>[]> }>)[key];
  if (!client || typeof client.toArray !== 'function') return [];
  return client.toArray();
}

export type Ref = { type: DocEntryType; id: number };

export async function buildSnapshot(refs: Ref[]): Promise<EntrySnap[]> {
  const out: EntrySnap[] = [];
  const cache: Partial<Record<DocEntryType, Record<string, unknown>[]>> = {};
  for (const r of refs) {
    if (!cache[r.type]) cache[r.type] = await loadEntries(r.type);
    const it = (cache[r.type] as Record<string, unknown>[]).find((x) => Number(x.id) === r.id);
    if (!it) continue;
    out.push({ type: r.type, id: r.id, ...ENTRY_DEFS[r.type].build(it) });
  }
  return out;
}

export async function snapshotOf(type: DocEntryType, id: number): Promise<EntrySnap | null> {
  const arr = await loadEntries(type);
  const it = arr.find((x) => Number(x.id) === id);
  return it ? { type, id, ...ENTRY_DEFS[type].build(it) } : null;
}

export async function syncSnapshot(refs: Ref[], prev: EntrySnap[]): Promise<EntrySnap[]> {
  const keep = new Map(prev.map((s) => [`${s.type}:${s.id}`, s]));
  const missing = refs.filter((r) => !keep.has(`${r.type}:${r.id}`));
  const built = await buildSnapshot(missing);
  const builtMap = new Map(built.map((s) => [`${s.type}:${s.id}`, s]));
  return refs.map((r) => keep.get(`${r.type}:${r.id}`) || builtMap.get(`${r.type}:${r.id}`)!).filter(Boolean) as EntrySnap[];
}

export interface RefStatus { type: DocEntryType; id: number; snap?: EntrySnap; live?: EntrySnap; updated: boolean; snapLabel: string; liveLabel: string; }

export function detectUpdates(snapshots: EntrySnap[], liveByType: Partial<Record<DocEntryType, Record<string, unknown>[]>>): RefStatus[] {
  return snapshots.map((snap) => {
    const arr = liveByType[snap.type] || [];
    const it = arr.find((x) => Number(x.id) === snap.id);
    const live = it ? { type: snap.type, id: snap.id, ...ENTRY_DEFS[snap.type].build(it) } : undefined;
    let updated = false;
    if (live) {
      if (snap.version != null && live.version != null) updated = live.version !== snap.version;
      if (!updated) updated = Object.keys({ ...snap.fields, ...live.fields }).some((k) => (snap.fields[k] ?? '') !== (live.fields[k] ?? ''));
    }
    return { type: snap.type, id: snap.id, snap, live, updated, snapLabel: snap.version != null ? `v${snap.version}` : '—', liveLabel: live?.version != null ? `v${live.version}` : (live ? '最新' : '已删除') };
  });
}

export async function snapshotAtVersion(type: DocEntryType, id: number, version?: number): Promise<EntrySnap | null> {
  const cur = await snapshotOf(type, id);
  if (version == null || (cur && cur.version === version)) return cur;
  const hist = (await db.entry_versions.toArray()).filter((v) => v.entityType === type && v.entityId === id && v.version === version).sort((a, b) => b.changedAt - a.changedAt)[0];
  if (!hist || !cur) return cur;
  const stored = (hist.snapshot || {}) as Record<string, unknown>;
  const merged: EntrySnap = { ...cur, version, fields: { ...cur.fields } };
  for (const k of Object.keys(merged.fieldLabels)) if (k in stored) merged.fields[k] = str(stored[k]);
  return merged;
}

export async function entryVersionsOf(type: DocEntryType, id: number): Promise<{ version: number; changedAt: number; changedBy?: string; note?: string }[]> {
  return (await db.entry_versions.toArray()).filter((v) => v.entityType === type && v.entityId === id)
    .map((v) => ({ version: v.version, changedAt: v.changedAt, changedBy: v.changedBy, note: v.note })).sort((a, b) => b.version - a.version);
}

// ---- 条目详情追溯（设计规范 §9：解析对方编号/名称；兼容语义键与旧短码）----
export const ENTRY_TRACE: Record<DocEntryType, { traceKey: string; route: string }> = {
  req: { traceKey: "design_input", route: "/workitems" },
  tc: { traceKey: "verification", route: "/workitems" },
  fmea: { traceKey: "risk", route: "/fmea" },
  vdoc: { traceKey: "record", route: "/projects" },
};
const KEY_ALIASES: Record<DocEntryType, string[]> = {
  req: ["design_input", "user_need", "design_output", "req", "req_items"],
  tc: ["verification", "tc", "test_cases"],
  fmea: ["risk", "fmea", "fl", "fmea_items"],
  vdoc: ["record", "vdoc", "vd", "vdocs", "documents"],
};
const ALIAS_TO_DOC: Record<string, DocEntryType> = { design_input: "req", user_need: "req", design_output: "req", req: "req", req_items: "req", verification: "tc", tc: "tc", test_cases: "tc", risk: "fmea", fmea: "fmea", fl: "fmea", fmea_items: "fmea", record: "vdoc", vdoc: "vdoc", vd: "vdoc", vdocs: "vdoc", documents: "vdoc" };
export interface TraceHit { dir: "out" | "in"; relType: string; entity: string; id: number; label: string; }
export async function entryTraceLinks(type: DocEntryType, id: number): Promise<TraceHit[]> {
  const keys = KEY_ALIASES[type];
  const all = await (db.trace_links as unknown as { toArray: () => Promise<Record<string, unknown>[]> }).toArray();
  const hits: TraceHit[] = [];
  const cache = new Map<DocEntryType, Record<string, unknown>[]>();
  const nameOf = async (entity: string, eid: number): Promise<string> => {
    const dt = ALIAS_TO_DOC[entity];
    if (!dt) return entity + " #" + eid;
    if (!cache.has(dt)) cache.set(dt, await loadEntries(dt));
    const it = (cache.get(dt) as Record<string, unknown>[]).find((x) => Number(x.id) === eid);
    if (!it) return entity + " #" + eid;
    const s = ENTRY_DEFS[dt].build(it);
    return s.code + " " + s.title;
  };
  for (const l of all) {
    const fe = String(l.fromEntity ?? l.fromType ?? "");
    const te = String(l.toEntity ?? l.toType ?? "");
    if (keys.includes(fe) && Number(l.fromId) === id) hits.push({ dir: "out", relType: String(l.relType || ""), entity: te, id: Number(l.toId), label: await nameOf(te, Number(l.toId)) });
    if (keys.includes(te) && Number(l.toId) === id) hits.push({ dir: "in", relType: String(l.relType || ""), entity: fe, id: Number(l.fromId), label: await nameOf(fe, Number(l.fromId)) });
  }
  return hits;
}
