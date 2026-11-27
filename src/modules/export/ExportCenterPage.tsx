import { useState } from 'react';
import {
  Card, Row, Col, Button, Select, Space, message, Typography, Alert, Statistic, Divider,
} from 'antd';
import {
  DownloadOutlined, FileZipOutlined, FileExcelOutlined, FilePdfOutlined, FileTextOutlined,
  SafetyCertificateOutlined, DatabaseOutlined, ExperimentOutlined,
} from '@ant-design/icons';
import { useLiveQuery, apiFetch } from '../../core/api';
import { useTranslation } from 'react-i18next';
import { db } from '../../core/db';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

const { Text, Paragraph } = Typography;

function sanitize(name: string): string {
  return (name || '导出').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 80);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchAllAuditLogs(): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  const limit = 2000;
  for (;;) {
    const res = await apiFetch(`/audit/list?limit=${limit}&offset=${offset}`);
    const rows = await res.json();
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
}

export default function ExportCenterPage() {
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const projects = useLiveQuery(() => db.projects.orderBy('id').toArray(), []) ?? [];
  const fmeas = useLiveQuery(() => db.fmea_items.toArray(), []) ?? [];
  const [pkgProj, setPkgProj] = useState<number>();
  const [fmeaProj, setFmeaProj] = useState<number>();
  const [busy, setBusy] = useState<string>('');

  const projName = (id: number) => projects.find((p) => p.id === id)?.name ?? `#${id}`;
  const dateStr = dayjs().format('YYYYMMDD_HHmm');

  const wrap = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { msg.error((e as Error).message); } finally { setBusy(''); }
  };

  // ===== ① 验证文件包导出（ZIP） =====
  const exportPackage = () => wrap('pkg', async () => {
    if (!pkgProj) { msg.warning(t('exportC.selFirst')); return; }
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const now = Date.now();
    const stamp = dayjs(now).format('YYYY-MM-DD HH:mm:ss');
    const proj = projects.find((p) => p.id === pkgProj);
    const [reqs, tcs, links, fmeasP] = await Promise.all([
      db.req_items.where('projectId').equals(pkgProj).toArray(),
      db.test_cases.where('projectId').equals(pkgProj).toArray(),
      db.trace_links.where('projectId').equals(pkgProj).toArray(),
      db.fmea_items.where('projectId').equals(pkgProj).toArray(),
    ]);
    const docs = (await db.documents.toArray()).filter((d) => d.projectId === pkgProj);

    zip.file('README.md', t('exportC.readme', { sys: proj?.name ?? `#${pkgProj}`, time: stamp }));
    zip.file('project.json', JSON.stringify(proj ?? null, null, 2));
    zip.file('requirements.json', JSON.stringify(reqs, null, 2));
    zip.file('testcases.json', JSON.stringify(tcs, null, 2));
    zip.file('tracelinks.json', JSON.stringify(links, null, 2));
    zip.file('fmea.json', JSON.stringify(fmeasP, null, 2));
    zip.file('documents.json', JSON.stringify(docs.map((d) => ({ id: d.id, title: d.title, version: d.version, projectId: d.projectId })), null, 2));

    const blob = await zip.generateAsync({ type: 'blob' });
    download(blob, `${t('exportC.fnPkg')}_${sanitize(proj?.name ?? t('exportC.fnExport'))}_${dateStr}.zip`);
    await apiFetch('/audit/log', {
      method: 'POST',
      body: JSON.stringify({ action: 'EXPORT', entityType: 'package', entityId: pkgProj, summary: t('exportC.sumPkg', { proj: proj?.name, reqs: reqs.length, tcs: tcs.length, links: links.length, fmeas: fmeasP.length }) }),
    });
    msg.success(t('exportC.pkgDone'));
  });

  // ===== ② 审计日志导出 =====
  const exportAuditCsv = () => wrap('audit', async () => {
    const logs = await fetchAllAuditLogs();
    const ws = XLSX.utils.json_to_sheet(logs.map((l) => ({
      [t('exportC.hId')]: l.id,
      [t('exportC.hTime')]: dayjs(l.ts ?? l.id).format('YYYY-MM-DD HH:mm:ss'),
      [t('exportC.hUser')]: l.username,
      [t('exportC.hAction')]: l.action,
      [t('exportC.hEntity')]: l.entityType,
      [t('exportC.hEntityId')]: l.entityId,
      [t('exportC.hSummary')]: l.summary,
      [t('exportC.hBefore')]: l.before == null ? '' : JSON.stringify(l.before),
      [t('exportC.hAfter')]: l.after == null ? '' : JSON.stringify(l.after),
      [t('exportC.hHash')]: l.hash ?? '',
    })));
    ws['!cols'] = [{ wch: 6 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 8 }, { wch: 60 }, { wch: 40 }, { wch: 40 }, { wch: 80 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t('exportC.sheetAudit'));
    XLSX.writeFile(wb, `${t('exportC.fnAudit')}_${dateStr}.xlsx`);
    await apiFetch('/audit/log', { method: 'POST', body: JSON.stringify({ action: 'EXPORT', entityType: 'audit_logs', entityId: 0, summary: t('exportC.sumAuditCsv', { n: logs.length }) }) });
    msg.success(t('exportC.auditDone', { n: logs.length }));
  });

  const exportAuditPdf = () => wrap('audit', async () => {
    const logs = await fetchAllAuditLogs();
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(14);
    doc.text(t('exportC.pdfTitle', { n: logs.length }), 40, 40);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(t('exportC.pdfMeta', { time: dayjs().format('YYYY-MM-DD HH:mm:ss') }), 40, 56);
    doc.setTextColor(0);
    let y = 72;
    doc.setFontSize(7.5);
    logs.slice(0, 500).forEach((l) => {
      const line = `#${l.id} ${dayjs(l.ts ?? l.id).format('MM-DD HH:mm')} ${l.username} [${l.action}] ${l.entityType}#${l.entityId} ${String(l.summary ?? '').slice(0, 90)}`;
      if (y > 540) { doc.addPage(); y = 40; }
      doc.text(line, 40, y);
      y += 12;
    });
    doc.save(`${t('exportC.fnAudit')}_${dateStr}.pdf`);
    await apiFetch('/audit/log', { method: 'POST', body: JSON.stringify({ action: 'EXPORT', entityType: 'audit_logs', entityId: 0, summary: t('exportC.sumAuditPdf', { n: logs.length }) }) });
    msg.success(t('exportC.pdfDone'));
  });

  // ===== ③ 审计包 ZIP（含哈希校验清单） =====
  const exportAuditZip = () => wrap('zip', async () => {
    const logs = await fetchAllAuditLogs();
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const json = JSON.stringify(logs, null, 2);
    const chain = await (await apiFetch('/audit/verify')).json();
    zip.file('audit_logs.json', json);
    zip.file('chain_verify.json', JSON.stringify(chain, null, 2));
    const files: Record<string, string> = { 'audit_logs.json': json, 'chain_verify.json': JSON.stringify(chain, null, 2) };
    const manifest: Record<string, { sha256: string; size: number; exportedAt: string }> = {};
    for (const [name, content] of Object.entries(files)) {
      manifest[name] = { sha256: await sha256(content), size: content.length, exportedAt: dayjs().format('YYYY-MM-DD HH:mm:ss') };
    }
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    const blob = await zip.generateAsync({ type: 'blob' });
    download(blob, `${t('exportC.fnAuditZip')}_${dateStr}.zip`);
    await apiFetch('/audit/log', { method: 'POST', body: JSON.stringify({ action: 'EXPORT', entityType: 'audit_logs', entityId: 0, summary: t('exportC.sumZip', { n: logs.length }) }) });
    msg.success(t('exportC.zipDone'));
  });

  // ===== ④ FMEA Excel 导出 =====
  const exportFmeaExcel = () => wrap('fmea', async () => {
    const list = fmeaProj ? fmeas.filter((f) => f.projectId === fmeaProj) : fmeas;
    if (!list.length) { msg.warning(t('exportC.noFmea')); return; }
    const scope = fmeaProj ? projName(fmeaProj) : t('exportC.allProj');
    const header = [
      t('exportC.fHId'), t('exportC.fHProj'), t('exportC.fHProc'), t('exportC.fHMode'), t('exportC.fHEffect'), t('exportC.fHCause'),
      t('exportC.fHSeverity'), t('exportC.fHOcc'), t('exportC.fHDet'), t('exportC.fHRpn'),
      t('exportC.fHAction'), t('exportC.fHOwner'), t('exportC.fHStatus'), t('exportC.fHUpdated'),
    ];
    const body = list.map((f) => [
      f.id, projName(f.projectId), f.process, f.failureMode, f.effect ?? '', f.cause ?? '',
      f.severity, f.occurrence, f.detection, f.rpn, f.action ?? '', f.owner ?? '',
      f.status === 'closed' ? t('exportC.fmeaClosed') : t('exportC.fmeaOpen'), f.updatedAt ? dayjs(f.updatedAt).format('YYYY-MM-DD HH:mm') : '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws['!cols'] = [{ wch: 6 }, { wch: 20 }, { wch: 18 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 28 }, { wch: 10 }, { wch: 8 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t('exportC.sheetFmea'));
    XLSX.writeFile(wb, `FMEA_${sanitize(scope)}_${dateStr}.xlsx`);
    await apiFetch('/audit/log', { method: 'POST', body: JSON.stringify({ action: 'EXPORT', entityType: 'fmea_items', entityId: fmeaProj ?? 0, summary: t('exportC.sumFmea', { scope, n: list.length }) }) });
    msg.success(t('exportC.fmeaDone'));
  });

  return (
    <Card>
      {msgCtx}
      <Alert type="info" showIcon icon={<SafetyCertificateOutlined />} style={{ marginBottom: 16 }}
        message={t('exportC.alertInfo')} />

      <Row gutter={[16, 16]}>
        {/* ① 验证文件包 */}
        <Col xs={24} lg={12}>
          <Card size="small" title={<Space><FileZipOutlined />{t('exportC.pkgTitle')}</Space>}>
            <Paragraph type="secondary" style={{ minHeight: 40 }}>
              {t('exportC.pkgDesc')}
            </Paragraph>
            <Space wrap>
              <Select
                placeholder={t('exportC.selProjectPh')} style={{ width: 220 }} value={pkgProj}
                onChange={setPkgProj}
                options={projects.map((p) => ({ value: p.id!, label: p.name }))}
              />
              <Button type="primary" icon={<DownloadOutlined />} loading={busy === 'pkg'} onClick={exportPackage}>{t('exportC.zipBtn')}</Button>
            </Space>
          </Card>
        </Col>

        {/* ② 审计日志导出 */}
        <Col xs={24} lg={12}>
          <Card size="small" title={<Space><FileTextOutlined />{t('exportC.auditTitle')}</Space>}>
            <Paragraph type="secondary" style={{ minHeight: 40 }}>
              {t('exportC.auditDesc')}
            </Paragraph>
            <Space wrap>
              <Button icon={<FileExcelOutlined />} loading={busy === 'audit'} onClick={exportAuditCsv}>{t('exportC.excelBtn')}</Button>
              <Button icon={<FilePdfOutlined />} loading={busy === 'audit'} onClick={exportAuditPdf}>{t('exportC.pdfBtn')}</Button>
            </Space>
          </Card>
        </Col>

        {/* ③ 审计包 ZIP */}
        <Col xs={24} lg={12}>
          <Card size="small" title={<Space><DatabaseOutlined />{t('exportC.zipTitle')}</Space>}>
            <Paragraph type="secondary" style={{ minHeight: 40 }}>
              {t('exportC.zipDesc')}
            </Paragraph>
            <Space wrap>
              <Button type="primary" icon={<FileZipOutlined />} loading={busy === 'zip'} onClick={exportAuditZip}>{t('exportC.auditZipBtn')}</Button>
            </Space>
          </Card>
        </Col>

        {/* ④ FMEA Excel */}
        <Col xs={24} lg={12}>
          <Card size="small" title={<Space><ExperimentOutlined />{t('exportC.fmeaTitle')}</Space>}>
            <Paragraph type="secondary" style={{ minHeight: 40 }}>
              {t('exportC.fmeaDesc')}
            </Paragraph>
            <Space wrap>
              <Select
                allowClear placeholder={t('exportC.allProj')} style={{ width: 220 }} value={fmeaProj}
                onChange={setFmeaProj}
                options={projects.map((p) => ({ value: p.id!, label: p.name }))}
              />
              <Button icon={<FileExcelOutlined />} loading={busy === 'fmea'} onClick={exportFmeaExcel}>{t('exportC.excelBtn')}</Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Divider style={{ margin: '20px 0 8px' }} />
      <Space split={<Divider type="vertical" />} wrap>
        <Statistic title={t('exportC.statFmea')} value={fmeas.length} prefix={<ExperimentOutlined />} />
        <Statistic title={t('exportC.statProj')} value={projects.length} prefix={<DatabaseOutlined />} />
        <Text type="secondary">{t('exportC.footNote')}</Text>
      </Space>
    </Card>
  );
}
