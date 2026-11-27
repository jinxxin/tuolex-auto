import { useState } from 'react';
import {
  Card, Form, Input, Select, Button, Table, Tag, Space, Typography, message,
} from 'antd';
import { SendOutlined, BulbOutlined, CheckOutlined, RollbackOutlined, PushpinOutlined } from '@ant-design/icons';
import { useLiveQuery, apiFetch, notifyDbChanged } from '../../core/api';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

const { Paragraph, Text } = Typography;

// 状态标签
const STATUS_META: Record<string, { color: string }> = {
  pending: { color: 'orange' },
  published: { color: 'green' },
  withdrawn: { color: 'red' },
};

const CATEGORY_OPTIONS = ['suggestion', 'bug', 'idea'];

export default function FeedbackPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user?.role === 'admin';
  const catLabel = (c: string) => (CATEGORY_OPTIONS.includes(c) ? t('fbPage.cat.' + c) : c);
  const statusLabel = (s: string) => (STATUS_META[s] ? t('fbPage.status.' + s) : s);
  // 我的建议 + admin 全部建议
  const myItems = useLiveQuery(async () => {
    const res = await apiFetch('/feedback/mine');
    return res.json();
  }, []) ?? [];
  const adminItems = useLiveQuery(async () => {
    if (!isAdmin) return [];
    const res = await apiFetch('/feedback/admin');
    return res.json();
  }, [isAdmin]) ?? [];

  const submit = async () => {
    const v = await form.validateFields();
    setSubmitting(true);
    try {
      await apiFetch('/feedback', {
        method: 'POST',
        body: JSON.stringify({ title: v.title ?? '', category: v.category ?? 'suggestion', content: v.content }),
      });
      msg.success(t('fbPage.thanks'));
      form.resetFields();
      notifyDbChanged();
    } catch (e) {
      msg.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const publish = async (id: number) => {
    await apiFetch(`/feedback/${id}/publish`, { method: 'PUT' });
    msg.success(t('fbPage.publishedMsg'));
    notifyDbChanged();
  };

  const withdraw = async (id: number) => {
    await apiFetch(`/feedback/${id}/withdraw`, { method: 'PUT' });
    msg.success(t('fbPage.withdrawnMsg'));
    notifyDbChanged();
  };

  const pin = async (id: number) => {
    await apiFetch(`/feedback/${id}/pin`, { method: 'PUT' });
    msg.success(t('fbPage.pinnedMsg'));
    notifyDbChanged();
  };

  const unpin = async (id: number) => {
    await apiFetch(`/feedback/${id}/unpin`, { method: 'PUT' });
    msg.success(t('fbPage.unpinnedMsg'));
    notifyDbChanged();
  };

  // 当前置顶状态（全表仅允许一条）
  const pinnedId = adminItems.find((x: { pinned_at: number | null }) => x.pinned_at != null)?.id;
  const hasPinned = pinnedId != null;

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: t('fbPage.colTitle'), dataIndex: 'title', width: 160, render: (v: string) => v || '—' },
    { title: t('fbPage.colContent'), dataIndex: 'content', ellipsis: true },
    { title: t('fbPage.category'), dataIndex: 'category', width: 100, render: (c: string) => catLabel(c) },
    { title: t('fbPage.colAuthor'), dataIndex: 'author_name', width: 110 },
    {
      title: t('fbPage.colStatus'), dataIndex: 'status', width: 90,
      render: (s: string) => <Tag color={STATUS_META[s]?.color}>{statusLabel(s)}</Tag>,
    },
    {
      title: t('fbPage.colTime'), dataIndex: 'created_at', width: 150,
      render: (v: number) => dayjs(v).format('MM-DD HH:mm'),
    },
    ...(isAdmin ? [{
      title: t('common.actions'), width: 220,
      render: (_: unknown, r: { id: number; status: string; pinned_at: number | null }) => (
        <Space size={2}>
          {r.status === 'pending' ? (
            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => publish(r.id)}>{t('fbPage.publish')}</Button>
          ) : r.status === 'published' ? (
            <>
              {r.pinned_at != null ? (
                <Button size="small" type="link" style={{ color: '#faad14' }} icon={<PushpinOutlined />} onClick={() => unpin(r.id)}>{t('fbPage.unpin')}</Button>
              ) : (
                <Button
                  size="small" type="link" icon={<PushpinOutlined />}
                  disabled={hasPinned}
                  title={hasPinned ? t('fbPage.pinTipHas') : t('fbPage.pinTip')}
                  onClick={() => pin(r.id)}
                >{t('fbPage.pin')}</Button>
              )}
              <Button size="small" danger icon={<RollbackOutlined />} onClick={() => withdraw(r.id)}>{t('fbPage.withdraw')}</Button>
            </>
          ) : (
            <Button size="small" type="primary" ghost icon={<CheckOutlined />} onClick={() => publish(r.id)}>{t('fbPage.republish')}</Button>
          )}
        </Space>
      ),
    }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {msgCtx}
      {/* 提交区 */}
      <Card title={<Space><BulbOutlined style={{ color: '#fa8c16' }} />{t('fbPage.title')}</Space>}>
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          {t('fbPage.intro1a')}<Tag color="orange">{t('fbPage.status.pending')}</Tag>{t('fbPage.intro1b')}<b>{t('fbPage.community')}</b>{t('fbPage.intro1c')}
        </Paragraph>
        <Form form={form} layout="vertical">
          <Space align="start" style={{ width: '100%' }} wrap>
            <Form.Item name="title" label={t('fbPage.titleLabel')} style={{ width: 300 }}>
              <Input placeholder={t('fbPage.titlePh')} maxLength={100} />
            </Form.Item>
            <Form.Item name="category" label={t('fbPage.category')} initialValue="suggestion" style={{ width: 140 }}>
              <Select options={CATEGORY_OPTIONS.map((v) => ({ value: v, label: catLabel(v) }))} />
            </Form.Item>
          </Space>
          <Form.Item name="content" label={t('fbPage.contentLabel')} rules={[{ required: true, message: t('fbPage.contentRequired') }]}>
            <Input.TextArea rows={4} placeholder={t('fbPage.contentPh')} maxLength={5000} showCount />
          </Form.Item>
          <Button type="primary" htmlType="button" icon={<SendOutlined />} loading={submitting} onClick={submit}>
            {t('fbPage.submit')}
          </Button>
        </Form>
      </Card>

      {/* 我的建议 */}
      <Card title={t('fbPage.myTitle')}>
        <Table rowKey="id" dataSource={myItems} columns={columns} pagination={{ pageSize: 8 }} size="small" />
      </Card>

      {/* admin：全部建议管理 */}
      {isAdmin && (
        <Card title={<Space><Text style={{ color: '#fa8c16' }}>{t('fbPage.adminTitle')}</Text></Space>}>
          <Paragraph type="secondary" style={{ marginBottom: 8 }}>
            {t('fbPage.adminIntro')}
          </Paragraph>
          <Table
            rowKey="id" dataSource={adminItems} columns={columns}
            pagination={{ pageSize: 8 }} size="small"
          />
        </Card>
      )}
    </div>
  );
}
