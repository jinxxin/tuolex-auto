import { Component } from 'react';
import { Alert, Button, Space } from 'antd';
import type { ReactNode } from 'react';
import { withTranslation, type WithTranslation } from 'react-i18next';

// 全局错误边界：组件崩溃时显示错误信息，避免整页白屏
class ErrorBoundary extends Component<{ children: ReactNode } & WithTranslation, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[tuoleX auto] 组件错误：', error, info);
  }

  render() {
    const { t } = this.props;
    if (this.state.error) {
      return (
        <div style={{ padding: 48, maxWidth: 720, margin: '0 auto' }}>
          <Alert
            type="error" showIcon
            message={t('errorBoundary.title')}
            description={
              <Space direction="vertical" size={8}>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 }}>{String(this.state.error?.message || this.state.error)}</pre>
                <Button type="primary" size="small" onClick={() => { this.setState({ error: null }); location.reload(); }}>
                  {t('errorBoundary.reload')}
                </Button>
              </Space>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}

export default withTranslation()(ErrorBoundary);
