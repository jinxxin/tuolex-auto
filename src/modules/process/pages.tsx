import { useProjectStore } from '../../store/project';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { Empty, Space, Steps, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { V_PHASES } from '../../core/constants';
import ProcessTab from '../projects/ProcessTab';
import AssessmentTab from '../projects/AssessmentTab';
import WpWorkspace from '../projects/WpWorkspace';
import VEntryCenter from '../projects/VEntryCenter';
import TraceMatrixTab from '../projects/TraceMatrixTab';

// IA 统一：把「过程/V 模型」模块从项目详情 tab 抽为菜单级「软件过程(A-SPICE)」页。
// 渐进式：先新增这些菜单页（复用现有组件），旧 tab 暂时保留，验证后再撤。

function useCurProject() {
  const pid = useProjectStore((s) => s.projectId) ?? undefined;
  const projects = useLiveQuery(() => db.projects.orderBy('id').toArray(), []) ?? [];
  return { pid, project: projects.find((p) => p.id === pid) };
}

function NoProject() {
  const { t } = useTranslation();
  return <Empty description={t('process.noProject')} style={{ marginTop: 48 }} />;
}

export function ProcessPage() {
  const { project } = useCurProject();
  if (!project) return <NoProject />;
  return <ProcessTab project={project} />;
}
export function AssessPage() {
  const { project } = useCurProject();
  if (!project) return <NoProject />;
  return <AssessmentTab project={project} />;
}
export function WpPage() {
  const { project } = useCurProject();
  if (!project) return <NoProject />;
  return <WpWorkspace project={project} />;
}
export function VEntryPage() {
  const { pid } = useCurProject();
  if (!pid) return <NoProject />;
  return <VEntryCenter projectId={pid} />;
}
export function TracePage() {
  const { pid } = useCurProject();
  if (!pid) return <NoProject />;
  return <TraceMatrixTab projectId={pid} />;
}

// V 模型视图（把原先项目详情的 V 模型 tab 提升为菜单页）
export function VModelPage() {
  const { t } = useTranslation();
  const { pid, project } = useCurProject();
  const docs = useLiveQuery(() => (pid ? db.vdocs.where('projectId').equals(pid).toArray() : Promise.resolve([] as { docType: string; status: string }[])), [pid]) ?? [];
  if (!project) return <NoProject />;
  const docCount = (dt: string) => docs.filter((d) => d.docType === dt && d.status !== 'superseded').length;
  const approved = (dt: string) => docs.filter((d) => d.docType === dt && d.status === 'approved').length;
  const phaseState = (dt: string) => (approved(dt) > 0 ? 'finish' : 'process');
  const overall = Math.round((V_PHASES.filter((p) => approved(p.docType) > 0).length / V_PHASES.length) * 100);
  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>{t('process.vmodelTitle')}</Typography.Title>
      <Typography.Paragraph type="secondary">{t('process.vmodelDesc', { pct: overall })}</Typography.Paragraph>
      <Steps direction="horizontal" size="small" current={V_PHASES.filter((p) => approved(p.docType) > 0).length}
        items={V_PHASES.map((p) => ({
          title: <Space size={4}><span>{p.label}</span>{docCount(p.docType) > 0 && <Tag color={phaseState(p.docType) === 'finish' ? 'green' : 'blue'}>{docCount(p.docType)}</Tag>}</Space>,
          description: p.desc, status: phaseState(p.docType),
        }))} />
    </div>
  );
}
