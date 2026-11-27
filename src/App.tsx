import { lazy, Suspense, useEffect } from 'react';
import { ConfigProvider, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { useTranslation } from 'react-i18next';
import { setLang } from './i18n';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import AppLayout from './components/AppLayout';
const LoginPage = lazy(() => import('./modules/auth/LoginPage'));
const DashboardPage = lazy(() => import('./modules/dashboard/DashboardPage'));
const FeedbackPage = lazy(() => import('./modules/feedback/FeedbackPage'));
const WorkItemsPage = lazy(() => import('./modules/workitems/WorkItemsPage'));
const TraceReportPage = lazy(() => import('./modules/trace/TraceReportPage'));
// 功能安全域（社区版包含）
const FsOverviewPage = lazy(() => import('./modules/fs/OverviewPage'));
const FsHaraPage = lazy(() => import('./modules/fs/HaraPage'));
const FsSafetyChainPage = lazy(() => import('./modules/fs/SafetyChainPage'));
const FsAnalysisPage = lazy(() => import('./modules/fs/AnalysisPage'));
const FsSafetyCasePage = lazy(() => import('./modules/fs/SafetyCasePage'));
const FsConfirmPage = lazy(() => import('./modules/fs/ConfirmPage'));
const FsPlanPage = lazy(() => import('./modules/fs/PlanPage'));

// 家族 IA：菜单级「软件过程(A-SPICE)」页（复用项目详情组件）
const ProcessPage = lazy(() => import('./modules/process/pages').then((m) => ({ default: m.ProcessPage })));
const AssessPage = lazy(() => import('./modules/process/pages').then((m) => ({ default: m.AssessPage })));
const WpPage = lazy(() => import('./modules/process/pages').then((m) => ({ default: m.WpPage })));
const VEntryPage = lazy(() => import('./modules/process/pages').then((m) => ({ default: m.VEntryPage })));
const ProcTracePage = lazy(() => import('./modules/process/pages').then((m) => ({ default: m.TracePage })));
const ProcVModelPage = lazy(() => import('./modules/process/pages').then((m) => ({ default: m.VModelPage })));
const AuditPage = lazy(() => import('./modules/audit/AuditPage'));
const UsersPage = lazy(() => import('./modules/users/UsersPage'));
const ProjectsPage = lazy(() => import('./modules/projects/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./modules/projects/ProjectDetailPage'));
const FmeaPage = lazy(() => import('./modules/fmea/FmeaPage'));
const QualitySystemPage = lazy(() => import('./modules/quality/QualitySystemPage'));
const SignatureCenterPage = lazy(() => import('./modules/signatures/SignatureCenterPage'));
const ExportCenterPage = lazy(() => import('./modules/export/ExportCenterPage'));
const DocsPage = lazy(() => import('./modules/docs/DocsPage'));
const DocEditorPage = lazy(() => import('./modules/docs/DocEditorPage'));
// EasyFuSa 功能安全域
import { useAuth, restoreSession } from './store/auth';
import { seedIfEmpty } from './core/seed';

function Protected() {
  const { user, ready } = useAuth();
  const loc = useLocation();
  useEffect(() => { restoreSession(); }, []);
  // 登录恢复后：以用户档案语言为准（写本地，供 i18n 使用）
  useEffect(() => {
    if (user?.lang) setLang(user.lang);
  }, [user?.lang]);
  if (!ready) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}><Spin size="large" /></div>;
  // 未登录：保留目标地址（path+query，含 ?project= 深链），登录后回跳
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <AppLayout />;
}

export default function App() {
  useEffect(() => {
    seedIfEmpty().catch((e) => console.error('种子数据初始化失败：', e));
  }, []);
  const { i18n } = useTranslation();
  // antd 组件内置文案随语言同步（分页/弹窗/日期等）
  const antdLocale = i18n.language?.toLowerCase().startsWith('en') ? enUS : zhCN;
  return (
    <ConfigProvider locale={antdLocale} theme={{ token: { colorPrimary: '#1b6ca8', borderRadius: 6 } }}>
      <HashRouter>
        <ErrorBoundary>
          <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}><Spin size="large" /></div>}>
          <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Protected />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="quality" element={<QualitySystemPage />} />
            <Route path="fmea" element={<FmeaPage />} />
            <Route path="docs" element={<DocsPage />} />
            <Route path="docs/:id" element={<DocEditorPage />} />
            <Route path="signatures" element={<SignatureCenterPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="export" element={<ExportCenterPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="feedback" element={<FeedbackPage />} />
            <Route path="workitems" element={<WorkItemsPage />} />
            <Route path="trace-report" element={<TraceReportPage />} />
            <Route path="fs/overview" element={<FsOverviewPage />} />
            <Route path="fs/hara" element={<FsHaraPage />} />
            <Route path="fs/safety-chain" element={<FsSafetyChainPage />} />
            <Route path="fs/analysis" element={<FsAnalysisPage />} />
            <Route path="fs/safety-case" element={<FsSafetyCasePage />} />
            <Route path="fs/confirm" element={<FsConfirmPage />} />
            <Route path="fs/plan" element={<FsPlanPage />} />

            <Route path="process" element={<ProcessPage />} />
            <Route path="process/assess" element={<AssessPage />} />
            <Route path="process/wp" element={<WpPage />} />
            <Route path="process/ventry" element={<VEntryPage />} />
            <Route path="process/trace" element={<ProcTracePage />} />
            <Route path="process/vmodel" element={<ProcVModelPage />} />
          </Route>
          </Routes>
          </Suspense>
        </ErrorBoundary>
      </HashRouter>
    </ConfigProvider>
  );
}
