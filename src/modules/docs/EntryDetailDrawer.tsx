import { useEffect, useState } from 'react';
import { Drawer, Descriptions, Tag, Typography, Empty, List, Space, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowRightOutlined, ArrowLeftOutlined, ExportOutlined } from '@ant-design/icons';
import { ENTRY_DEFS, ENTRY_TRACE, entryTraceLinks, type EntrySnap, type TraceHit } from '../../core/docEntries';

const { Text } = Typography;

const REL_LABEL: Record<string, string> = {
  verifies: '验证覆盖', '验证覆盖': '验证覆盖', 'derives-from': '来源于', '转化为': '来源于', '分配': '来源于',
  mitigates: '降低风险', '风险缓解': '降低风险', implements: '由设计实现', satisfies: '满足输入',
  'part-of': '隶属', 'contributes-to': '贡献主机风险', 'has-residual': '残余风险', 'maps-to': '条款映射', 'evidenced-by': '证据落点',
};

// 条目详情抽屉（家族规范 §9，全局最高优先级）；与 EasyMD 对齐：类型/编号/标题/版本/摘要/字段 + 追溯关系（解析编号名称）+ 在系统中打开
export default function EntryDetailDrawer({ snap, open, onClose }: { snap: EntrySnap; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [hits, setHits] = useState<TraceHit[] | null>(null);

  useEffect(() => {
    let alive = true;
    if (!open || !snap) { setHits(null); return; }
    entryTraceLinks(snap.type, snap.id).then((h) => { if (alive) setHits(h); });
    return () => { alive = false; };
  }, [open, snap?.type, snap?.id]);

  const def = snap ? ENTRY_DEFS[snap.type] : null;
  return (
    <Drawer open={open} onClose={onClose} width={480} title={snap ? t('docEntry.title', { code: snap.code }) : ''}>
      {snap && def && (
        <div>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('docEntry.type')}>{def.icon} {def.label}</Descriptions.Item>
            <Descriptions.Item label={t('docEntry.code')}>{snap.code}</Descriptions.Item>
            <Descriptions.Item label={t('docEntry.titleLabel')}>{snap.title}</Descriptions.Item>
            {snap.version != null && <Descriptions.Item label={t('docEntry.version')}><Tag color="cyan">v{snap.version}</Tag></Descriptions.Item>}
            {snap.meta && <Descriptions.Item label={t('docEntry.meta')}>{snap.meta}</Descriptions.Item>}
            {Object.keys(snap.fieldLabels).length > 0
              ? Object.keys(snap.fieldLabels).map((k) => (<Descriptions.Item key={k} label={snap.fieldLabels[k]}><span style={{ whiteSpace: 'pre-wrap' }}>{snap.fields[k]}</span></Descriptions.Item>))
              : <Descriptions.Item label={t('docEntry.descLabel')}><span style={{ whiteSpace: 'pre-wrap' }}>{snap.desc}</span></Descriptions.Item>}
          </Descriptions>

          <div style={{ marginTop: 20, marginBottom: 6, fontWeight: 600 }}>{t('docEntry.trace')}</div>
          {hits === null ? <Text type="secondary">{t('docEntry.loading')}</Text> : hits.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docEntry.noTrace')} /> : (
            <List size="small" dataSource={hits} renderItem={(h) => (
              <List.Item>
                <Space size={6}>
                  <Tag color={h.dir === 'out' ? 'blue' : 'green'}>{h.dir === 'out' ? <ArrowRightOutlined /> : <ArrowLeftOutlined />} {h.dir === 'out' ? t('docEntry.out') : t('docEntry.in')}</Tag>
                  <Tag>{REL_LABEL[h.relType] || h.relType}</Tag>
                  <Text>{h.label}</Text>
                </Space>
              </List.Item>
            )} />
          )}

          <div style={{ marginTop: 24 }}>
            <Button icon={<ExportOutlined />} onClick={() => { nav(`${ENTRY_TRACE[snap.type].route}?focus=${snap.type}:${snap.id}`); onClose(); }}>{t('docEntry.openInSystem')}</Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
