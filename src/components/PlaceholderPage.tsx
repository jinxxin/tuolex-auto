import { Card, Empty, Typography, Space, Button, Alert, Tag } from 'antd';
import { RocketOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const { Title, Paragraph } = Typography;

interface Props {
  module: string;
  planned: string[];
}

// 未开发模块占位页：保持导航完整，后续迭代填充
export default function PlaceholderPage({ module, planned }: Props) {
  const nav = useNavigate();
  const { t } = useTranslation();
  return (
    <Card>
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Space direction="vertical" size={8}>
            <Title level={4} style={{ margin: 0 }}>{t('placeholder.title', { module })}</Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              {t('placeholder.intro')}
            </Paragraph>
            <Space wrap>
              {planned.map((p) => <Tag color="blue" key={p}>{p}</Tag>)}
            </Space>
          </Space>
        }
      >
        <Button type="primary" icon={<RocketOutlined />} onClick={() => nav('/dashboard')}>{t('placeholder.back')}</Button>
      </Empty>
    </Card>
  );
}

export function NoteBanner({ children }: { children: React.ReactNode }) {
  return <Alert type="info" showIcon style={{ marginBottom: 16 }} message={children} />;
}
