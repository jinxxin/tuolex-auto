import { useMemo, useState } from 'react';
import {
  Table, Tag, Button, Space, Typography, Drawer, Alert, Input, Select, message, Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { nextSeq } from '../../core/seq';
import { ASIL_TAG_TEXT, ASIL_COLOR } from '../../core/fs/data';
import type { FsDfa, FsDfaRow, FsDfaMechanism, FsAsil } from '../../core/types';

const { Text } = Typography;
const rid = () => `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const MECH: { value: FsDfaMechanism; key: string }[] = [
  { value: 'cascading', key: 'analysisPage.dfaMechCascade' },
  { value: 'commonCause', key: 'analysisPage.dfaMechCommon' },
  { value: 'interaction', key: 'analysisPage.dfaMechInteract' },
];

export default function DfaTab({ pid }: { pid: number }) {
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FsDfa | null>(null);
  const [scope, setScope] = useState('');
  const [asil, setAsil] = useState<FsAsil>('D');
  const [rows, setRows] = useState<FsDfaRow[]>([]);
  const items = useLiveQuery(() => db.fs_dfa.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const reqs = useLiveQuery(() => db.fs_safety_reqs.where('projectId').equals(pid).toArray(), [pid]) ?? [];

  // 一致性：本项目声明的分解（asilDecomposed）是否被任一 DFA 行文本覆盖
  const consistency = useMemo(() => {
    const decompCodes = reqs.filter((r) => r.asilDecomposed).map((r) => r.code);
    const allText = items.flatMap((d) => (d.rows ?? []).map((r) => `${r.refA} ${r.refB} ${r.couplingDetail} ${r.analysis}`).join(' ')).join(' ');
    const uncovered = decompCodes.filter((c) => !allText.includes(c));
    return { total: decompCodes.length, uncovered };
  }, [reqs, items]);

  const blankRow = (): FsDfaRow => ({
    id: rid(), refA: '', refB: '', mechanism: 'commonCause', couplingDetail: '', analysis: '', mitigation: '',
  });
  const upd = (i: number, patch: Partial<FsDfaRow>) => setRows((p) => p.map((r, x) => (x === i ? { ...r, ...patch } : r)));

  const openCreate = () => {
    setEditing(null); setScope(''); setAsil('D'); setRows([blankRow()]); setOpen(true);
  };
  const openEdit = async (it: FsDfa) => {
    const full = (await db.fs_dfa.get(it.id!)) ?? it;     // 列表投影排除 rows
    setEditing(it); setScope(full.scope); setAsil(full.asil as FsAsil);
    setRows((full.rows || []).length ? full.rows : [blankRow()]); setOpen(true);
  };

  const save = async () => {
    const clean = rows.filter((r) => r.refA?.trim() && r.refB?.trim());
    const now = Date.now();
    if (editing?.id) {
      await db.fs_dfa.update(editing.id, { scope, asil, rows: clean, status: 'reviewed', updatedAt: now },
        t('analysisPage.auditEdit', { id: editing.dfaId, version: 1 }));
    } else {
      const dfaId = await nextSeq(pid, 'DFA');
      await db.fs_dfa.add({ projectId: pid, dfaId, scope, asil, rows: clean, status: 'draft', createdAt: now, updatedAt: now },
        t('analysisPage.auditNew', { id: dfaId }));
    }
    setOpen(false);
    msg.success('✓');
  };
  const del = async (it: FsDfa) => { await db.fs_dfa.delete(it.id!, t('analysisPage.auditDel', { id: it.dfaId })); };

  return (
    <div>
      {msgCtx}
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {/* 页级一致性状态 */}
        {consistency.total > 0 && (
          consistency.uncovered.length === 0
            ? <Alert type="success" showIcon message={t('analysisPage.dfaConsistOk', { n: consistency.total })} />
            : <Alert type="warning" showIcon message={t('analysisPage.dfaConsistWarn', { m: consistency.uncovered.length, n: consistency.total, codes: consistency.uncovered.join(', ') })} />
        )}
        <Space wrap>
          <Button type="primary" aria-label="dfa-new" icon={<PlusOutlined />} onClick={openCreate}>{t('analysisPage.new')}</Button>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('analysisPage.dfaHint')}</Text>
        </Space>
        <Table<FsDfa> rowKey="id" size="small" dataSource={items} pagination={false} locale={{ emptyText: t('analysisPage.empty') }}
          columns={[
            { title: 'ID', dataIndex: 'dfaId', width: 100, render: (v: string) => <Text code>{v}</Text> },
            { title: t('analysisPage.dfaScope'), dataIndex: 'scope', ellipsis: true },
            { title: t('analysisPage.fmAsil'), dataIndex: 'asil', width: 90, render: (a: FsAsil) => <Tag color={ASIL_COLOR[a]}>{ASIL_TAG_TEXT[a]}</Tag> },
            { title: t('analysisPage.dfaRows'), key: 'n', width: 110, render: (_: unknown, it) => <Tag>{(it.rows ?? []).length} 行</Tag> },
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

      <Drawer open={open} width={980} title={editing ? `${t('analysisPage.edit')} ${editing.dfaId}` : t('analysisPage.new')} onClose={() => setOpen(false)}
        extra={<Button type="primary" aria-label="fs-save" onClick={save}>{t('analysisPage.save')}</Button>} destroyOnClose>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space wrap>
            <Input style={{ width: 460 }} placeholder={t('analysisPage.dfaScope')} value={scope} onChange={(e) => setScope(e.target.value)} addonBefore={t('analysisPage.dfaScope')} />
            <Select style={{ width: 110 }} value={asil} onChange={setAsil} options={(['A', 'B', 'C', 'D'] as FsAsil[]).map((a) => ({ value: a, label: ASIL_TAG_TEXT[a] }))} />
          </Space>
          <Table<FsDfaRow> rowKey="id" size="small" pagination={false} dataSource={rows}
            locale={{ emptyText: t('analysisPage.empty') }}
            footer={() => <Button size="small" icon={<PlusOutlined />} onClick={() => setRows((p) => [...p, blankRow()])}>+ {t('analysisPage.dfaRows')}</Button>}
            columns={[
              { title: t('analysisPage.dfaColA'), key: 'a', width: 150,
                render: (_: unknown, r, i) => <Input size="small" placeholder={t('analysisPage.dfaPh')} value={r.refA} onChange={(e) => upd(i, { refA: e.target.value })} /> },
              { title: t('analysisPage.dfaColB'), key: 'b', width: 150,
                render: (_: unknown, r, i) => <Input size="small" placeholder={t('analysisPage.dfaPh')} value={r.refB} onChange={(e) => upd(i, { refB: e.target.value })} /> },
              { title: t('analysisPage.dfaColMech'), key: 'm', width: 140,
                render: (_: unknown, r, i) => (
                  <Select size="small" style={{ width: '100%' }} value={r.mechanism} onChange={(v) => upd(i, { mechanism: v })}
                    options={MECH.map((m) => ({ value: m.value, label: t(m.key) }))} />
                ) },
              { title: t('analysisPage.dfaColDetail'), key: 'd', ellipsis: true,
                render: (_: unknown, r, i) => <Input size="small" placeholder="共享电源/时钟/软件/环境…" value={r.couplingDetail} onChange={(e) => upd(i, { couplingDetail: e.target.value })} /> },
              { title: t('analysisPage.dfaColMit'), key: 'g', width: 200,
                render: (_: unknown, r, i) => <Input size="small" placeholder={t('analysisPage.dfaColMit')} value={r.mitigation} onChange={(e) => upd(i, { mitigation: e.target.value })} /> },
              { title: '', key: 'x', width: 40,
                render: (_: unknown, _r, i) => <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setRows((p) => p.filter((_, x) => x !== i))} /> },
            ]}
          />
        </Space>
      </Drawer>
    </div>
  );
}
