import { Card, Col, Row, Statistic, List, Tag, Typography, Space, Alert, Button } from 'antd';
import {
  FolderOpenOutlined, AuditOutlined, SafetyCertificateOutlined,
  NodeIndexOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { verifyChain } from '../../core/audit';
import { useAuth } from '../../store/auth';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { VDoc } from '../../core/types';

const { Text, Paragraph } = Typography;


// 状态标签显示（内置枚举 → 随语言切换；非枚举值原样显示）
export function projectStatusLabel(status: string | undefined, t: (k: string) => string): string {
  const key = status || '';
  const known = ['init', 'validation', 'qualified', 'retired', 'archived'];
  return known.includes(key) ? t('proj.status.' + key) : (status || '');
}

export default function DashboardPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { t, i18n } = useTranslation();
  const dateFmt = i18n.language?.toLowerCase().startsWith('en') ? 'dddd, MMMM D, YYYY' : 'YYYY年MM月DD日 dddd';
  const stats = useLiveQuery(async () => {
    const [projects, ccs, logs, signs, vdocReview] = await Promise.all([
      db.projects.count(), db.change_controls.count(), db.audit_logs.count(),
      db.signatures.count(), db.vdocs.where('status').equals('in_review').count(),
    ]);
    return { projects, ccs, logs, signs, vdocReview };
  }, []);

  const chain = useLiveQuery(() => verifyChain(), []);

  const pendingList = useLiveQuery(async () => {
    const docs = await db.vdocs.where('status').equals('in_review').toArray();
    return { docs: docs as VDoc[] };
  }, []);

  const recentLogs = useLiveQuery(() => db.audit_logs.orderBy('id').reverse().limit(8).toArray(), []);

  // 最近项目（按更新时间倒序取 4 个）
  const recentProjects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().limit(4).toArray(), []) ?? [];

  const cards = [
    { title: t('dash.cProjects'), value: stats?.projects ?? 0, icon: <FolderOpenOutlined />, color: '#2f9e44', to: '/projects' },
    { title: t('dash.cChanges'), value: stats?.ccs ?? 0, icon: <NodeIndexOutlined />, color: '#7048e8', to: '/quality' },
    { title: t('dash.cSigns'), value: stats?.signs ?? 0, icon: <SafetyCertificateOutlined />, color: '#0ca678', to: '/signatures' },
    { title: t('dash.cLogs'), value: stats?.logs ?? 0, icon: <AuditOutlined />, color: '#e8590c', to: '/audit' },
  ];

  return (
    <div>
      <Paragraph style={{ fontSize: 16, marginBottom: 16 }}>
        {t('dash.hello', { name: user?.name, date: dayjs().format(dateFmt) })}
      </Paragraph>

      {chain && !chain.ok && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }}
          message={t('dash.chainBroken', { id: chain.brokenAt })}
        />
      )}

      <Row gutter={[16, 16]}>
        {cards.map((c) => (
          <Col xs={12} md={8} xl={4} key={c.title}>
            <Card hoverable onClick={() => nav(c.to)} size="small" styles={{ body: { padding: 16 } }}>
              <Statistic
                title={<Space>{c.icon}<span style={{ color: c.color }}>{c.title}</span></Space>}
                value={c.value}
                valueStyle={{ fontSize: 26, fontWeight: 700 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* 最近项目 + 核心功能快捷入口（B 方案） */}
      {recentProjects.length > 0 && (
        <Card style={{ marginTop: 16 }} size="small" title={t('dash.recentProjects')} extra={<Button type="link" size="small" onClick={() => nav('/projects')}>{t('dash.allProjects')} <ArrowRightOutlined /></Button>}>
          <Row gutter={[16, 16]}>
            {recentProjects.map((p) => (
              <Col xs={24} md={12} xl={6} key={p.id}>
                <Card size="small" hoverable onClick={() => nav(`/projects/${p.id}?tab=ventry`)} style={{ height: '100%' }}>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space>
                      <FolderOpenOutlined style={{ color: '#2f9e44' }} />
                      <Text strong ellipsis style={{ maxWidth: 180 }}>{p.name}</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>{p.sysType} · {projectStatusLabel(p.status, t)}</Text>
                    <Space wrap size={[4, 4]} style={{ marginTop: 4 }}>
                      <Tag color="blue" style={{ cursor: 'pointer', margin: 0 }} onClick={(e) => { e.stopPropagation(); nav(`/projects/${p.id}?tab=ventry`); }}>{t('dash.tagVentry')}</Tag>
                      <Tag color="geekblue" style={{ cursor: 'pointer', margin: 0 }} onClick={(e) => { e.stopPropagation(); nav(`/projects/${p.id}?tab=process`); }}>{t('dash.tagProcess')}</Tag>
                      <Tag color="purple" style={{ cursor: 'pointer', margin: 0 }} onClick={(e) => { e.stopPropagation(); nav(`/projects/${p.id}?tab=assess`); }}>{t('dash.tagAssess')}</Tag>
                      <Tag color="green" style={{ cursor: 'pointer', margin: 0 }} onClick={(e) => { e.stopPropagation(); nav(`/projects/${p.id}?tab=audit2`); }}>{t('dash.tagAudit')}</Tag>
                    </Space>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          <Card title={t('dash.todo')} size="small">
            {pendingList && pendingList.docs.length === 0 && (
              <Text type="secondary">{t('dash.none')}</Text>
            )}
            <List
              size="small"
              dataSource={[
                ...(pendingList?.docs.map((d) => ({ key: `d${d.id}`, kind: '文档', title: d.title, tag: <Tag color="cyan">{d.docType}</Tag> })) ?? []),
              ]}
              renderItem={(it) => (
                <List.Item>
                  <Space>
                    <SafetyCertificateOutlined style={{ color: '#1b6ca8' }} />
                    {it.tag}
                    <Text ellipsis style={{ maxWidth: 260 }}>{it.title}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title={t('dash.recentLogs')} size="small">
            <List
              size="small"
              dataSource={recentLogs ?? []}
              renderItem={(l) => (
                <List.Item>
                  <Space direction="vertical" size={0} style={{ width: '100%' }}>
                    <Space>
                      <Tag color="blue">{l.action}</Tag>
                      <Text strong>{l.username}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(l.ts).format('MM-DD HH:mm:ss')}</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>{l.summary}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
