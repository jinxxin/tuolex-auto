import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Typography, Alert, Space, Tag } from 'antd';
import { LockOutlined, UserOutlined, SafetyCertificateOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../store/auth';
import { BRAND } from '../../brand';

const { Title, Paragraph, Text } = Typography;

export default function LoginPage() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const { t } = useTranslation();
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  // 首次部署：库中无用户 → 走初始化
  useEffect(() => {
    fetch('/api/auth/setup-state').then((r) => r.json())
      .then((d) => setNeedsSetup(!!d.needsSetup))
      .catch(() => {});
  }, []);

  const onSetup = async (v: { username: string; password: string; name?: string }) => {
    setLoading(true); setErr('');
    try {
      const r = await fetch('/api/auth/setup', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: v.username, password: v.password, name: v.name || '' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || t('login.setupFail')); return; }
      const lg = await login(v.username, v.password);
      if (lg.ok) { nav(next); return; }
      setNeedsSetup(false);
      setErr(lg.msg || t('login.fail'));
    } catch (e) {
      setErr(t('login.exception') + (e instanceof Error ? e.message : String(e)));
    } finally { setLoading(false); }
  };

  // 登录后回跳目标（来自 ?next=，仅接受站内路径，防开放重定向）
  const nextRaw = new URLSearchParams(loc.search).get('next');
  // 注意：next='/' 会停在根路由（内容为空），统一归一到工作台
  const nextOk = nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/dashboard';
  const next = nextOk === '/' ? '/dashboard' : nextOk;

  // 已登录用户访问 /login 时直接进入目标（或工作台）
  // 已登录用户访问 /login 时直接进入目标。必须放在 effect 里：
  // 渲染期调用导航会在 setLoading(false) 重渲染时二次跳转，最终停回 '/' 变成空白页（2026-10-26 修）
  useEffect(() => { if (user) nav(next, { replace: true }); }, [user, next, nav]);

  const onFinish = async (v: { username: string; password: string }) => {
    setLoading(true);
    setErr('');
    try {
      const r = await login(v.username, v.password);
      if (r.ok) {
        nav(next);
        return;
      }
      setErr(r.msg || t('login.fail'));
    } catch (e) {
      setErr(t('login.exception') + (e instanceof Error ? e.message : String(e)));
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      background: 'linear-gradient(135deg, #0b2545 0%, #13315c 45%, #1b6ca8 100%)',
      padding: 16,
    }}>
      <div style={{ display: 'flex', gap: 48, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 1080 }}>
        <div style={{ maxWidth: 420, color: '#fff' }}>
          <Space align="center" size={12}>
            <SafetyCertificateOutlined style={{ fontSize: 40, color: '#7fd1ff' }} />
            <Title level={2} style={{ color: '#fff', margin: 0 }}>{BRAND.app.auto}</Title>
          </Space>
          <Title level={4} style={{ color: '#cfe6f7', marginTop: 8, fontWeight: 400 }}>
            {t('layout.title')}
          </Title>
          <Paragraph style={{ color: '#a9c8e4', marginTop: 16 }}>
            {t('login.desc')}
          </Paragraph>
          <Space wrap size={[8, 8]} style={{ marginTop: 12 }}>
            <Tag color="geekblue">A-SPICE 3.1 / 4.0</Tag>
            <Tag color="purple">ISO 26262</Tag>
            <Tag color="cyan">IATF 16949</Tag>
            <Tag color="magenta">AIAG-VDA FMEA</Tag>
          </Space>
        </div>

        {needsSetup ? (
        <Card style={{ width: 380, boxShadow: '0 12px 40px rgba(0,0,0,.35)', borderRadius: 12 }}>
          <Title level={4} style={{ marginTop: 0 }}>{t('login.setupTitle')}</Title>
          <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t('login.setupDesc')} />
          {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 16 }} />}
          <Form onFinish={onSetup} layout="vertical">
            <Form.Item name="username" rules={[{ required: true, message: t('login.usernameRequired') }]}>
              <Input size="large" prefix={<UserOutlined />} placeholder={t('login.setupUsername')} autoComplete="username" />
            </Form.Item>
            <Form.Item name="name">
              <Input size="large" placeholder={t('login.setupName')} autoComplete="name" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, min: 8, message: t('login.setupPasswordShort') }]}>
              <Input.Password size="large" prefix={<LockOutlined />} placeholder={t('login.setupPassword')} autoComplete="new-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={loading} icon={<ThunderboltOutlined />}>
              {t('login.setupSubmit')}
            </Button>
          </Form>
        </Card>
        ) : (
        <Card style={{ width: 380, boxShadow: '0 12px 40px rgba(0,0,0,.35)', borderRadius: 12 }}>
          <Title level={4} style={{ marginTop: 0 }}>{t('login.title')}</Title>
          {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 16 }} />}
          <Form onFinish={onFinish} layout="vertical">
            <Form.Item name="username" rules={[{ required: true, message: t('login.usernameRequired') }]}>
              <Input size="large" prefix={<UserOutlined />} placeholder={t('login.username')} autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: t('login.passwordRequired') }]}>
              <Input.Password size="large" prefix={<LockOutlined />} placeholder={t('login.password')} autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={loading} icon={<ThunderboltOutlined />}>
              {t('login.submit')}
            </Button>
          </Form>
          <div style={{ marginTop: 20, padding: '10px 12px', background: '#f6f9fc', borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              自托管版本：账号与数据都在你自己的数据库里，无遥测、无外部依赖。
            </Text>
          </div>
        </Card>
        )}
      </div>
    </div>
  );
}
