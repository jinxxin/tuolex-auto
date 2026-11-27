import { useState } from 'react';
import { Drawer, Descriptions, Tag, Timeline, Space, Button, Typography, Divider, Select, message, Tooltip } from 'antd';
import { EditOutlined, LinkOutlined, PartitionOutlined, DisconnectOutlined, InfoCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from '../../core/api';
import { useAuth } from '../../store/auth';
import { db } from '../../core/db';
import { ASIL_TAG_TEXT, ASIL_COLOR, FS_KIND_META } from '../../core/fs/data';
import { KIND_ORDER } from '../../core/fs/chain';
import { fsMapOf, FS_LINK_REL } from '../../core/fs/aspiceMap';
import TraceLinkPanel from '../../components/TraceLinkPanel';
import { writeAudit } from '../../core/audit';
import type { FsSafetyReq, AuditLog, VLayer, TraceLink } from '../../core/types';

const { Text } = Typography;

// 安全需求条目工作项抽屉：全字段 + X(Y)/分解 + 链上下文 + 审计轨迹 + 追溯关联
export default function FsReqDrawer({
  req, all, onClose, onEdit, onDecompose,
}: {
  req: FsSafetyReq | null;
  all: FsSafetyReq[];
  onClose: () => void;
  onEdit: (r: FsSafetyReq) => void;
  onDecompose: (r: FsSafetyReq) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [msg, msgCtx] = message.useMessage();
  const [linkOpen, setLinkOpen] = useState(false);
  const [asLayer, setAsLayer] = useState<VLayer | 'all'>('all');
  const [asTarget, setAsTarget] = useState<string>();
  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };
  // 项目 A-SPICE 需求条目 + 与本 FS 需求相关的 trace links
  const pid = req?.projectId;
  const aspiceReqs = useLiveQuery(() => (pid != null ? db.req_items.where('projectId').equals(pid).toArray() : Promise.resolve([])), [pid]) ?? [];
  const myLinks = useLiveQuery(() => (pid != null && req?.id != null
    ? db.trace_links.where('[projectId+fromType+fromId]').equals([pid, 'fs_req', req.id]).toArray()
    : Promise.resolve([])), [pid, req?.id]) ?? [];
  const inLinks = useLiveQuery(() => (pid != null && req?.id != null
    ? db.trace_links.where('[projectId+toType+toId]').equals([pid, 'fs_req', req.id]).toArray()
    : Promise.resolve([])), [pid, req?.id]) ?? [];
  const relLinks = [...myLinks, ...inLinks];
  const reqById = (id: number) => aspiceReqs.find((r) => r.id === id);
  const V_LAYER_LABEL: Record<string, string> = {
    user_req: 'UR', sys_req: 'SYS-REQ', sys_arch: 'SYS-ARCH', hw_req: 'HW-REQ', sw_req: 'SW-REQ',
    sw_arch: 'SW-ARCH', dd: 'DD', unit: 'UNIT', task: 'TASK', other: '其他',
  };
  const map = req ? fsMapOf(req.kind) : null;
  // 候选：推荐层（map.layer 非 none 且!=all 时默认过滤）+ 可切 all
  const layer = asLayer === 'all' ? undefined : asLayer;
  const candidates = aspiceReqs.filter((r) => !layer || r.reqType === layer);
  // 建链 / 断链
  const doLink = async () => {
    if (!req || !asTarget || pid == null) return;
    const [ty, idS] = asTarget.split(':');
    const toId = Number(idS);
    if (ty !== 'req') return;
    const target = reqById(toId);
    const now = Date.now();
    await db.trace_links.add({
      projectId: pid, fromType: 'fs_req', fromId: req.id!, toType: 'req', toId,
      relType: FS_LINK_REL, createdAt: now, createdBy: actor.username,
    }, t('fsAspice.linkOk', { fs: req.code, req: target?.reqId ?? '' }));
    await writeAudit({ userId: actor.id, username: actor.username, action: 'LINK', entityType: 'fs_safety_reqs', entityId: req.id!, summary: t('fsAspice.linkOk', { fs: req.code, req: target?.reqId ?? '' }), before: null, after: { toType: 'req', toId: target?.reqId } });
    msg.success(t('fsAspice.linkOk', { fs: req.code, req: target?.reqId ?? '' }));
    setAsTarget(undefined);
  };
  const doUnlink = async (l: TraceLink) => {
    const other = l.fromType === 'fs_req' && l.fromId === req?.id ? reqById(l.toId) : reqById(l.fromId);
    await db.trace_links.delete(l.id!, t('fsAspice.unlinkOk', { fs: req?.code ?? '', req: other?.reqId ?? '' }));
    msg.success('✓');
  };
  const logs = useLiveQuery(() => db.audit_logs.where('entityType').equals('fs_safety_reqs').toArray(), []) ?? [];
  const trail = logs
    .filter((l: AuditLog) => String(l.entityId) === String(req?.id))
    .sort((a, b) => b.ts - a.ts).slice(0, 8);

  const parent = req?.parentId != null ? all.find((r) => r.id === req.parentId) : undefined;
  const children = (req?.id != null ? all.filter((r) => r.parentId === req.id) : [])
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const asilText = req?.asilFrom
    ? `${req.asil}(${req.asilFrom})`                       // 分解元素 X(Y)
    : req?.asilInherited ? `${req.asil} · ${t('chainPage.dInherit')}` : req?.asil;

  return (
    <>
      <Drawer
        open={!!req} onClose={onClose} width={600}
        title={req ? (
          <Space wrap>
            <Text code style={{ fontSize: 14 }}>{req.code}</Text>
            <Tag color={FS_KIND_META[req.kind].color}>{t(`chainPage.${req.kind.toLowerCase()}`)}</Tag>
            <Tag color={ASIL_COLOR[req.asil]}>{ASIL_TAG_TEXT[req.asil]}{req.asilFrom ? ` (${req.asilFrom})` : ''}</Tag>
            <Tag>{req.status === 'approved' ? '✔' : req.status}</Tag>
          </Space>
        ) : null}
        extra={req && (
          <Space>
            <Button icon={<LinkOutlined />} onClick={() => setLinkOpen(true)}>{t('chainPage.open') === '打开' ? '追溯关联' : 'Traceability'}</Button>
            {req.kind !== 'SG' && (
              <Button icon={<PartitionOutlined />} onClick={() => { onClose(); onDecompose(req); }}>{t('chainPage.decompose')}</Button>
            )}
            <Button type="primary" icon={<EditOutlined />} onClick={() => { onClose(); onEdit(req); }}>{t('chainPage.edit')}</Button>
          </Space>
        )}
      >
        {req && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Descriptions column={1} size="small" bordered
              items={[
                { key: 'kind', label: t('chainPage.childKind'), children: <Tag color={FS_KIND_META[req.kind].color}>{t(`chainPage.${req.kind.toLowerCase()}`)}</Tag> },
                { key: 'code', label: t('chainPage.code'), children: <Text code>{req.code}</Text> },
                {
                  key: 'asil', label: t('chainPage.childAsil'),
                  children: (
                    <Space direction="vertical" size={2}>
                      <Space size={4}>
                        <Tag color={ASIL_COLOR[req.asil]}>{asilText}</Tag>
                        {req.asilInherited && <Text type="secondary" style={{ fontSize: 12 }}>{t('chainPage.dInherit')}</Text>}
                        {req.asilDecomposed && <Tag color="purple">{t('chainPage.dComp')}</Tag>}
                      </Space>
                      {req.asilDecomposed && (
                        <div style={{ fontSize: 12 }}>
                          {req.asilDecomposed.parts.map((p, i) => (
                            <div key={i}><Tag style={{ marginLeft: 0 }}>{p.asil}({req.asilDecomposed!.base})</Tag> {p.note}</div>
                          ))}
                          <Text type="secondary">{t('chainPage.decompPartDesc', { base: req.asilDecomposed.base })}</Text>
                        </div>
                      )}
                    </Space>
                  ),
                },
                {
                  key: 'ctx', label: t('chainPage.parent'),
                  children: parent ? <Text>{parent.code} · {t(`chainPage.${parent.kind.toLowerCase()}`)}（{ASIL_TAG_TEXT[parent.asil]}）</Text> : <Text type="secondary">—</Text>,
                },
                {
                  key: 'children', label: t('chainPage.children'),
                  children: children.length
                    ? <Space direction="vertical" size={2}>{children.map((c) => <Text key={c.id} style={{ fontSize: 13 }}>{c.code} · {t(`chainPage.${c.kind.toLowerCase()}`)} · {ASIL_TAG_TEXT[c.asil]}{c.asilFrom ? ` (${c.asilFrom})` : ''}</Text>)}</Space>
                    : <Text type="secondary">—</Text>,
                },
                { key: 'source', label: t('chainPage.sourceRef'), children: req.sourceRef || '—' },
                { key: 'text', label: t('chainPage.text'), children: req.text },
                { key: 'verify', label: t('chainPage.verify'), children: req.verificationMethod || '—' },
                {
                  key: 'meta', label: 'Meta',
                  children: (
                    <Space direction="vertical" size={2}>
                      <Text style={{ fontSize: 12 }}>v{req.version ?? 1} · {dayjs(req.createdAt).format('YYYY-MM-DD HH:mm')} → {dayjs(req.updatedAt).format('YYYY-MM-DD HH:mm')}</Text>
                      {req.aiBatch && <Text type="secondary" style={{ fontSize: 12 }}>AI batch: {req.aiBatch}</Text>}
                    </Space>
                  ),
                },
              ]}
            />
            {/* A-SPICE 承接链接（映射规则见 core/fs/aspiceMap.ts） */}
            <Divider style={{ margin: '4px 0' }} plain>{t('fsAspice.secTitle')}</Divider>
            {msgCtx}
            {map && req && (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div>
                  {map.layer === 'none'
                    ? <Tag color="orange">{t('fsAspice.recNone')}</Tag>
                    : <Tag color="blue" icon={<InfoCircleOutlined />}>{t('fsAspice.recLayer', { layer: V_LAYER_LABEL[map.layer], process: map.process })}</Tag>}
                </div>
                {map.layer !== 'none' && (
                  <Space wrap>
                    <Select size="small" style={{ width: 150 }} value={asLayer} onChange={(v) => { setAsLayer(v); setAsTarget(undefined); }}
                      options={[{ value: 'all', label: t('fsAspice.layerAll') }, { value: map.layer, label: V_LAYER_LABEL[map.layer] }]} />
                    <Select size="small" style={{ minWidth: 260, maxWidth: 340 }} showSearch optionFilterProp="label"
                      placeholder={t('fsAspice.target')} value={asTarget} onChange={setAsTarget}
                      options={candidates.map((r) => ({ value: `req:${r.id}`, label: `${r.reqId} ${r.desc.slice(0, 32)}` }))} />
                    <Button size="small" type="primary" disabled={!asTarget} onClick={doLink}>{t('fsAspice.link')}</Button>
                  </Space>
                )}
                {map.layer !== 'none' && candidates.length === 0 && <Text type="secondary" style={{ fontSize: 12 }}>{t('fsAspice.noTarget')}（{V_LAYER_LABEL[map.layer]}）</Text>}
                <div style={{ width: '100%' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t('fsAspice.linked')}：</Text>
                  <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 4 }}>
                    {relLinks.filter((l) => (l.fromType === 'req' || l.toType === 'req')).map((l) => {
                      const other = l.fromType === 'fs_req' ? reqById(l.toId) : reqById(l.fromId);
                      if (!other) return null;
                      return (
                        <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <Space size={4}>
                            <Tag color={other.reqType === 'sw_req' ? 'magenta' : other.reqType === 'hw_req' ? 'purple' : other.reqType === 'sys_req' ? 'blue' : 'cyan'}>{V_LAYER_LABEL[other.reqType ?? 'other']}</Tag>
                            <Text style={{ fontSize: 13 }}>{other.reqId} · {other.desc.slice(0, 30)}</Text>
                            <Text type="secondary" style={{ fontSize: 11 }}>{t('fsAspice.rel', { rel: l.relType })}</Text>
                          </Space>
                          <Tooltip title={t('fsAspice.unlink')}><Button size="small" type="text" danger icon={<DisconnectOutlined />} onClick={() => doUnlink(l)} /></Tooltip>
                        </div>
                      );
                    })}
                    {relLinks.filter((l) => (l.fromType === 'req' || l.toType === 'req')).length === 0 && <Text type="secondary" style={{ fontSize: 12 }}>{t('fsAspice.none')}</Text>}
                  </Space>
                </div>
              </Space>
            )}

            <Divider style={{ margin: '4px 0' }} plain>审计轨迹（哈希链）</Divider>
            {trail.length === 0 ? <Text type="secondary" style={{ fontSize: 12 }}>暂无操作记录</Text> : (
              <Timeline
                items={trail.map((l) => ({
                  color: l.action === 'DELETE' ? 'red' : l.action === 'UPDATE' ? 'orange' : 'blue',
                  children: (
                    <Space direction="vertical" size={0}>
                      <Text style={{ fontSize: 13 }}><b>{l.action === 'CREATE' ? '创建' : l.action === 'UPDATE' ? '更新' : l.action === 'DELETE' ? '删除' : l.action}</b> · {l.username} · {dayjs(l.ts).format('MM-DD HH:mm:ss')}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{l.summary}</Text>
                    </Space>
                  ),
                }))}
              />
            )}
          </Space>
        )}
      </Drawer>
      {req && (
        <TraceLinkPanel
          projectId={req.projectId}
          entityType="fs_req" entityId={req.id!} entityLabel={req.code}
          open={linkOpen} onClose={() => setLinkOpen(false)}
        />
      )}
    </>
  );
}
