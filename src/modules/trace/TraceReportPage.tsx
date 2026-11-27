import { useMemo, useState } from 'react';
import { Card, Table, Tag, Typography, Space, Button, message, Alert, Empty } from 'antd';
import { FileExcelOutlined, SafetyCertificateOutlined, PartitionOutlined } from '@ant-design/icons';
import { useLiveQuery, apiFetch } from '../../core/api';
import { db } from '../../core/db';
import { useProjectStore } from '../../store/project';
import { useTranslation } from 'react-i18next';
import SignatureModal from '../../components/SignatureModal';
import * as XLSX from 'xlsx';
import type { SignatureRecord, TraceLink } from '../../core/types';

const { Title, Text, Paragraph } = Typography;
type TLink = TraceLink & { fromEntity?: string; toEntity?: string };

interface Row { key: number; req: string; reqDesc: string; design: string; unit: string; test: string; risk: string; }

function anyTable(name: string): { toArray: () => Promise<Record<string, unknown>[]> } | null {
  const c = (db as unknown as Record<string, { toArray?: unknown }>)[name];
  return c && typeof c.toArray === 'function' ? (c as { toArray: () => Promise<Record<string, unknown>[]> }) : null;
}

export default function TraceReportPage() {
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const gpid = useProjectStore((s) => s.projectId);
  const projects = useLiveQuery(() => db.projects.orderBy('id').toArray(), []) ?? [];
  const pid = gpid ?? projects[0]?.id ?? null;
  const project = projects.find((p) => p.id === pid);

  const reqs = useLiveQuery(() => db.req_items.toArray(), []) ?? [];
  const tcs = useLiveQuery(() => db.test_cases.toArray(), []) ?? [];
  const fmeas = useLiveQuery(() => db.fmea_items.toArray(), []) ?? [];
  const rcs = useLiveQuery(async () => (anyTable('risk_controls') ? anyTable('risk_controls')!.toArray() : []), []) ?? [];
  const links = useLiveQuery(() => db.trace_links.toArray(), []) ?? [];
  const swItems = useLiveQuery(async () => (anyTable('software_items') ? anyTable('software_items')!.toArray() : []), []) ?? [];
  const cyber = useLiveQuery(async () => (anyTable('cyber_assessments') ? anyTable('cyber_assessments')!.toArray() : []), []) ?? [];
  const cyberCaps = useLiveQuery(async () => (anyTable('cyber_capabilities') ? anyTable('cyber_capabilities')!.toArray() : []), []) ?? [];

  const [sigOpen, setSigOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const P = useMemo(() => ({
    reqs: (reqs as unknown as Record<string, unknown>[]).filter((r) => r.projectId === pid),
    tcs: tcs.filter((r) => r.projectId === pid),
    fmeas: fmeas.filter((r) => r.projectId === pid),
    rcs: (rcs as unknown as Record<string, unknown>[]).filter((r) => r.projectId === pid),
    links: links.filter((r) => r.projectId === pid) as TLink[],
    swItems: swItems.filter((r) => r.projectId === pid),
    cyber: cyber.filter((r) => r.projectId === pid),
  }), [reqs, tcs, fmeas, rcs, links, swItems, cyber, pid]);

  const codeOf = (id: number) => String(P.reqs.find((r) => Number(r.id) === id)?.reqId ?? `#${id}`);
  const tcCode = (id: number) => String(P.tcs.find((r) => r.id === id)?.tcId ?? `#${id}`);
  const riskCode = (id: number) => { const f = P.fmeas.find((r) => r.id === id); return f ? `RPN-${f.rpn} ${f.failureMode}` : `#${id}`; };
  // 兼容语义键（design_input/verification/...）与各平台旧短码（req/tc/fl/...）
  const ent = (x?: string) => ({ design_input:'design_input', user_need:'design_input', req:'design_input', req_items:'design_input', design_output:'design_output', design:'design_output', verification:'verification', tc:'verification', test_cases:'verification', risk:'risk_control', fmea:'risk_control', fl:'risk_control', risk_control:'risk_control', software_item:'software_item' } as Record<string,string>)[String(x ?? '')] ?? String(x ?? '');

  const rows: Row[] = useMemo(() => {
    const inputs = P.reqs.filter((r) => String(r.reqType) !== 'output');
    return inputs.map((r) => {
      const other = (fe: string) => P.links.map((l) => {
        const f = ent(l.fromEntity ?? (l as { fromType?: string }).fromType);
        const tt = ent(l.toEntity ?? (l as { toType?: string }).toType);
        const fid = Number(l.fromId), tid = Number(l.toId);
        if (f === 'design_input' && fid === Number(r.id) && tt === fe) return tid;
        if (tt === 'design_input' && tid === Number(r.id) && f === fe) return fid;
        return -1;
      }).filter((x) => x >= 0);
      const design = other('design_output').map((id) => codeOf(id));
      const tests = other('verification').map((id) => tcCode(id));
      const risks = other('risk_control').map((id) => riskCode(id)).filter(Boolean);
      const units = other('software_item').map((id) => { const s = P.swItems.find((x) => Number(x.id) === id); return s ? String(s.name || `#${id}`) : `#${id}`; });
      return { key: Number(r.id), req: String(r.reqId), reqDesc: String(r.desc), design: design.join('、') || '—', unit: units.join('、') || '—', test: tests.join('、') || '—', risk: Array.from(new Set(risks)).join('、') || '—' };
    });
  }, [P]);

  const covered = rows.filter((r) => r.test !== '—').length;
  const cyberRows = P.cyber.map((c) => { const cap = cyberCaps.find((x) => x.code === c.capCode); return { key: c.id!, code: c.capCode, name: cap?.name || '', applicability: c.applicability || '', rationale: c.rationale || '' }; });

  const columns = [
    { title: t('traceReport.colReq'), dataIndex: 'req', width: 110, render: (v: string, r: Row) => <div><Text strong>{v}</Text><div><Text type="secondary" style={{ fontSize: 12 }}>{r.reqDesc?.slice(0, 24)}</Text></div></div> },
    { title: t('traceReport.colDesign'), dataIndex: 'design', width: 130 },
    { title: t('traceReport.colUnit'), dataIndex: 'unit', width: 120 },
    { title: t('traceReport.colTest'), dataIndex: 'test', width: 130 },
    { title: t('traceReport.colRisk'), dataIndex: 'risk' },
  ];

  const hasCyber = cyberRows.length > 0;
  const reportData = () => ({ kind: 'traceability', project: project?.name || '', generatedAt: Date.now(), basis: t('traceReport.basisDesc'), rows, cyber: cyberRows });

  const exportXlsx = (cyberOnly = false) => {
    const wb = XLSX.utils.book_new();
    if (!cyberOnly) {
      const header = [t('traceReport.colReq'), t('traceReport.colDesign'), t('traceReport.colUnit'), t('traceReport.colTest'), t('traceReport.colRisk')];
      const ws = XLSX.utils.aoa_to_sheet([[project?.name || '', t('traceReport.title')], header, ...rows.map((r) => [r.req, r.design, r.unit, r.test, r.risk])]);
      XLSX.utils.book_append_sheet(wb, ws, t('traceReport.sheetMatrix'));
    }
    if (cyberOnly || cyberRows.length > 0) {
    const cHeader = [t('traceReport.colCode'), t('traceReport.colName'), t('traceReport.colApplicability'), t('traceReport.colRationale')];
    const ws2 = XLSX.utils.aoa_to_sheet([[cyberOnly ? t('traceReport.cyberTitle') : t('traceReport.sheetCyber')], cHeader, ...cyberRows.map((r) => [r.code, r.name, r.applicability, r.rationale])]);
    XLSX.utils.book_append_sheet(wb, ws2, cyberOnly ? t('traceReport.cyberShort') : t('traceReport.sheetCyber'));
    }
    XLSX.writeFile(wb, `${cyberOnly ? t('traceReport.cyberShort') : t('traceReport.title')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const doFreeze = async (rec: SignatureRecord) => {
    if (!pid) return;
    try {
      const now = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const res = await apiFetch('/baseline', { method: 'POST', body: JSON.stringify({ projectId: pid, signatureId: rec.id, kind: 'traceability', title: `${t('traceReport.title')} TR-${now}`, content: reportData() }) });
      const rec2 = await res.json();
      setSigOpen(false); setDone(rec2.version || '');
      msg.success(t('traceReport.frozen', { v: rec2.version || '' }));
    } catch (e) { msg.error(t('traceReport.freezeFail', { err: e instanceof Error ? e.message : String(e) })); }
  };

  return (
    <div>
      {msgCtx}
      <Space align="center" style={{ marginBottom: 8 }}>
        <PartitionOutlined style={{ color: '#1b6ca8', fontSize: 20 }} />
        <Title level={4} style={{ margin: 0 }}>{t('traceReport.title')}</Title>
        {project && <Tag>{project.name}</Tag>}
      </Space>
      <Paragraph type="secondary" style={{ maxWidth: 980 }}>{t('traceReport.desc')}</Paragraph>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('traceReport.basis')} description={t('traceReport.basisDesc')} />
      <Space style={{ marginBottom: 12 }} wrap>
        <Button icon={<FileExcelOutlined />} onClick={() => exportXlsx(false)}>{t('traceReport.exportXlsx')}</Button>
        {hasCyber && <Button onClick={() => exportXlsx(true)}>{t('traceReport.exportCyber')}</Button>}
        <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={() => setSigOpen(true)} disabled={!pid}>{t('traceReport.freezeSign')}</Button>
        {done && <Tag color="green">{t('traceReport.frozenTag', { v: done })}</Tag>}
      </Space>
      <Card size="small" title={t('traceReport.matrixTitle', { cov: covered, tot: rows.length })} style={{ marginBottom: 16 }}>
        {rows.length === 0 ? <Empty description={t('traceReport.noReq')} /> : <Table size="small" rowKey="key" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 820 }} />}
        <Text type="secondary" style={{ fontSize: 12 }}>{t('traceReport.matrixNote')}</Text>
      </Card>
      {cyberRows.length > 0 && (
        <Card size="small" title={t('traceReport.cyberTitle')}>
          <Table size="small" rowKey="key" pagination={false} dataSource={cyberRows}
            columns={[
              { title: t('traceReport.colCode'), dataIndex: 'code', width: 90 },
              { title: t('traceReport.colName'), dataIndex: 'name', width: 200 },
              { title: t('traceReport.colApplicability'), dataIndex: 'applicability', width: 110, render: (v: string) => <Tag color={v === 'applicable' ? 'green' : 'default'}>{v || '—'}</Tag> },
              { title: t('traceReport.colRationale'), dataIndex: 'rationale' },
            ]} />
          <Text type="secondary" style={{ fontSize: 12 }}>{t('traceReport.cyberNote')}</Text>
        </Card>
      )}
      <SignatureModal open={sigOpen} onClose={() => setSigOpen(false)}
        docInfo={{ docType: 'TRACEABILITY', docTitle: t('traceReport.title'), docVersion: 'pending', docContent: reportData() }}
        onSuccess={doFreeze} />
    </div>
  );
}
