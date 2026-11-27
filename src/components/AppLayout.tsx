import { useEffect, useMemo, useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Space, Typography, Badge, Tag, Modal, Form, Input, message, Drawer, Button, Select, type MenuProps } from 'antd';
import {
  DashboardOutlined, FolderOpenOutlined, NodeIndexOutlined,
  AuditOutlined, FileTextOutlined, TeamOutlined, LogoutOutlined, SafetyCertificateOutlined,
  AppstoreOutlined, FileWordOutlined, KeyOutlined, CommentOutlined,
  ProfileOutlined, MenuOutlined, BranchesOutlined, ExperimentOutlined,
  ScheduleOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/auth';
import { useLiveQuery, apiFetch } from '../core/api';
import { db } from '../core/db';
import { verifyChain } from '../core/audit';
import { BRAND } from '../brand';
import LanguageSwitcher from './LanguageSwitcher';
import { useProjectStore } from '../store/project';

const { Header, Content } = Layout;
const { Text } = Typography;

export default function AppLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  // 兜底：任何情况下停在根路由（如登录回跳 next="/"）都进工作台，避免空白页
  useEffect(() => { if (loc.pathname === '/') nav('/dashboard', { replace: true }); }, [loc.pathname, nav]);
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  // 移动端适配：<lg 用抽屉菜单（顶栏菜单改为横向后自行监听宽度）
  const [isMobile, setIsMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 991px)');
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // 修改密码弹窗（三段式：旧密码校验 + 两次新密码确认）
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdForm] = Form.useForm();

  const submitChangePassword = async () => {
    const v = await pwdForm.validateFields();
    setPwdSaving(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword: v.oldPassword, newPassword: v.newPassword }),
      });
      msg.success(t('pwd.success'));
      setPwdOpen(false);
      pwdForm.resetFields();
    } catch (e) {
      msg.error((e as Error).message);
    } finally {
      setPwdSaving(false);
    }
  };
  const chainOk = useLiveQuery(async () => (await verifyChain()).ok, []);
  const pendingSigns = useLiveQuery(() => db.vdocs.where('status').equals('in_review').count(), []);
  // 全局当前项目（顶栏统一入口；IA 一致）
  const projectId = useProjectStore((s) => s.projectId) ?? undefined;
  const setProjectId = useProjectStore((s) => s.setProjectId);
  const projects = useLiveQuery(() => db.projects.orderBy('id').toArray(), []) ?? [];
  useEffect(() => { if (!projectId && projects.length) setProjectId(projects[0].id ?? null); }, [projectId, projects, setProjectId]);

  const items = useMemo<NonNullable<MenuProps['items']>>(() => [
    { key: '/dashboard', icon: <DashboardOutlined />, label: t('menu.dashboard') },
    {
      key: 'grp-project', icon: <FolderOpenOutlined />, label: t('menu.grpProject'),
      children: [,,,,,
        { key: '/projects', label: t('menu.projects') },
        { key: '/workitems', icon: <ProfileOutlined />, label: t('menu.workitems') },
      ],
    },
    {
      key: 'grp-process', icon: <ExperimentOutlined />, label: t('menu.grpProcess'),
      children: [
        { key: '/process', icon: <ExperimentOutlined />, label: t('menu.process') },
        { key: '/process/ventry', icon: <ProfileOutlined />, label: t('menu.processVentry') },
        { key: '/process/assess', icon: <SafetyCertificateOutlined />, label: t('menu.processAssess') },
        { key: '/process/wp', icon: <FileTextOutlined />, label: t('menu.processWp') },
        { key: '/process/vmodel', icon: <ScheduleOutlined />, label: t('menu.processVmodel') },
        { key: '/process/trace', icon: <BranchesOutlined />, label: t('menu.processTrace') },
        { key: '/trace-report', icon: <SafetyCertificateOutlined />, label: t('menu.traceReport') },
      ],
    },
    {
      key: 'grp-fs', icon: <SafetyCertificateOutlined />, label: '功能安全',
      children: [
        { key: '/fs/overview', icon: <ExperimentOutlined />, label: '功能安全总览' },
        { key: '/fs/hara', icon: <NodeIndexOutlined />, label: 'HARA' },
        { key: '/fs/safety-chain', icon: <BranchesOutlined />, label: '安全需求链' },
        { key: '/fs/analysis', icon: <AppstoreOutlined />, label: 'FMEDA / FTA / DFA' },
        { key: '/fs/safety-case', icon: <FileTextOutlined />, label: 'Safety Case' },
        { key: '/fs/confirm', icon: <SafetyCertificateOutlined />, label: '确认措施' },
        { key: '/fs/plan', icon: <ScheduleOutlined />, label: '安全计划' },
      ],
    },
    {
      key: 'grp-quality', icon: <SafetyCertificateOutlined />, label: t('menu.grpQuality'),
      children: [,
        { key: '/quality', icon: <NodeIndexOutlined />, label: t('menu.quality') },
        { key: '/fmea', icon: <AppstoreOutlined />, label: t('menu.fmea') },,,
      ],
    },
    { key: '/docs', icon: <FileWordOutlined />, label: t('menu.docs') },
    {
      key: 'grp-tools', icon: <AuditOutlined />, label: t('menu.grpTools'),
      children: [
        { key: '/signatures', icon: <SafetyCertificateOutlined />, label: t('menu.signatures'), badge: pendingSigns || 0 },
        { key: '/audit', icon: <AuditOutlined />, label: t('menu.audit'), dot: chainOk === false },
        { key: '/export', icon: <FileTextOutlined />, label: t('menu.export') },
        { key: '/users', icon: <TeamOutlined />, label: t('menu.users') },
      ],
    },
    { type: 'divider' },
    { key: '/feedback', icon: <CommentOutlined style={{ color: '#fa8c16' }} />, label: <span style={{ color: '#fa8c16' }}>{t('menu.feedback')}</span> },
  ], [pendingSigns, chainOk, t, user?.role]);

  // 选中键：按路径最长前缀匹配菜单叶子（支持「过程组」等二级/三级菜单正确高亮）
  const flatPaths = useMemo(() => {
    const out: string[] = [];
    const walk = (arr: unknown[]) => {
      for (const it of arr || []) {
        const node = it as { key?: unknown; children?: unknown[] };
        if (typeof node?.key === 'string' && node.key.startsWith('/')) out.push(node.key);
        if (Array.isArray(node?.children)) walk(node.children as unknown[]);
      }
    };
    walk(items as unknown[]);
    return out;
  }, [items]);
  const selected = useMemo(() => {
    if (loc.pathname === '/') return '/dashboard';
    let best = '';
    for (const k of flatPaths) if ((loc.pathname === k || loc.pathname.startsWith(k + '/')) && k.length > best.length) best = k;
    return best || '/' + (loc.pathname.split('/')[1] || 'dashboard');
  }, [loc.pathname, flatPaths]);

  // 菜单点击：抽屉模式跳转后自动关闭
  const onMenuClick = ({ key }: { key: string }) => {
    nav(key);
    setDrawerOpen(false);
  };

  // 抽屉内竖排菜单项（装饰 badge/dot）
  const decoratedItems = useMemo(() => {
    const decorate = (item: any): any => {
      if (item.type === 'divider') return item;
      const { badge, dot, children, ...rest } = item;
      const out: any = { ...rest };
      if (children) out.children = children.map(decorate);
      out.label = badge ? <Space size={6}>{item.label}<Badge count={badge} size="small" overflowCount={99} /></Space> : item.label;
      if (dot) out.icon = <Badge status="processing" />;
      return out;
    };
    return (items as any[]).map(decorate);
  }, [items]);

  // 顶栏：一级横排；分组用多列 mega 下拉（子项 >6 时两列）
  const topItems = useMemo(() => (items as any[]).filter((it) => it.type !== 'divider'), [items]);
  const selectedGroupKey = useMemo(
    () => topItems.find((it: any) => it.children?.some((c: any) => c.key === selected))?.key ?? null,
    [topItems, selected],
  );
  const navItemStyle = (active: boolean) => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 8px', borderRadius: 8,
    cursor: 'pointer', fontSize: 13.5, whiteSpace: 'nowrap' as const, flex: 'none' as const,
    color: active ? '#fff' : '#cfe3f5', fontWeight: active ? 700 : 400,
    background: active ? 'rgba(255,255,255,.18)' : 'transparent',
  });
  const topNav = (
    <nav className="ez-nav" style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
      {topItems.map((it: any) => it.children ? (
        <Dropdown
          key={it.key}
          trigger={['hover']}
          placement="bottomLeft"
          menu={{ items: [] }}
          popupRender={() => (
            <div style={{
              background: '#0b2545', borderRadius: 10, padding: 8,
              boxShadow: '0 14px 34px rgba(0,0,0,.30)', display: 'grid',
              gridTemplateColumns: it.children.length > 6 ? '1fr 1fr' : '1fr',
              gap: 2, minWidth: it.children.length > 6 ? 440 : 210,
            }}>
              {it.children.map((c: any) => (
                <div key={c.key}
                  onClick={() => onMenuClick({ key: c.key })}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#dbeaf6', whiteSpace: 'nowrap' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.10)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                  {c.icon && <span style={{ opacity: .9, fontSize: 14 }}>{c.icon}</span>}
                  <span>{c.label}</span>
                  {c.badge ? <Badge count={c.badge} size="small" overflowCount={99} /> : null}
                </div>
              ))}
            </div>
          )}
        >
          <span style={navItemStyle(selectedGroupKey === it.key)}>
            <span>{it.label}</span><span style={{ fontSize: 9, opacity: .75 }}>▾</span>
          </span>
        </Dropdown>
      ) : (
        <span key={it.key} onClick={() => onMenuClick({ key: it.key })} style={navItemStyle(selected === it.key)}>
          <span>{it.label}</span>
        </span>
      ))}
    </nav>
  );

  const menuNode = (
    <Menu
      theme="dark" mode="inline" selectedKeys={[selected]}
      style={{ background: 'transparent', borderInlineEnd: 'none' }}
      items={decoratedItems}
      onClick={onMenuClick}
    />
  );

  const brandNode = (
    <div style={{ height: 56, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px 0 2px', flex: 'none' }}>
      <SafetyCertificateOutlined style={{ fontSize: 22, color: '#7fd1ff' }} />
      <span style={{ color: '#fff', fontSize: 17, fontWeight: 700, letterSpacing: 1 }}>{BRAND.app.auto}</span>
    </div>
  );
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <style>{`.ez-nav::-webkit-scrollbar{display:none}`}</style>
      <Header style={{ background: '#0b2545', padding: '0 12px', display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 10, height: 56, lineHeight: '56px', boxShadow: '0 1px 4px rgba(0,0,0,.12)' }}>
        {isMobile ? (
          <Button type="text" icon={<MenuOutlined style={{ fontSize: 18, color: '#fff' }} />}
            onClick={() => setDrawerOpen(true)} style={{ marginLeft: -4 }} aria-label={t('layout.openMenu')} />
        ) : brandNode}
        {!isMobile && topNav}
        {isMobile && <div style={{ flex: 1 }} />}
        {chainOk === false && <Tag color="error" style={{ marginInlineEnd: 0, flex: 'none' }}>{t('layout.chainFail')}</Tag>}
        <Select
          size="small" showSearch optionFilterProp="label" style={{ width: isMobile ? 120 : 190, flex: 'none' }}
          placeholder={t('layout.selectProject')}
          value={projectId ?? undefined}
          onChange={(v: number) => setProjectId(v)}
          options={projects.map((p) => ({ value: p.id!, label: p.name }))}
        />
        <div style={{ flex: 'none' }}><LanguageSwitcher /></div>
        <Dropdown trigger={['click']} menu={{
          items: [
            { key: 'role', label: t('layout.roleLabel', { role: t(`role.${user?.role || 'viewer'}`) }), disabled: true },
            { type: 'divider' },
            { key: 'password', icon: <KeyOutlined />, label: t('layout.changePassword'), onClick: () => { pwdForm.resetFields(); setPwdOpen(true); } },
            { key: 'logout', icon: <LogoutOutlined />, label: t('layout.logout'), onClick: logout },
          ],
        }}>
          <Space style={{ cursor: 'pointer', flex: 'none' }}>
            <Avatar style={{ background: '#1b6ca8' }}>{user?.name?.[0]}</Avatar>
            {!isMobile && <Text style={{ color: '#fff' }}>{user?.name}</Text>}
          </Space>
        </Dropdown>
      </Header>
      <Content style={{ margin: isMobile ? 8 : 16 }}>
        <Outlet />
      </Content>
      {/* 移动端抽屉菜单 */}
      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={262}
        closable={false}
        styles={{ body: { padding: 0, background: '#0b2545' } }}
      >
        {brandNode}
        {menuNode}
      </Drawer>
      {msgCtx}
      {/* 修改密码：先验证旧密码，再输入两次新密码确认 */}
      <Modal
        title={t('pwd.title')}
        open={pwdOpen}
        onOk={submitChangePassword}
        onCancel={() => setPwdOpen(false)}
        confirmLoading={pwdSaving}
        okText={t('pwd.okText')}
        cancelText={t('common.cancel')}
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="oldPassword"
            label={t('pwd.old')}
            rules={[{ required: true, message: t('pwd.oldRequired') }]}
          >
            <Input.Password placeholder={t('pwd.oldPlaceholder')} autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label={t('pwd.new')}
            rules={[
              { required: true, message: t('pwd.newRequired') },
              { min: 6, message: t('pwd.newMin') },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || getFieldValue('oldPassword') !== value
                    ? Promise.resolve()
                    : Promise.reject(new Error(t('pwd.newSameAsOld'))),
              }),
            ]}
          >
            <Input.Password placeholder={t('pwd.newPlaceholder')} autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={t('pwd.confirm')}
            dependencies={['newPassword']}
            rules={[
              { required: true, message: t('pwd.confirmRequired') },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || getFieldValue('newPassword') === value
                    ? Promise.resolve()
                    : Promise.reject(new Error(t('pwd.mismatch'))),
              }),
            ]}
          >
            <Input.Password placeholder={t('pwd.confirmPlaceholder')} autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
