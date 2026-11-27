// 语言切换器：Header 右上角 中/EN 切换（登录态同步写库 users.lang）
import { Segmented } from 'antd';
import { useTranslation } from 'react-i18next';
import { setLang } from '../i18n';
import { useAuth } from '../store/auth';
import { apiFetch } from '../core/api';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const cur = i18n.language?.toLowerCase().startsWith('en') ? 'en' : 'zh';
  const change = (v: 'zh' | 'en') => {
    setLang(v);
    // 登录态：异步写库（fire-and-forget；失败不影响本地体验，下次登录以库为准）
    if (user?.id) {
      apiFetch('/auth/lang', {
        method: 'PUT',
        body: JSON.stringify({ lang: v }),
      }).catch(() => { /* 静默：本地已生效 */ });
    }
  };
  return (
    <Segmented
      size="small"
      value={cur}
      options={[
        { label: '中', value: 'zh' },
        { label: 'EN', value: 'en' },
      ]}
      onChange={(v) => change(v as 'zh' | 'en')}
      style={{ marginRight: 8 }}
    />
  );
}
