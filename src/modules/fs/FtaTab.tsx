import { useMemo, useState } from 'react';
import {
  Table, Tag, Button, Space, Typography, Drawer, Alert, Input, Select, InputNumber, message, Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { nextSeq } from '../../core/seq';
import { ASIL_TAG_TEXT, ASIL_COLOR } from '../../core/fs/data';
import type { FsFta, FsFtaNode, FsAsil } from '../../core/types';

const { Text } = Typography;
const nid = () => `n${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const blank = (label = '', gate?: 'AND' | 'OR'): FsFtaNode => ({ id: nid(), label, gate, children: gate ? [] : undefined });

// 递归树编辑器（自绘缩进行）
function NodeEditor({ node, onChange, depth }: { node: FsFtaNode; onChange: (n: FsFtaNode) => void; depth: number }) {
  const { t } = useTranslation();
  const set = (patch: Partial<FsFtaNode>) => onChange({ ...node, ...patch });
  const childOn = (i: number) => (c: FsFtaNode) => set({ children: (node.children || []).map((x, j) => (j === i ? c : x)) });
  const isGate = !!node.gate;
  return (
    <div style={{ marginLeft: depth * 28 }}>
      <Space size={6} style={{ display: 'flex', width: '100%', marginBottom: 4 }}>
        <Tag color={isGate ? (node.gate === 'AND' ? 'geekblue' : 'volcano') : 'default'} style={{ minWidth: 64, textAlign: 'center', marginRight: 0 }}>
          {isGate ? node.gate : t('analysisPage.ftaAddBasic').replace('+ ', '')}
        </Tag>
        <Input size="small" style={{ flex: 1, maxWidth: 420 }} value={node.label} placeholder={t('analysisPage.ftaPh')} onChange={(e) => set({ label: e.target.value })} />
        {!isGate && (
          <InputNumber size="small" style={{ width: 110 }} min={0} placeholder="λ FIT(可选)" value={node.basic?.lambda}
            onChange={(v) => set({ basic: { ...(node.basic || {}), lambda: v ?? undefined } })} />
        )}
        <Button size="small" icon={<PlusOutlined />} title="AND" onClick={() => set({ children: [...(node.children || []), blank('', 'AND')] })}>AND</Button>
        <Button size="small" icon={<PlusOutlined />} title="OR" onClick={() => set({ children: [...(node.children || []), blank('', 'OR')] })}>OR</Button>
        <Button size="small" icon={<PlusOutlined />} onClick={() => set({ children: [...(node.children || []), blank('')] })}>{t('analysisPage.ftaAddBasic')}</Button>
        {depth > 0 && <Button size="small" type="text" danger icon={<DeleteOutlined />} title={t('analysisPage.ftaDel')} onClick={() => onChange({ ...node, label: '__DEL__' })} />}
      </Space>
      {(node.children || []).map((c, i) => (
        <div key={c.id}>
          <NodeEditor node={c} onChange={childOn(i)} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}

function stripDeleted(n: FsFtaNode): FsFtaNode | null {
  if (n.label === '__DEL__') return null;
  const kids = (n.children || []).map(stripDeleted).filter((x): x is FsFtaNode => !!x);
  return { ...n, children: n.gate ? kids : undefined };
}

export default function FtaTab({ pid }: { pid: number }) {
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FsFta | null>(null);
  const [root, setRoot] = useState<FsFtaNode | null>(null);
  const [topEvent, setTopEvent] = useState('');
  const [topAsil, setTopAsil] = useState<FsAsil>('D');
  const items = useLiveQuery(() => db.fs_fta.where('projectId').equals(pid).toArray(), [pid]) ?? [];

  const openCreate = () => {
    setEditing(null); setTopEvent(''); setTopAsil('D');
    setRoot(blank('', 'OR'));
    setOpen(true);
  };
  const openEdit = async (it: FsFta) => {
    const full = (await db.fs_fta.get(it.id!)) ?? it;     // 列表投影排除 tree
    setEditing(it); setTopEvent(full.topEvent); setTopAsil(full.topAsil as FsAsil);
    setRoot(full.tree || blank('', 'OR'));
    setOpen(true);
  };

  const save = async () => {
    const tree = root ? stripDeleted(root) : null;
    if (!tree || !topEvent.trim()) return;
    const now = Date.now();
    if (editing?.id) {
      await db.fs_fta.update(editing.id, { topEvent, topAsil, tree, status: 'reviewed', updatedAt: now },
        t('analysisPage.auditEdit', { id: editing.ftaId, version: 1 }));
    } else {
      const ftaId = await nextSeq(pid, 'FTA');
      await db.fs_fta.add({ projectId: pid, ftaId, topEvent, topAsil, tree, status: 'draft', createdAt: now, updatedAt: now },
        t('analysisPage.auditNew', { id: ftaId }));
    }
    setOpen(false);
    msg.success('✓');
  };

  const del = async (it: FsFta) => { await db.fs_fta.delete(it.id!, t('analysisPage.auditDel', { id: it.ftaId })); };

  // 预览文本
  const preview = useMemo(() => {
    if (!root) return '';
    const lines: string[] = [];
    const walk = (n: FsFtaNode, d: number) => {
      if (n.label === '__DEL__') return;
      lines.push(`${'  '.repeat(d)}${n.gate ? `[${n.gate}] ` : '• '}${n.label || '（未命名）'}${!n.gate && n.basic?.lambda ? `  λ=${n.basic.lambda}` : ''}`);
      (n.children || []).forEach((c) => walk(c, d + 1));
    };
    walk(root, 0);
    return lines.join('\n');
  }, [root]);

  return (
    <div>
      {msgCtx}
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space wrap>
          <Button type="primary" aria-label="fta-new" icon={<PlusOutlined />} onClick={openCreate}>{t('analysisPage.new')}</Button>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('analysisPage.ftaHint')}</Text>
        </Space>
        <Table<FsFta> rowKey="id" size="small" dataSource={items} pagination={false} locale={{ emptyText: t('analysisPage.ftaEmpty') }}
          columns={[
            { title: 'ID', dataIndex: 'ftaId', width: 100, render: (v: string) => <Text code>{v}</Text> },
            { title: t('analysisPage.ftaTop'), dataIndex: 'topEvent', ellipsis: true },
            { title: t('analysisPage.ftaTopAsil'), dataIndex: 'topAsil', width: 90, render: (a: FsAsil) => <Tag color={ASIL_COLOR[a]}>{ASIL_TAG_TEXT[a]}</Tag> },
            { title: t('analysisPage.fmStatus'), dataIndex: 'status', width: 100, render: (v: string) => <Tag color={v === 'reviewed' ? 'blue' : 'gold'}>{v}</Tag> },
            { title: t('analysisPage.fmTarget'), dataIndex: 'updatedAt', width: 130, render: (v: number) => dayjs(v).format('MM-DD HH:mm') },
            {
              title: t('analysisPage.edit'), key: 'op', width: 110,
              render: (_: unknown, it) => (
                <Space size={2}>
                  <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(it)}>{t('analysisPage.edit')}</Button>
                  <Popconfirm title={t('analysisPage.del')} onConfirm={() => del(it)}>
                    <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Space>

      <Drawer open={open} width={760} title={editing ? `${t('analysisPage.edit')} ${editing.ftaId}` : t('analysisPage.new')} onClose={() => setOpen(false)}
        extra={<Button type="primary" aria-label="fs-save" onClick={save}>{t('analysisPage.save')}</Button>} destroyOnClose>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            <Input style={{ width: 420 }} placeholder={t('analysisPage.ftaTop')} value={topEvent} onChange={(e) => setTopEvent(e.target.value)} addonBefore={t('analysisPage.ftaTop')} />
            <Select style={{ width: 110 }} value={topAsil} onChange={setTopAsil} options={(['A', 'B', 'C', 'D'] as FsAsil[]).map((a) => ({ value: a, label: ASIL_TAG_TEXT[a] }))} />
          </Space>
          <Alert type="info" showIcon message={t('analysisPage.ftaHint')} />
          {root && <NodeEditor node={root} onChange={setRoot} depth={0} />}
          {root && (
            <Alert type="success" showIcon message={<pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{preview}</pre>} />
          )}
        </Space>
      </Drawer>
    </div>
  );
}
