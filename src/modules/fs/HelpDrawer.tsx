import { useMemo } from 'react';
import { Drawer, Tag, Space, Alert } from 'antd';
import { BookOutlined } from '@ant-design/icons';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';
import guideMd from '../../content/fsGuide.md?raw';

// EasyFuSa 平台内嵌使用指南（内容源 = docs/EasyFuSa-使用指南.md，构建期复制到 src/content）
// 目录自动解析 md 的 # / ## 标题；点击目录滚动定位。
export default function HelpDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const en = i18n.language?.startsWith('en');
  const html = useMemo(() => marked.parse(guideMd) as string, []);
  const toc = useMemo(() => {
    const out: { level: number; text: string }[] = [];
    for (const line of guideMd.split('\n')) {
      const m = /^(#{1,2})\s+(.*)$/.exec(line.trim());
      if (m) out.push({ level: m[1].length, text: m[2].replace(/\*\*/g, '').trim() });
    }
    return out;
  }, []);

  const jump = (idx: number) => {
    const h2s = document.querySelectorAll('.fs-guide h1, .fs-guide h2');
    const el = h2s[idx];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Drawer open={open} onClose={onClose} width={860} title={<Space><BookOutlined /> {t('fsHelp.title')} <Tag color="purple">EasyFuSa Guide</Tag></Space>} destroyOnClose>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {en && <Alert type="info" showIcon message={t('fsHelp.enNote')} />}
        <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 120px)' }}>
          {/* 目录 */}
          <div style={{ width: 190, flexShrink: 0, overflow: 'auto', borderRight: '1px solid #f0f0f0', paddingRight: 10 }}>
            {toc.map((s, i) => (
              <div key={i} onClick={() => jump(i)} style={{
                padding: '4px 8px', cursor: 'pointer', fontSize: s.level === 1 ? 13 : 12,
                fontWeight: s.level === 1 ? 600 : 400, color: s.level === 1 ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.65)',
                marginLeft: s.level === 2 ? 8 : 0, borderRadius: 4,
              }} onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
                 onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                {s.text}
              </div>
            ))}
          </div>
          {/* 正文 */}
          <div className="fs-guide" style={{ flex: 1, overflow: 'auto', fontSize: 14, lineHeight: 1.75 }}
            dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </Space>
    </Drawer>
  );
}
