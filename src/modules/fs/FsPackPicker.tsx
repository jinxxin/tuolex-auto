import { useMemo, useState } from 'react';
import { Modal, Tag, Button, Space, Typography, Alert, Empty } from 'antd';
import { DatabaseOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { db } from '../../core/db';
import { nextSeq } from '../../core/seq';
import { asilOfRaw } from '../../core/fs/asil';
import { ASIL_TAG_TEXT, ASIL_COLOR, type FsHazardTemplate } from '../../core/fs/data';
import { FS_PACKS } from '../../core/fs/fsPacks';
import type { FsAsil } from '../../core/types';

const { Text } = Typography;

const asilOfAny = (s?: string, e?: string, c?: string): FsAsil => {
  try { return s && e && c ? asilOfRaw(s, e, c) : 'QM'; } catch { return 'QM'; }
};

interface Props {
  /** 当前项目 id（导入落库目标） */
  pid: number | undefined;
  /** 项目已选产品域（预选包）；缺省默认 adas */
  preselect?: string | null;
  /** inline 形态（AI 降级嵌入，无外层 Modal） */
  inline?: boolean;
  /** Modal 形态控制 */
  open?: boolean;
  onClose?: () => void;
  /** 导入成功回调（宿主 message 上下文展示） */
  onImported?: (msg: string) => void;
}

/** 模板库：左侧行业包列表（可多选，项目域预选）+ 右侧条目勾选 → 导入草稿（srcPack 标注来源包） */
export default function FsPackPicker({ pid, preselect, inline = false, open = true, onClose, onImported }: Props) {
  const { t } = useTranslation();
  const [selPacks, setSelPacks] = useState<string[]>(
    preselect && FS_PACKS.some((p) => p.id === preselect) ? [preselect] : ['adas'],
  );
  const [selItems, setSelItems] = useState<string[]>([]);   // key = packId|title
  const [busy, setBusy] = useState(false);

  const activePacks = useMemo(() => FS_PACKS.filter((p) => selPacks.includes(p.id)), [selPacks]);
  const allCount = activePacks.reduce((s, p) => s + p.hazards.length, 0);
  const selCount = selItems.length;

  const togglePack = (id: string) => setSelPacks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleItem = (key: string) => setSelItems((p) => (p.includes(key) ? p.filter((x) => x !== key) : [...p, key]));

  const importSel = async () => {
    if (!pid || selItems.length === 0 || busy) return;
    setBusy(true);
    const created: string[] = [];
    try {
      const now = Date.now();
      for (const key of selItems) {
        const [packId, title] = key.split('|');
        const pack = FS_PACKS.find((p) => p.id === packId);
        const h = pack?.hazards.find((x) => x.title === title);
        if (!pack || !h) continue;
        const hazId = await nextSeq(pid, 'HAZ');
        await db.fs_hazards.add({
          projectId: pid, hazId, title: h.title, vehicleLevelHazard: h.vehicleLevelHazard,
          situation: h.situation, severity: h.severity, exposure: h.exposure, controllability: h.controllability,
          asil: asilOfAny(h.severity, h.exposure, h.controllability),
          asilManual: false, status: 'draft', rationale: h.rationale,
          srcPack: pack.id, version: 1, createdAt: now, updatedAt: now,
        }, t('haraPage.auditPack', { id: hazId }) + `（${pack.sysType}）`);
        created.push(hazId);
      }
      if (created.length) onImported?.(t('haraPage.aiAddedN', { n: created.length, ids: created.join(', ') }));
      setSelItems([]);
      onClose?.();
    } finally {
      setBusy(false);
    }
  };

  const packList = (
    <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid #f0f0f0', paddingRight: 8, maxHeight: 380, overflow: 'auto' }}>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>{t('tplLib.packs')}</Text>
      {FS_PACKS.map((p) => {
        const on = selPacks.includes(p.id);
        return (
          <div key={p.id} onClick={() => togglePack(p.id)} role="button" aria-pressed={on}
            style={{ padding: '6px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
              background: on ? '#e6f4ff' : undefined, border: on ? '1px solid #91caff' : '1px solid transparent' }}>
            <Space size={4} style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text strong style={{ fontSize: 13 }}>{p.sysType}</Text>
              <Tag style={{ marginRight: 0, fontSize: 11 }}>{p.hazards.length}</Tag>
            </Space>
            <Text type="secondary" style={{ fontSize: 11 }}>{p.desc}</Text>
          </div>
        );
      })}
    </div>
  );

  const items = (
    <div style={{ flex: 1, minWidth: 0, maxHeight: 380, overflow: 'auto' }}>
      {activePacks.length === 0 ? <Empty description={t('tplLib.noPack')} style={{ padding: '30px 0' }} /> : activePacks.map((p) => (
        <div key={p.id} style={{ marginBottom: 10 }}>
          <Space size={6} style={{ marginBottom: 4 }}>
            <DatabaseOutlined style={{ color: '#1b6ca8' }} />
            <Text strong>{p.sysType}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>{p.desc}</Text>
          </Space>
          {p.hazards.map((h: FsHazardTemplate) => {
            const key = `${p.id}|${h.title}`;
            const a = asilOfAny(h.severity, h.exposure, h.controllability);
            const on = selItems.includes(key);
            return (
              <div key={key} onClick={() => toggleItem(key)}
                style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', borderRadius: 6, marginBottom: 4, cursor: 'pointer',
                  border: on ? '1px solid #91caff' : '1px solid #f0f0f0', background: on ? '#f0f7ff' : undefined }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space size={4} wrap>
                    <Text strong style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{h.title}</Text>
                    <Tag color="orange" style={{ marginRight: 0, fontSize: 10 }}>{t('tplLib.srcNote')}</Tag>
                  </Space>
                  {h.vehicleLevelHazard && <div style={{ overflowWrap: 'anywhere' }}><Text type="secondary" style={{ fontSize: 12 }}>{h.vehicleLevelHazard}</Text></div>}
                  <div style={{ overflowWrap: 'anywhere' }}><Text type="secondary" style={{ fontSize: 12 }}>{h.situation}</Text></div>
                  <div style={{ overflowWrap: 'anywhere' }}><Text type="secondary" style={{ fontSize: 11 }}>{h.rationale}</Text></div>
                </div>
                <Space size={4} direction="vertical" align="end">
                  <Space size={2}><Tag style={{ fontSize: 11 }}>{h.severity}</Tag><Tag style={{ fontSize: 11 }}>{h.exposure}</Tag><Tag style={{ fontSize: 11 }}>{h.controllability}</Tag></Space>
                  <Tag color={ASIL_COLOR[a]} style={{ marginRight: 0 }}>{ASIL_TAG_TEXT[a]}</Tag>
                  <Button size="small" type={on ? 'primary' : 'default'} aria-label={`pack-item-${h.title}`}
                    onClick={(e) => { e.stopPropagation(); toggleItem(key); }}>
                    {on ? '✓' : '+'}
                  </Button>
                </Space>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  const body = (
    <>
      <Alert type="info" showIcon icon={<SafetyCertificateOutlined />} message={t('tplLib.sub')} style={{ marginBottom: 10 }} />
      <div style={{ display: 'flex', gap: 12, minHeight: 300 }}>
        {packList}
        {items}
      </div>
      <Space wrap style={{ marginTop: 8 }}>
        <Text type="secondary">{t('tplLib.sel', { n: selCount })}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{t('tplLib.hint')}</Text>
      </Space>
    </>
  );

  if (inline) {
    return (
      <>
        {body}
        <Space style={{ marginTop: 10 }}>
          <Button size="small" disabled={selCount === 0} onClick={() => setSelItems([])}>{t('tplLib.clear')}</Button>
          <Button size="small" type="primary" loading={busy} disabled={selCount === 0 || !pid} onClick={importSel}>
            {t('haraPage.aiImport', { n: selCount })}
          </Button>
        </Space>
      </>
    );
  }

  return (
    <Modal open={open} title={t('tplLib.title')} onCancel={onClose} width={840}
      footer={[
        <Space key="f" wrap>
          <Text type="secondary">{t('tplLib.sel', { n: selCount })} / {allCount}</Text>
          <Button disabled={selCount === 0} onClick={() => setSelItems([])}>{t('tplLib.clear')}</Button>
          <Button type="primary" disabled={selCount === 0 || !pid} loading={busy} onClick={importSel}>
            {t('haraPage.aiImport', { n: selCount })}
          </Button>
        </Space>,
      ]}>
      {body}
    </Modal>
  );
}
