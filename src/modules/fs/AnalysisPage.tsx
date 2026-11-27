import { useMemo, useState } from 'react';
import { fsPidFromUrl } from './projectLink';
import { Card, Tabs, Tag, Space, Typography, Select, Alert, Row, Col } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import FmedaTab from './FmedaTab';
import FtaTab from './FtaTab';
import DfaTab from './DfaTab';

const { Title, Text } = Typography;

// M3 安全分析页（FMEDA / FTA / DFA 三 Tab）
export default function AnalysisPage() {
  const { t } = useTranslation();
  const [activePid, setActivePid] = useState<number | undefined>(undefined);
  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? [];
  const fsProjects = useMemo(() => projects.filter((p) => p.fsEnabled), [projects]);
  const pid = fsPidFromUrl(fsProjects.map((p) => p.id!), activePid);
  
  return (
    <Card>
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space align="center">
              <ExperimentOutlined style={{ fontSize: 20, color: '#1b6ca8' }} />
              <Title level={4} style={{ margin: 0 }}>{t('analysisPage.title')}</Title>
              <Tag color="purple">ISO 26262:2018</Tag>
            </Space>
            <div><Text type="secondary">{t('analysisPage.sub')}</Text></div>
          </Col>
          <Col>
            {fsProjects.length > 0 ? (
              <Select style={{ width: 260 }} value={pid} placeholder={t('fs.selectProject')} onChange={(v) => setActivePid(v)}
                options={fsProjects.map((p) => ({ value: p.id!, label: p.name }))} />
            ) : <Alert type="warning" showIcon message={t('fs.noProject')} />}
          </Col>
        </Row>
        {pid != null && (
          <Tabs
            defaultActiveKey="fmeda" destroyOnHidden={false}
            items={[
              { key: 'fmeda', label: t('analysisPage.tabsFmeda'), children: <FmedaTab pid={pid} /> },
              { key: 'fta', label: t('analysisPage.tabsFta'), children: <FtaTab pid={pid} /> },
              { key: 'dfa', label: t('analysisPage.tabsDfa'), children: <DfaTab pid={pid} /> },
            ]}
          />
        )}
      </Space>
    </Card>
  );
}
