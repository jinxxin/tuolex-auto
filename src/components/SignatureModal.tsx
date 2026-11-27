import { useState } from 'react';
import { Modal, Form, Input, Select, Alert, Typography, Space } from 'antd';
import { LockOutlined, UserOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { signWithPasswordCheck } from '../core/signature';
import { useAuth } from '../store/auth';
import { useTranslation } from 'react-i18next';
import type { SignatureRecord } from '../core/types';

const { Text } = Typography;

// 电子签核含义声明选项
export const SIGN_MEANINGS = [
  '批准 (I Approve)',
  '审核 (I Reviewed)',
  '证明 (I Certify)',
  '同意发布 (I Agree)',
];

interface Props {
  open: boolean;
  onClose: () => void;
  docInfo: { docType: string; docTitle: string; docVersion: string; docContent: unknown };
  onSuccess: (rec: SignatureRecord) => void;
}

// 电子签名弹窗：用户名 + 密码 → 签名含义声明 → 内容哈希绑定 → 审计留痕
export default function SignatureModal({ open, onClose, docInfo, onSuccess }: Props) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const submit = async () => {
    const v = await form.validateFields();
    setLoading(true);
    setErr('');
    try {
      const rec = await signWithPasswordCheck(v.username, v.password, {
        meaning: v.meaning,
        docType: docInfo.docType,
        docTitle: docInfo.docTitle,
        docVersion: docInfo.docVersion,
        docContent: docInfo.docContent,
      });
      form.resetFields();
      onSuccess(rec);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open} onCancel={onClose} onOk={submit} okText={t('signModal.sign')}
      confirmLoading={loading} title={<Space><SafetyCertificateOutlined style={{ color: '#1b6ca8' }} />{t('signModal.title')}</Space>}
      width={520}
    >
      <div style={{ background: '#f6f9fc', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>
        <Space direction="vertical" size={2}>
          <Text strong>{t('signModal.docFmt', { type: docInfo.docType, title: docInfo.docTitle, ver: docInfo.docVersion })}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('signModal.hashNote')}
          </Text>
        </Space>
      </div>
      {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 12 }} />}
      <Form form={form} layout="vertical" initialValues={{ username: user?.username, meaning: SIGN_MEANINGS[0] }}>
        <Form.Item name="meaning" label={t('signModal.meaningLabel')} rules={[{ required: true }]}>
          <Select options={SIGN_MEANINGS.map((m) => ({ value: m, label: m }))} />
        </Form.Item>
        <Space size={12} style={{ display: 'flex' }}>
          <Form.Item name="username" label={t('signCenter.signer')} rules={[{ required: true, message: t('login.usernameRequired') }]} style={{ flex: 1 }}>
            <Input prefix={<UserOutlined />} placeholder={t('login.username')} />
          </Form.Item>
          <Form.Item name="password" label={t('login.password')} rules={[{ required: true, message: t('login.passwordRequired') }]} style={{ flex: 1 }}>
            <Input.Password prefix={<LockOutlined />} placeholder={t('login.password')} />
          </Form.Item>
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('signModal.auditNote')}
        </Text>
      </Form>
    </Modal>
  );
}
