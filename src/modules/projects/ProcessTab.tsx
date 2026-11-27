import { useMemo, useState } from 'react';
import { Tag, Space, Button, Drawer, Typography, Progress, Empty, Tooltip } from 'antd';
import { AimOutlined, FileTextOutlined, ExperimentOutlined, SafetyCertificateOutlined, NodeIndexOutlined } from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { updateRecord } from '../../core/repo';
import { PROCESS_GROUPS, CAPABILITY_LEVELS, PA_NAMES, PROCESS_LAYER_MAP, normalizeVLayer } from '../../core/aspice/processes';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import type { AspiceProcess, ProcessExecStatus, Project } from '../../core/types';

const { Text, Title, Paragraph } = Typography;

const EXEC_STATUS_META: Record<ProcessExecStatus, { label: string; color: string }> = {
  not_started: { label: '未执行', color: 'default' },
  in_progress: { label: '执行中', color: 'processing' },
  assessed: { label: '已评估', color: 'success' },
};

const STATUS_ORDER: ProcessExecStatus[] = ['not_started', 'in_progress', 'assessed'];

// ============ V 模型配对（A-SPICE 系统+软件级标准 V 形） ============
// 左侧：需求与设计（自上而下细化）；右侧：验证与测试（自下而上对应验证）
// 同行左右为对应验证关系（如 SYS.2 系统需求 ↔ SYS.5 系统合格性测试）
const V_ROWS: { left: string; right: string }[] = [
  { left: 'SYS.2', right: 'SYS.5' },
  { left: 'SYS.3', right: 'SYS.4' },
  { left: 'SWE.1', right: 'SWE.6' },
  { left: 'SWE.2', right: 'SWE.5' },
  { left: 'SWE.3', right: 'SWE.4' },
];
const V_TOP = 'SYS.1';          // V 顶点：需求挖掘
const V_APEX = 'SWE.3';         // V 底部尖：单元构建/编码

export default function ProcessTab({ project }: { project: Project }) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith('en');
  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };
  const processes = useLiveQuery(
    () => db.aspice_processes.where('stdVersion').equals(project.stdVersion).toArray(),
    [project.stdVersion],
  ) ?? [];
  const vItems = useLiveQuery(() => db.req_items.where('projectId').equals(project.id!).toArray(), [project.id]) ?? [];
  const vTests = useLiveQuery(() => db.test_cases.where('projectId').equals(project.id!).toArray(), [project.id]) ?? [];

  const [detail, setDetail] = useState<AspiceProcess | null>(null);

  const scope = project.processScope || [];
  const pStatus = project.processStatus || {};

  const byCode = useMemo(() => {
    const map: Record<string, AspiceProcess> = {};
    for (const p of processes) map[p.code] = p;
    return map;
  }, [processes]);

  const execCount = scope.filter((c) => pStatus[c] && pStatus[c] !== 'not_started').length;
  const assessedCount = scope.filter((c) => pStatus[c] === 'assessed').length;

  // 过程 → 条目数（V 条目 + 测试用例，按 tcId 前缀推断测试层级）
  const entryCountOf = useMemo(() => {
    const map: Record<string, number> = {};
    const add = (k: string, n: number) => { map[k] = (map[k] || 0) + n; };
    for (const it of vItems) {
      const ly = normalizeVLayer(it.reqType);
      for (const [proc, layers] of Object.entries(PROCESS_LAYER_MAP)) {
        if (layers.includes(ly)) add(proc, 1);
      }
    }
    // 测试按 tcId 前缀：UNIT(单元验证) IT(集成) QT(合格性) SIT(系统集成) SQT(系统合格)
    for (const t of vTests) {
      if (/^TC-UNIT/i.test(t.tcId)) add('SWE.4', 1);
      else if (/^TC-IT/i.test(t.tcId)) add('SWE.5', 1);
      else if (/^TC-QT/i.test(t.tcId)) add('SWE.6', 1);
      else if (/^TC-SIT/i.test(t.tcId)) add('SYS.4', 1);
      else if (/^TC-SQT/i.test(t.tcId)) add('SYS.5', 1);
      else add('SWE.6', 1);
    }
    return map;
  }, [vItems, vTests]);

  const setStatus = async (code: string, st: ProcessExecStatus) => {
    const next = { ...pStatus, [code]: st };
    await updateRecord<Project>('projects', project.id!, { processStatus: next, updatedAt: Date.now() }, actor, t('processTab.auditStatus', { code, label: t('processTab.exec.' + st) }));
  };

  const execLabel = (s: ProcessExecStatus) => t('processTab.exec.' + s);
  const groupNameOf = (g: string) => {
    const gd = PROCESS_GROUPS[g];
    return gd ? (isEn ? gd.name : gd.nameZh) : g;
  };

  // 紧凑 V 节点卡片
  const nodeCard = (code: string, idx: number, side: 'left' | 'right') => {
    const p = byCode[code];
    const enabled = scope.includes(code);
    const st = (pStatus[code] || 'not_started') as ProcessExecStatus;
    const meta = EXEC_STATUS_META[st];
    const group = p ? PROCESS_GROUPS[p.groupCode] || { nameZh: p.groupCode, color: '#666' } : { nameZh: '', color: '#ccc' };
    const indent = side === 'left' ? { marginLeft: idx * 26 } : { marginRight: idx * 26 };

    if (!p || !enabled) {
      return (
        <div key={code} style={{ ...indent, width: 210, border: '1.5px dashed #d9d9d9', borderRadius: 8, padding: '8px 10px', marginBottom: 10, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{code}<br />{t('processTab.notEnabled')}</Text>
        </div>
      );
    }
    return (
      <Tooltip key={code} title={t('processTab.cardTip', { zh: p.nameZh, en: p.name, bps: p.bps.length, wps: p.wps.length })}>
        <div style={{ ...indent, width: 210, border: '1px solid #e3eaf2', borderLeft: `3px solid ${group.color}`, borderRadius: 8, background: '#fff', padding: '8px 10px', marginBottom: 10, cursor: 'pointer', boxShadow: st === 'assessed' ? '0 0 0 2px rgba(47,158,68,.25)' : '0 1px 3px rgba(11,37,69,.08)' }}
          onClick={() => setDetail(p)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
              <span style={{ flexShrink: 0, fontSize: 13.5, fontWeight: 700, color: '#0b2545', whiteSpace: 'nowrap' }}>{p.code}</span>
              <span style={{ flex: '1 1 0%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: '#0b2545' }} title={isEn ? p.name : p.nameZh}>{isEn ? p.name : p.nameZh}</span>
            </div>
          </div>
          <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, color: '#8c8c8c' }} title={`${p.bps.length} BP · ${p.wps.length} WP${entryCountOf[p.code] ? ` · ${t('processTab.entriesCount', { n: entryCountOf[p.code] })}` : ''}`}>{p.bps.length} BP · {p.wps.length} WP{entryCountOf[p.code] ? ` · ${t('processTab.entriesCount', { n: entryCountOf[p.code] })}` : ''}</span>
            <Tag color={meta.color} style={{ fontSize: 10.5, lineHeight: '16px', margin: 0, flexShrink: 0, cursor: 'pointer', whiteSpace: 'nowrap' }}
              onClick={(e) => {
                e.stopPropagation();
                const i = STATUS_ORDER.indexOf(st);
                setStatus(code, STATUS_ORDER[(i + 1) % STATUS_ORDER.length]);
              }}>
              {execLabel(st)}
            </Tag>
          </div>
        </div>
      </Tooltip>
    );
  };

  // 底部支持/管理过程（不在 V 主链路的）
  const others = useMemo(() => {
    const vCodes = new Set(V_ROWS.flatMap((r) => [r.left, r.right]).concat(V_TOP, V_APEX));
    return scope
      .filter((c) => !vCodes.has(c))
      .map((c) => byCode[c])
      .filter((p): p is AspiceProcess => !!p)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [scope, byCode]);

  const topProc = byCode[V_TOP];

  return (
    <div>
      {/* 统计条 */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <Text type="secondary">{t('processTab.enabledLabel')}</Text>
          <Tag color="geekblue">{scope.length}</Tag>
          <Text type="secondary">{t('processTab.stdLabel')}</Text>
          <Tag color="purple">ASPICE {project.stdVersion}</Tag>
        </div>
        <div style={{ width: 220 }}>
          <Progress percent={scope.length ? Math.round((execCount / scope.length) * 100) : 0} size="small" format={() => t('processTab.startedCount', { n: execCount, total: scope.length })} />
        </div>
        <div style={{ width: 220 }}>
          <Progress percent={scope.length ? Math.round((assessedCount / scope.length) * 100) : 0} size="small" strokeColor="#2f9e44" format={() => t('processTab.assessedCount', { n: assessedCount })} />
        </div>
      </div>

      {scope.length === 0 ? (
        <Empty description={t('processTab.emptyScope')} />
      ) : (
        <div>
          {/* ===== V 模型图（A-SPICE） ===== */}
          <div style={{ position: 'relative', background: 'linear-gradient(180deg, #f8fafd, #f2f6fb)', border: '1px solid #e3eaf2', borderRadius: 14, padding: '22px 30px 30px', overflowX: 'auto' }}>
            <div style={{ minWidth: 560 }}>
            {/* V 形骨架线（SVG，铺满容器背景） */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} preserveAspectRatio="none" viewBox="0 0 100 100">
              {/* 左臂：从 V 顶(SYS.1)到 V 尖(SWE.3) */}
              <line x1="30" y1="4" x2="30" y2="96" stroke="#c9d8e8" strokeWidth="0.3" strokeDasharray="1.4 1.2" />
              {/* 右臂 */}
              <line x1="70" y1="4" x2="70" y2="96" stroke="#c9d8e8" strokeWidth="0.3" strokeDasharray="1.4 1.2" />
            </svg>

            {/* V 顶点：SYS.1 需求挖掘 */}
            {topProc && scope.includes(V_TOP) ? (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                {nodeCard(V_TOP, 0, 'left')}
              </div>
            ) : (
              <div style={{ textAlign: 'center', marginBottom: 16, color: '#c0c8d0', fontSize: 12 }}>
                ▲ {t('processTab.vTop', { code: V_TOP })}
              </div>
            )}

            {/* V 主体：5 行配对 */}
            {V_ROWS.map((row, idx) => (
              <div key={row.left} style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
                <div style={{ flex: '1 1 0', display: 'flex', justifyContent: 'flex-start' }}>
                  {nodeCard(row.left, idx, 'left')}
                </div>
                {/* 中间配对连线 */}
                <div style={{ flex: '0 0 60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '100%', borderTop: '2px dashed #b6c8da', position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '50%', top: -7, transform: 'translateX(-50%)', fontSize: 10, color: '#9ab2c8', background: '#f2f6fb', padding: '0 2px' }}>⇄</span>
                  </div>
                </div>
                <div style={{ flex: '1 1 0', display: 'flex', justifyContent: 'flex-end' }}>
                  {nodeCard(row.right, idx, 'right')}
                </div>
              </div>
            ))}

            {/* V 尖：单元构建 / 编码 */}
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <div style={{ display: 'inline-block', background: '#0b2545', color: '#fff', borderRadius: 16, padding: '5px 18px', fontSize: 12.5, fontWeight: 600 }}>
                <NodeIndexOutlined /> {byCode[V_APEX] ? t('processTab.vApexEnabled', { code: byCode[V_APEX].code, name: isEn ? byCode[V_APEX].name : byCode[V_APEX].nameZh }) : t('processTab.vApexFallback', { code: V_APEX })}
              </div>
              <div style={{ color: '#9ab2c8', fontSize: 11.5, marginTop: 6 }}>{t('processTab.vHint')}</div>
            </div>
            </div>
          </div>

          {/* ===== 支持与管理过程 ===== */}
          {others.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ textAlign: 'center', color: '#722ed1', fontWeight: 600, marginBottom: 8, fontSize: 13 }}>{t('processTab.supTitle')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {others.map((p) => {
                  const st = (pStatus[p.code] || 'not_started') as ProcessExecStatus;
                  const meta = EXEC_STATUS_META[st];
                  const group = PROCESS_GROUPS[p.groupCode] || { nameZh: p.groupCode, color: '#666' };
                  return (
                    <div key={p.code} style={{ border: '1px solid #e3eaf2', borderLeft: `3px solid ${group.color}`, borderRadius: 8, background: '#fff', padding: '10px 12px', cursor: 'pointer' }}
                      onClick={() => setDetail(p)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <Space size={6}>
                          <Text strong style={{ fontSize: 13.5, color: '#0b2545' }}>{p.code}</Text>
                          <Text style={{ fontSize: 12.5 }}>{isEn ? p.name : p.nameZh}</Text>
                          {p.only40 && <Tag color="cyan" style={{ fontSize: 10, lineHeight: '16px' }}>4.0</Tag>}
                        </Space>
                        <Tag color={meta.color} style={{ fontSize: 11, lineHeight: '18px', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const i = STATUS_ORDER.indexOf(st);
                            setStatus(p.code, STATUS_ORDER[(i + 1) % STATUS_ORDER.length]);
                          }}>
                          {execLabel(st)}
                        </Tag>
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 12, fontSize: 12, color: '#8c8c8c' }}>
                        <span><AimOutlined /> {p.bps.length} BP</span>
                        <span><FileTextOutlined /> {p.wps.length} WP</span>
                        {entryCountOf[p.code] > 0 && <span style={{ color: '#1b6ca8' }}>📌 {t('processTab.entriesCount', { n: entryCountOf[p.code] })}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 过程详情 */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} width={680} title={detail ? t('processTab.detailTitle', { code: detail.code, zh: detail.nameZh, en: detail.name }) : ''}>
        {detail && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('processTab.groupLabel')}</Text>
              <Tag color="blue">{groupNameOf(detail.groupCode)}</Tag>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>{t('processTab.stdValLabel')}</Text>
              <Tag color="purple">ASPICE {detail.stdVersion}</Tag>
              {detail.only40 && <Tag color="cyan">{t('processTab.only40')}</Tag>}
            </div>
            <div style={{ background: '#f6f9fc', padding: '10px 14px', borderRadius: 8 }}>
              <Text strong style={{ fontSize: 13 }}>{t('processTab.purposeTitle')}</Text>
              <Paragraph style={{ marginTop: 6, marginBottom: 0, fontSize: 13 }}>{detail.purpose}</Paragraph>
            </div>

            <div>
              <Title level={5} style={{ margin: 0, marginBottom: 8 }}><AimOutlined style={{ color: '#1b6ca8' }} /> {t('processTab.bpTitle')}</Title>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                {detail.bps.map((bp) => (
                  <div key={bp.id} style={{ border: '1px solid #e3eaf2', borderRadius: 6, padding: '8px 12px', fontSize: 13 }}>
                    <Tag color="geekblue" style={{ fontSize: 11 }}>{bp.id}</Tag>
                    <Text strong>{bp.name}</Text>
                    <div style={{ color: '#666', marginTop: 2 }}>{bp.desc}</div>
                  </div>
                ))}
              </Space>
            </div>

            <div>
              <Title level={5} style={{ margin: 0, marginBottom: 8 }}><FileTextOutlined style={{ color: '#0ca678' }} /> {t('processTab.wpTitle')}</Title>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                {detail.wps.map((wp) => (
                  <div key={wp.id} style={{ border: '1px solid #e3eaf2', borderRadius: 6, padding: '8px 12px', fontSize: 13 }}>
                    <Tag color="cyan" style={{ fontSize: 11 }}>{wp.id}</Tag>
                    <Text strong>{wp.name}</Text>
                    <div style={{ color: '#666', marginTop: 2 }}>{wp.desc}</div>
                  </div>
                ))}
              </Space>
            </div>

            <div>
              <Title level={5} style={{ margin: 0, marginBottom: 8 }}><ExperimentOutlined style={{ color: '#fa8c16' }} /> {t('processTab.clTitle')}</Title>
              <div style={{ fontSize: 13 }}>
                {CAPABILITY_LEVELS.filter((l) => l.level > 0).map((l) => (
                  <div key={l.level} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px dashed #eee' }}>
                    <Tag color={l.level <= 3 ? 'green' : 'purple'} style={{ width: 56, textAlign: 'center' }}>CL{l.level}</Tag>
                    <span style={{ width: 60, color: '#0b2545', fontWeight: 600 }}>{isEn ? l.name : l.nameZh}</span>
                    <span style={{ color: '#666' }}>{((l as { pa?: readonly string[] }).pa || []).map((pa) => `${pa} ${PA_NAMES[pa] || ''}`).join(' · ')}</span>
                  </div>
                ))}
                <Text type="secondary" style={{ fontSize: 12 }}>{t('processTab.ratingNote')}</Text>
              </div>
            </div>

            <div style={{ background: '#fff7e6', border: '1px solid #ffe7ba', borderRadius: 8, padding: '10px 14px' }}>
              <SafetyCertificateOutlined style={{ color: '#fa8c16' }} />{' '}
              <Text style={{ fontSize: 13 }}>{t('processTab.execStatusLabel')}<Tag color={EXEC_STATUS_META[pStatus[detail.code] || 'not_started'].color}>{execLabel((pStatus[detail.code] || 'not_started') as ProcessExecStatus)}</Tag>
              <Space style={{ marginLeft: 8 }}>
                {STATUS_ORDER.map((s) => (
                  <Button key={s} size="small" type={(pStatus[detail.code] || 'not_started') === s ? 'primary' : 'default'} onClick={() => setStatus(detail.code, s)}>{execLabel(s)}</Button>
                ))}
              </Space></Text>
            </div>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
