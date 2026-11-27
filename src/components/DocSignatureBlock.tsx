import { useEffect, useState } from 'react';
import { Typography, Tag } from 'antd';
import { SafetyCertificateOutlined, CheckCircleFilled, CloseCircleFilled, LockFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { docSignatureItems, type DocSignatureItem } from '../core/docSign';
import type { DocRecord } from '../core/types';

const { Text, Title } = Typography;

// 文档签署记录块：签名人 / 含义 / 时间 / 哈希 / 有效性（Part 11 哈希绑定校验）
// 用于：编辑器预览页、PDF/Word 导出根节点
export default function DocSignatureBlock({ doc, items: itemsProp }: { doc: DocRecord; items?: DocSignatureItem[] | null }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<DocSignatureItem[] | null>(null);
  const sigIds = doc.signatureIds || [];

  useEffect(() => {
    if (itemsProp) { setItems(itemsProp); return; }
    let alive = true;
    setItems(null);
    (async () => {
      const it = await docSignatureItems(doc);
      if (alive) setItems(it);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, doc.version, sigIds.join(','), itemsProp]);

  const approved = doc.status === 'approved';
  const anyInvalid = (items || []).some((s) => !s.valid);

  return (
    <div style={{ marginTop: 36, pageBreakBefore: 'always' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <SafetyCertificateOutlined style={{ color: '#1b6ca8', fontSize: 16 }} />
        <Title level={4} style={{ margin: 0, color: '#0b2545' }}>{t('signBlock.title')}</Title>
        {approved && <Tag color="green" icon={<LockFilled />}>{t('signBlock.approvedTag')}</Tag>}
        {!approved && items && items.length > 0 && <Tag color="gold">{t('signBlock.signingTag')}</Tag>}
      </div>

      {approved && !anyInvalid && (
        <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', color: '#237804', padding: '8px 14px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          <CheckCircleFilled /> {t('signBlock.approvedNote', { v: doc.version })}
        </div>
      )}
      {anyInvalid && (
        <div style={{ background: '#fff1f0', border: '1px solid #ffa39e', color: '#a8071a', padding: '8px 14px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          <CloseCircleFilled /> {t('signBlock.invalidNote')}
        </div>
      )}

      {items === null ? (
        <Text type="secondary" style={{ fontSize: 13 }}>{t('signBlock.loading')}</Text>
      ) : items.length === 0 ? (
        <div style={{ border: '1px dashed #d9d9d9', borderRadius: 6, padding: '10px 14px' }}>
          <Text type="secondary" style={{ fontSize: 13 }}>{t('signBlock.empty')}</Text>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f0f5fa' }}>
              {['signCenter.signer', 'signBlock.colMeaning', 'signBlock.colTime', 'signCenter.status', 'signBlock.colHash'].map((hk) => (
                <th key={hk} style={{ border: '1px solid #d9d9d9', padding: '6px 10px', textAlign: 'left' }}>{t(hk)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px' }}>
                  <Text strong>{s.signerName}</Text>
                  <div><Text type="secondary" style={{ fontSize: 12 }}>{s.username}</Text></div>
                </td>
                <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px' }}>{s.meaning}</td>
                <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px' }}>{dayjs(s.signedAt).format('YYYY-MM-DD HH:mm')}</td>
                <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px' }}>
                  {s.valid
                    ? <Tag color="green" icon={<CheckCircleFilled />}>{t('signCenter.statusValid')}</Tag>
                    : <Tag color="red" icon={<CloseCircleFilled />}>{t('signBlock.invalid')}</Tag>}
                  {!s.valid && s.reason && <div style={{ fontSize: 12, color: '#a8071a', marginTop: 2 }}>{s.reason}</div>}
                </td>
                <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px', fontFamily: 'monospace', fontSize: 12 }}>
                  {s.docHash.slice(0, 16)}…
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
