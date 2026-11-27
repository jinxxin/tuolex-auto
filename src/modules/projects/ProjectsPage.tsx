import { useMemo, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Modal, Form, Input, Select, message,
  Progress, Typography, TreeSelect, Dropdown,
} from 'antd';
import { PlusOutlined, FolderOpenOutlined, TeamOutlined, MoreOutlined } from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { createRecord, updateRecord, deleteRecord } from '../../core/repo';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import ProjectMembersModal from '../../components/ProjectMembersModal';
import { SYSTEM_TYPES, PROJECT_STATUS_META } from '../../core/constants';
import { FS_PACKS } from '../../core/fs/fsPacks';
import { PROCESS_GROUPS } from '../../core/aspice/processes';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import type { Project, AspiceStdVersion } from '../../core/types';

const { Text } = Typography;

// 默认过程范围（3.1：SYS+SWE 核心 + SUP/MAN 常用）
const DEFAULT_SCOPE_31 = ['SYS.1', 'SYS.2', 'SYS.3', 'SYS.4', 'SYS.5', 'SWE.1', 'SWE.2', 'SWE.3', 'SWE.4', 'SWE.5', 'SWE.6', 'SUP.1', 'SUP.2', 'SUP.4', 'SUP.5', 'SUP.7', 'SUP.8', 'SUP.9', 'MAN.3', 'MAN.5', 'MAN.6'];
const DEFAULT_SCOPE_40 = [...DEFAULT_SCOPE_31.filter((c) => !['SUP.8', 'SUP.9'].includes(c)), 'SUP.8', 'SUP.9', 'SUP.10', 'HWE.1', 'HWE.2', 'HWE.3', 'HWE.4'];

export default function ProjectsPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith('en');
  const [msg, msgCtx] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form] = Form.useForm();

  const [memberOf, setMemberOf] = useState<Project | null>(null);

  const projects = useLiveQuery(() => db.projects.orderBy('id').reverse().toArray(), []) ?? [];
  const processes = useLiveQuery(() => db.aspice_processes.toArray(), []) ?? [];

  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };
  const stdVersion = Form.useWatch('stdVersion', form);

  // 过程树（按版本过滤，供 TreeSelect 多选）；过程/组名随语言取 name/nameZh 现成字段
  const processTree = useMemo(() => {
    const version: AspiceStdVersion = stdVersion || '3.1';
    const list = processes.filter((p) => p.stdVersion === version);
    const groups: Record<string, { code: string; name: string; nameZh: string }[]> = {};
    for (const p of list) (groups[p.groupCode] = groups[p.groupCode] || []).push({ code: p.code, name: p.name, nameZh: p.nameZh });
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([g, items]) => {
        const gd = PROCESS_GROUPS[g];
        const gName = isEn ? (gd?.name || g) : (gd?.nameZh || g);
        const open = isEn ? '(' : '（';
        const close = isEn ? ')' : '）';
        return {
          title: `${g} — ${gName}${open}${items.length}${close}`,
          value: g,
          selectable: false,
          children: items.map((i) => ({ title: `${i.code} ${isEn ? i.name : i.nameZh}`, value: i.code })),
        };
      });
  }, [processes, stdVersion, isEn]);

  const switchVersion = (v: AspiceStdVersion) => {
    form.setFieldsValue({ processScope: v === '3.1' ? DEFAULT_SCOPE_31 : DEFAULT_SCOPE_40 });
  };

  const save = async () => {
    const v = await form.validateFields();
    const now = Date.now();
    if (!v.processScope?.length) {
      msg.error(t('projects.scopeRequired'));
      return;
    }
    if (editing?.id) {
      await updateRecord<Project>('projects', editing.id, { ...v, updatedAt: now }, actor,
        t('projects.auditEdit', { name: v.name, std: v.stdVersion, n: v.processScope.length }));
      msg.success(t('projects.saved'));
    } else {
      await createRecord<Project>('projects', {
        ...v, status: 'init', processStatus: {}, createdAt: now, updatedAt: now,
      }, actor, t('projects.auditNew', { name: v.name, sys: v.sysType, std: v.stdVersion, n: v.processScope.length }));
      msg.success(t('projects.created'));
    }
    setOpen(false);
  };

  const remove = async (p: Project) => {
    await deleteRecord('projects', p.id!, actor, t('projects.auditDel', { name: p.name }));
    msg.success(t('projects.deleted'));
  };

  // 存档：非立项项目不可删除，只能归档保留（数据只读保留、可追溯）
  const archive = async (p: Project) => {
    await updateRecord<Project>('projects', p.id!, { status: 'archived', updatedAt: Date.now() }, actor, t('projects.auditArc', { name: p.name }));
    msg.success(t('projects.archivedMsg'));
  };

  const startValidation = async (p: Project) => {
    await updateRecord<Project>('projects', p.id!, { status: 'validation', updatedAt: Date.now() }, actor, t('projects.auditStart', { name: p.name }));
    msg.success(t('projects.startedMsg'));
  };

  // 进度 = 已启动过程占比
  const progress = useMemo(() => {
    const map: Record<number, number> = {};
    for (const p of projects) {
      const scope = p.processScope || [];
      const st = p.processStatus || {};
      const started = scope.filter((c) => st[c] && st[c] !== 'not_started').length;
      map[p.id!] = scope.length ? Math.round((started / scope.length) * 100) : 0;
    }
    return map;
  }, [projects]);

  const statusLabel = (s: string) => {
    const meta = PROJECT_STATUS_META[s];
    return meta ? t('proj.status.' + s) : s;
  };

  return (
    <Card title={t('projects.title')} extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>{t('projects.new')}</Button>}>
      {msgCtx}
      <Text type="secondary">
        {t('projects.intro')}
      </Text>
      <Table<Project>
        rowKey="id" style={{ marginTop: 12 }} dataSource={projects} pagination={false} scroll={{ x: 1250 }}
        columns={[
          { title: t('projects.colName'), dataIndex: 'name', width: 300, ellipsis: true, render: (v, p) => (
            <a onClick={() => nav(`/projects/${p.id}`)}><FolderOpenOutlined /> {v}</a>
          )},
          { title: t('projects.colSys'), dataIndex: 'sysType', width: 100, render: (v) => <Tag color="blue">{v}</Tag> },
          { title: t('projects.colStd'), dataIndex: 'stdVersion', width: 100, render: (v) => <Tag color="purple">ASPICE {v}</Tag> },
          { title: t('projects.colScope'), width: 180, render: (_, p) => {
            const scope = p.processScope || [];
            const st = p.processStatus || {};
            const assessed = scope.filter((c) => st[c] === 'assessed').length;
            return <Space size={4} wrap><Tag color="geekblue">{t('projects.scopeCount', { n: scope.length })}</Tag>{assessed > 0 && <Tag color="green">{t('projects.assessedCount', { n: assessed })}</Tag>}</Space>;
          }},
          { title: t('projects.colVendor'), dataIndex: 'vendor', width: 110, ellipsis: true },
          { title: t('projects.colStatus'), dataIndex: 'status', width: 150, render: (s: string) => <Tag color={PROJECT_STATUS_META[s]?.color} style={{ whiteSpace: 'nowrap' }}>{statusLabel(s)}</Tag> },
          { title: t('projects.colProgress'), width: 150, render: (_, p) => <Progress percent={progress[p.id!] ?? 0} size="small" /> },
          { title: t('projects.colCreated'), dataIndex: 'createdAt', width: 100, render: (v) => dayjs(v).format('YYYY-MM-DD') },
          { title: t('projects.colActions'), width: 230, fixed: 'right', render: (_, p) => (
            <Space size={4}>
              <Button size="small" type="link" icon={<TeamOutlined />} onClick={() => setMemberOf(p)}>{t('projects.members')}</Button>
              {p.status === 'init' && (
                <Button size="small" type="link" style={{ color: '#2f9e44' }} onClick={() => startValidation(p)}>{t('projects.startDev')}</Button>
              )}
              <Dropdown trigger={['click']} menu={{
                items: [
                  { type: 'group', label: t('projects.quickJump'), children: [
                    { key: 'ventry', label: t('tabs.ventry') },
                    { key: 'process', label: t('tabs.process') },
                    { key: 'assess', label: t('tabs.assess') },
                    { key: 'audit2', label: t('tabs.audit2') },
                    { key: 'trace', label: t('tabs.trace') },
                    { key: 'config', label: t('tabs.config') },
                    { key: 'docs', label: t('tabs.docs') },
                  ]},
                  { type: 'divider' },
                  { type: 'group', label: t('projects.projActions'), children: [
                    ...(p.status === 'init' ? [
                      { key: 'edit', label: t('projects.edit') },
                      { key: 'delete', label: t('projects.delete'), danger: true },
                    ] : []),
                    ...(p.status !== 'init' && p.status !== 'archived' ? [
                      { key: 'archive', label: t('projects.archive') },
                    ] : []),
                  ]},
                ],
                onClick: ({ key }) => {
                  if (key === 'edit') { setEditing(p); form.setFieldsValue(p); setOpen(true); return; }
                  if (key === 'delete') { Modal.confirm({ title: t('projects.delTitle'), content: t('projects.delContent'), okText: t('projects.delOk'), okType: 'danger', cancelText: t('common.cancel'), onOk: () => remove(p) }); return; }
                  if (key === 'archive') { Modal.confirm({ title: t('projects.arcTitle'), content: t('projects.arcContent'), okText: t('projects.arcOk'), cancelText: t('common.cancel'), onOk: () => archive(p) }); return; }
                  nav(`/projects/${p.id}?tab=${key}`);
                },
              }}>
                <Button size="small" type="link" icon={<MoreOutlined />}>{t('projects.more')}</Button>
              </Dropdown>
            </Space>
          )},
        ]}
      />

      <ProjectMembersModal
        projectId={memberOf?.id ?? 0}
        projectName={memberOf?.name ?? ''}
        open={!!memberOf}
        onClose={() => setMemberOf(null)}
      />

      <Modal open={open} onCancel={() => setOpen(false)} onOk={save} title={editing ? t('projects.formEdit') : t('projects.formNew')} width={680}>
        <Form form={form} layout="vertical" initialValues={{ sysType: 'ADAS', stdVersion: '3.1', processScope: DEFAULT_SCOPE_31 }}>
          <Form.Item name="name" label={t('projects.nameLabel')} rules={[{ required: true, message: t('projects.nameRequired') }]}>
            <Input placeholder={t('projects.namePh')} />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="sysType" label={t('projects.sysLabel')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={SYSTEM_TYPES.map((v) => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item name="stdVersion" label={t('projects.stdLabel')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={[
                { value: '3.1', label: t('projects.std31') },
                { value: '4.0', label: t('projects.std40') },
              ]} onChange={(v) => switchVersion(v)} />
            </Form.Item>
          </Space>
          <Form.Item name="processScope" label={t('projects.scopeLabel')} rules={[{ required: true, message: t('projects.scopeRequired') }]}>
            <TreeSelect
              treeData={processTree} multiple treeCheckable showCheckedStrategy={TreeSelect.SHOW_CHILD}
              placeholder={t('projects.scopePh')} allowClear maxTagCount={8}
              dropdownStyle={{ maxHeight: 400 }} treeDefaultExpandAll
            />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="vendor" label={t('projects.vendorLabel')} style={{ flex: 1 }}>
              <Input placeholder={t('projects.vendorPh')} />
            </Form.Item>
          </Space>
          <Form.Item name="description" label={t('projects.descLabel')}>
            <Input.TextArea rows={3} placeholder={t('projects.descPh')} />
          </Form.Item>
          <Form.Item name="fsSysType" label={t('projects.fsSysLabel')} extra={t('projects.fsSysExtra')}>
            <Select allowClear placeholder={t('projects.fsSysPh')}
              options={FS_PACKS.map((p) => ({ value: p.id, label: `${p.sysType}（${p.hazards.length}）` }))} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
