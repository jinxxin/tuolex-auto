import { Card, Empty, Tag, Typography, Space, Alert, Button } from 'antd';
import { SafetyOutlined, RocketOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';

const { Title, Paragraph } = Typography;

export interface FsMilestoneState {
  milestone: string;       // 如 'M1'
  done: string[];          // 已完成能力（Tag 展示）
  next?: string;           // 下一步（英文保持简短，走 i18n 或原文）
}

// EasyFuSa 占位页骨架：里程碑状态 + 功能安全项目引导（M1 起逐页替换为真实页面）
export default function FsPlaceholder({ milestone, done, next, moduleKey }: FsMilestoneState & { moduleKey: string }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const fsProjectCount = useLiveQuery(() => db.projects.where('fsEnabled').equals(true).count(), []) ?? 0;

  return (
    <Card>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space align="center">
          <SafetyOutlined style={{ fontSize: 20, color: '#1b6ca8' }} />
          <Title level={4} style={{ margin: 0 }}>{t(`menu.${moduleKey}`)}</Title>
          <Tag color="purple">{t('fs.brandEn')}</Tag>
        </Space>

        {fsProjectCount === 0 ? (
          <Alert
            type="info" showIcon
            message={t('fs.noProject')}
            action={<Button size="small" type="primary" icon={<RocketOutlined />} onClick={() => nav('/projects')}>{t('fs.goEnable')}</Button>}
          />
        ) : (
          <Alert type="success" showIcon message={t('fs.selectProject')} />
        )}

        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Space direction="vertical" size={8}>
              <Title level={5} style={{ margin: 0 }}>{t('fs.building', { ms: milestone })}</Title>
              <Paragraph type="secondary" style={{ margin: 0 }}>{t('fs.placeholderModule', { module: t(`menu.${moduleKey}`) })}</Paragraph>
              <Space wrap>
                {done.map((d) => <Tag color="green" key={d}>✔ {d}</Tag>)}
                {next && <Tag color="gold">→ {next}</Tag>}
              </Space>
            </Space>
          }
        />
      </Space>
    </Card>
  );
}
