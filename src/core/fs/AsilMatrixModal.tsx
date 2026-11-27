import { Modal, Table, Tag, Alert, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { ASIL_TAG_TEXT, ASIL_COLOR } from './data';
import { ASIL_MATRIX_ROWS } from './haraReport';
import type { FsAsil } from '../types';

const { Text } = Typography;

// ASIL 判定表只读对照（评审/演示透明；ISO 26262-3:2018 Table 4）
export function AsilMatrixModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const tag = (a: FsAsil) => <Tag color={ASIL_COLOR[a]} style={{ marginRight: 0, minWidth: 40, textAlign: 'center' }}>{ASIL_TAG_TEXT[a]}</Tag>;
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={560} title={t('haraPage.ref')}>
      <Alert type="info" showIcon message={t('haraPage.noteA')} style={{ marginBottom: 12 }} />
      <Table
        size="small" rowKey={(r) => `${r.s}${r.e}`} pagination={false} bordered
        dataSource={ASIL_MATRIX_ROWS}
        columns={[
          { title: 'S', dataIndex: 's', width: 50, render: (v) => <Text strong>{v}</Text> },
          { title: 'E', dataIndex: 'e', width: 50 },
          { title: 'C1', dataIndex: 'c1', width: 120, render: tag },
          { title: 'C2', dataIndex: 'c2', width: 120, render: tag },
          { title: 'C3', dataIndex: 'c3', width: 120, render: tag },
        ]}
      />
    </Modal>
  );
}
