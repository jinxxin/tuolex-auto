import { useState } from 'react';
import { Card, Table, Tag, Space, Button, Drawer, Typography, Select, Input, Form, message, Popconfirm, Alert, Progress } from 'antd';
import { PlusOutlined, ApartmentOutlined, DeleteOutlined, RocketOutlined, EditOutlined } from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { createRecord, updateRecord, deleteRecord } from '../../core/repo';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import type { Project, ConfigItem, Baseline } from '../../core/types';

const { Text } = Typography;

// ============ 配置管理（SUP.7/SUP.8）：配置项 + 基线 + 状态流转 ============
// 配置项：文档/源码/需求/测试/工具 受控对象；基线：快照发布，基线内配置项锁定

interface Props { project: Project }

const CI_KINDS = ['文档', '源码', '需求', '测试', '工具', '配置'];
const CI_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  baselined: { label: '已入基线', color: 'blue' },
  released: { label: '已发布', color: 'green' },
  obsolete: { label: '已废弃', color: 'red' },
};

export default function ConfigTab({ project }: Props) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith('en');
  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };
  const pid = project.id!;
  const [msg, msgCtx] = message.useMessage();
  const [ciOpen, setCiOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigItem | null>(null);
  const [blOpen, setBlOpen] = useState(false);
  const [form] = Form.useForm();
  const [blForm] = Form.useForm();

  const items = useLiveQuery(() => db.config_items.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const baselines = useLiveQuery(() => db.baselines.where('projectId').equals(pid).toArray(), [pid]) ?? [];

  const seq = (prefix: string, arr: { ciCode?: string; code?: string }[]) =>
    `${prefix}-${String(arr.length + 1).padStart(3, '0')}`;

  const openCi = (item?: ConfigItem) => {
    setEditing(item || null);
    form.resetFields();
    if (item) form.setFieldsValue(item);
    setCiOpen(true);
  };
  const saveCi = async () => {
    const v = await form.validateFields();
    const now = Date.now();
    if (editing?.id) {
      await updateRecord<ConfigItem>('config_items', editing.id, { ...v, updatedAt: now }, actor, t('configTab.auditEditCi', { code: v.ciCode, name: v.name }));
      msg.success(t('configTab.saved'));
    } else {
      await createRecord<ConfigItem>('config_items', {
        ...v, ciCode: seq('CI', items), status: 'draft', createdBy: actor.username, updatedAt: now,
      }, actor, t('configTab.auditNewCi', { name: v.name }));
      msg.success(t('configTab.ciCreated'));
    }
    setCiOpen(false);
  };
  const removeCi = async (c: ConfigItem) => {
    await deleteRecord('config_items', c.id!, actor, t('configTab.auditDelCi', { code: c.ciCode, name: c.name }));
    msg.success(t('configTab.deleted'));
  };

  const openBl = () => {
    blForm.resetFields();
    setBlOpen(true);
  };
  const saveBl = async () => {
    const v = await blForm.validateFields();
    await createRecord<Baseline>('baselines', {
      ...v, code: seq('BL', baselines), status: 'draft', createdBy: actor.username, createdAt: Date.now(),
    }, actor, t('configTab.auditNewBl', { name: v.name }));
    msg.success(t('configTab.blCreatedDraft'));
    setBlOpen(false);
  };
  const releaseBl = async (b: Baseline) => {
    // 发布基线：把包含的配置项置为 baselined
    await updateRecord<Baseline>('baselines', b.id!, { status: 'released' }, actor, t('configTab.auditReleaseBl', { code: b.code, name: b.name }));
    for (const ciId of b.ciIds || []) {
      const ci = items.find((i) => i.id === ciId);
      if (ci && ci.status === 'draft') {
        await updateRecord<ConfigItem>('config_items', ci.id!, { status: 'baselined', updatedAt: Date.now() }, actor, t('configTab.auditCiBaselined', { code: b.code }));
      }
    }
    msg.success(t('configTab.blReleased', { code: b.code, n: (b.ciIds || []).length }));
  };
  const removeBl = async (b: Baseline) => {
    await deleteRecord('baselines', b.id!, actor, t('configTab.auditDelBl', { code: b.code, name: b.name }));
    msg.success(t('configTab.deleted'));
  };

  const baselinedCount = items.filter((i) => i.status === 'baselined' || i.status === 'released').length;

  const ciStatusLabel = (s: string) => t('configTab.ciStatus.' + s);

  return (
    <div>
      {msgCtx}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space size={24}>
          <span><Text type="secondary">{t('configTab.statCi')}</Text> <b style={{ fontSize: 18 }}>{items.length}</b>（<Tag color="blue">{t('configTab.statBaselined', { n: baselinedCount })}</Tag>）</span>
          <span><Text type="secondary">{t('configTab.statBl')}</Text> <b style={{ fontSize: 18 }}>{baselines.length}</b>（<Tag color="green">{t('configTab.statReleased', { n: baselines.filter((b) => b.status === 'released').length })}</Tag>）</span>
          <span style={{ width: 200 }}><Progress percent={items.length ? Math.round((baselinedCount / items.length) * 100) : 0} size="small" strokeColor="#1b6ca8" /></span>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCi()}>{t('configTab.addCi')}</Button>
          <Button icon={<RocketOutlined />} onClick={openBl}>{t('configTab.newBl')}</Button>
        </Space>
      </Card>

      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message={t('configTab.alertTitle')}
        description={t('configTab.alertDesc')} />

      <Card size="small" title={<Space><ApartmentOutlined /> {t('configTab.ciTitle')}</Space>} style={{ marginBottom: 12 }}>
        <Table
          rowKey="id" size="small" pagination={false}
          dataSource={items}
          columns={[
            { title: t('configTab.colCode'), dataIndex: 'ciCode', width: 80, render: (v) => <b>{v}</b> },
            { title: t('configTab.colName'), dataIndex: 'name', ellipsis: true },
            { title: t('configTab.colKind'), dataIndex: 'kind', width: 80, render: (v) => <Tag>{v}</Tag> },
            { title: t('configTab.colVersion'), dataIndex: 'version', width: 80 },
            { title: t('configTab.colStatus'), dataIndex: 'status', width: 100, render: (v) => <Tag color={CI_STATUS[v]?.color}>{ciStatusLabel(v)}</Tag> },
            { title: t('configTab.colOwner'), dataIndex: 'owner', width: 90 },
            {
              title: t('configTab.colActions'), dataIndex: 'id', width: 120,
              render: (_, c) => (
                <Space size={4}>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openCi(c)}>{t('common.edit')}</Button>
                  <Popconfirm title={t('configTab.delCiConfirm')} onConfirm={() => removeCi(c)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Card size="small" title={<Space><RocketOutlined /> {t('configTab.blTitle')}</Space>}>
        <Table
          rowKey="id" size="small" pagination={false}
          dataSource={[...baselines].sort((a, b) => b.createdAt - a.createdAt)}
          columns={[
            { title: t('configTab.colCode'), dataIndex: 'code', width: 80, render: (v) => <b>{v}</b> },
            { title: t('configTab.colName'), dataIndex: 'name' },
            { title: t('configTab.colCiIds'), dataIndex: 'ciIds', width: 100, render: (v: number[]) => <Tag color="blue">{t('configTab.ciCount', { n: v?.length || 0 })}</Tag> },
            { title: t('configTab.colStatus'), dataIndex: 'status', width: 90, render: (v) => v === 'released' ? <Tag color="green">{t('configTab.ciStatus.released')}</Tag> : <Tag>{t('configTab.ciStatus.draft')}</Tag> },
            { title: t('configTab.colCreatedBy'), dataIndex: 'createdBy', width: 90 },
            { title: t('configTab.colCreatedAt'), dataIndex: 'createdAt', width: 150, render: (v) => new Date(v).toLocaleString(isEn ? 'en-US' : 'zh-CN') },
            {
              title: t('configTab.colActions'), dataIndex: 'id', width: 140,
              render: (_, b) => (
                <Space size={4}>
                  {b.status === 'draft' && <Button size="small" type="primary" icon={<RocketOutlined />} onClick={() => releaseBl(b)}>{t('configTab.release')}</Button>}
                  <Popconfirm title={t('configTab.delBlConfirm')} onConfirm={() => removeBl(b)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Drawer title={editing ? t('configTab.editCiTitle', { code: editing.ciCode }) : t('configTab.newCiTitle')} width={480} open={ciOpen} onClose={() => setCiOpen(false)}
        extra={<Space><Button onClick={() => setCiOpen(false)}>{t('common.cancel')}</Button><Button type="primary" onClick={saveCi}>{t('common.save')}</Button></Space>}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('configTab.nameLabel')} rules={[{ required: true, message: t('configTab.nameRequired') }]}><Input placeholder={t('configTab.namePh')} /></Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="kind" label={t('configTab.kindLabel')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={CI_KINDS.map((k) => ({ value: k, label: k }))} />
            </Form.Item>
            <Form.Item name="version" label={t('configTab.versionLabel')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder={t('configTab.versionPh')} />
            </Form.Item>
          </Space>
          <Form.Item name="owner" label={t('configTab.ownerLabel')}><Input /></Form.Item>
          <Form.Item name="desc" label={t('configTab.descLabel')}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Drawer>

      <Drawer title={t('configTab.newBlTitle')} width={480} open={blOpen} onClose={() => setBlOpen(false)}
        extra={<Space><Button onClick={() => setBlOpen(false)}>{t('common.cancel')}</Button><Button type="primary" onClick={saveBl}>{t('configTab.create')}</Button></Space>}>
        <Form form={blForm} layout="vertical">
          <Form.Item name="name" label={t('configTab.blNameLabel')} rules={[{ required: true, message: t('configTab.blNameRequired') }]}><Input placeholder={t('configTab.blNamePh')} /></Form.Item>
          <Form.Item name="ciIds" label={t('configTab.blCiLabel')} rules={[{ required: true, message: t('configTab.blCiRequired') }]}>
            <Select mode="multiple" allowClear placeholder={t('configTab.blCiPh')}
              options={items.filter((i) => i.status === 'draft' || i.status === 'baselined').map((i) => ({ value: i.id!, label: `${i.ciCode} ${i.name}（${i.version}）` }))} />
          </Form.Item>
          <Form.Item name="note" label={t('configTab.noteLabel')}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
