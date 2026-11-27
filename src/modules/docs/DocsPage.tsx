import { useEffect, useRef, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Modal, Form, Input, Select, message, Popconfirm, Typography,
} from 'antd';
import { PlusOutlined, FileWordOutlined, EditOutlined, DeleteOutlined, EyeOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { createRecord, deleteRecord } from '../../core/repo';
import { exportDocx, exportPdfFromElement } from '../../core/exportDoc';
import { docSignatureItems } from '../../core/docSign';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import DocRender from './DocRender';
import DocSignatureBlock from '../../components/DocSignatureBlock';
import type { DocRecord, DocSection } from '../../core/types';

const { Text } = Typography;

export const DOC_TYPES = ['URS', 'OQ', 'PQ', 'VSR', 'SOP', '培训记录', '其他'] as const;

// 预置文档模板（章节结构）
export const DOC_TEMPLATES: Record<string, { docType: string; sections: Omit<DocSection, 'id'>[] }> = {
  URS: {
    docType: 'URS',
    sections: [
      { title: '1. 概要描述', type: 'text', content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }) },
      { title: '2. 详细需求描述', type: 'entries', refs: [], snapshot: [] },
      { title: '3. 验收标准', type: 'text', content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }) },
    ],
  },
  OQ: {
    docType: 'OQ',
    sections: [
      { title: '1. 目的与范围', type: 'text', content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }) },
      { title: '2. 测试用例', type: 'entries', refs: [], snapshot: [] },
      { title: '3. 结论', type: 'text', content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }) },
    ],
  },
  SOP: {
    docType: 'SOP',
    sections: [
      { title: '1. 目的', type: 'text', content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }) },
      { title: '2. 适用范围', type: 'text', content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }) },
      { title: '3. 职责', type: 'text', content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }) },
      { title: '4. 操作流程', type: 'text', content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }) },
      { title: '5. 记录与归档', type: 'text', content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }) },
    ],
  },
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export default function DocsPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };

  const docs = useLiveQuery(() => db.documents.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? [];

  // PDF 导出：临时渲染隐藏 A4 根节点 → html2canvas → jsPDF
  const [pdfDoc, setPdfDoc] = useState<DocRecord | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfItems, setPdfItems] = useState<Awaited<ReturnType<typeof docSignatureItems>> | null>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pdfDoc || !pdfRef.current) return;
    const el = pdfRef.current;
    (async () => {
      setPdfBusy(true);
      try {
        // 先加载签署记录，等渲染后再截图（避免 PDF 里出现“加载中”）
        const items = await docSignatureItems(pdfDoc);
        setPdfItems(items);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await exportPdfFromElement(el, pdfDoc.title, pdfDoc.version);
        msg.success(t('docsList.exportedPdf', { title: pdfDoc.title, v: pdfDoc.version }));
      } catch (e) {
        msg.error(t('docsList.pdfFailed', { err: e instanceof Error ? e.message : String(e) }));
      } finally {
        setPdfBusy(false);
        setPdfDoc(null);
      }
    })();
  }, [pdfDoc]);

  const docType = Form.useWatch('docType', form);

  const create = async () => {
    const v = await form.validateFields();
    const tpl = DOC_TEMPLATES[v.docType] || DOC_TEMPLATES[v.template];
    const now = Date.now();
    const sections: DocSection[] = (tpl?.sections || []).map((s) => ({
      ...s,
      id: uid(),
      refs: s.type === 'entries' ? [] : undefined,
      snapshot: s.type === 'entries' ? [] : undefined,
    }));
    await createRecord<DocRecord>('documents', {
      title: v.title,
      docType: v.docType,
      projectId: v.projectId,
      sections,
      version: 1,
      status: 'draft',
      signatureIds: [],
      history: [{ version: 1, date: now, by: user?.name || '', note: t('docsList.noteCreate') }],
      createdAt: now,
      updatedAt: now,
    }, actor, t('docsList.auditCreate', { title: v.title, type: v.docType }));
    msg.success(t('docsList.created'));
    setOpen(false);
    const created = await db.documents.orderBy('id').last();
    if (created) nav(`/docs/${created.id}`);
  };

  const remove = async (d: DocRecord) => {
    await deleteRecord('documents', d.id!, actor, t('docsList.auditDelete', { title: d.title }));
    msg.success(t('docsList.deleted'));
  };

  return (
    <Card title={t('docsList.title')} extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>{t('docsList.new')}</Button>}>
      {msgCtx}
      <Text type="secondary">
        {t('docsList.intro')}
      </Text>
      <Table<DocRecord>
        rowKey="id" style={{ marginTop: 12 }} dataSource={docs} pagination={{ pageSize: 10 }}
        columns={[
          { title: t('docsList.colTitle'), dataIndex: 'title', width: 300, render: (v, d) => <a onClick={() => nav(`/docs/${d.id}`)} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v}><FileWordOutlined style={{ color: '#1b6ca8' }} /> {v}</a> },
          { title: t('docsList.colType'), dataIndex: 'docType', width: 110, render: (v) => <Tag color="geekblue">{v}</Tag> },
          { title: t('docsList.colProject'), width: 160, render: (_, d) => d.projectId ? projects.find((p) => p.id === d.projectId)?.name || '—' : <Text type="secondary">{t('docsList.genericDoc')}</Text> },
          { title: t('docsList.colVersion'), dataIndex: 'version', width: 70, render: (v) => <Tag color="cyan">v{v}</Tag> },
          { title: t('docsList.colSections'), width: 80, render: (_, d) => d.sections?.length ?? 0 },
          { title: t('docsList.colStatus'), dataIndex: 'status', width: 90, render: (s: string) => s === 'approved' ? <Tag color="green">{t('docs.status.approved')}</Tag> : s === 'superseded' ? <Tag color="purple">{t('docs.status.superseded')}</Tag> : <Tag>{t('docs.status.draft')}</Tag> },
          { title: t('docsList.colUpdated'), dataIndex: 'updatedAt', width: 130, render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') },
          { title: t('docsList.colActions'), width: 200, render: (_, d) => (
            <Space size={4}>
              <Button size="small" type="link" icon={<EditOutlined />} onClick={() => nav(`/docs/${d.id}`)}>{t('common.edit')}</Button>
              <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => nav(`/docs/${d.id}?view=1`)}>{t('docsList.preview')}</Button>
              <Button size="small" type="link" icon={<FileWordOutlined />} onClick={() => exportDocx(d).then(() => msg.success(t('docsList.exportedWord', { title: d.title, v: d.version }))).catch((e) => msg.error(t('docsList.exportFailed', { err: e instanceof Error ? e.message : String(e) })))}>Word</Button>
              <Button size="small" type="link" icon={<FilePdfOutlined />} loading={pdfBusy && pdfDoc?.id === d.id} onClick={() => setPdfDoc(d)}>PDF</Button>
              <Popconfirm title={t('docsList.delTitle')} onConfirm={() => remove(d)}>
                <Button size="small" type="link" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          )},
        ]}
      />

      <Modal open={open} onCancel={() => setOpen(false)} onOk={create} title={t('docsList.formNew')} width={560}>
        <Form form={form} layout="vertical" initialValues={{ docType: 'URS' }}>
          <Form.Item name="title" label={t('docsList.titleLabel')} rules={[{ required: true }]}>
            <Input placeholder={t('docsList.titlePh')} />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="docType" label={t('docsList.typeLabel')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={DOC_TYPES.map((v) => ({ value: v, label: v }))}
                onChange={() => form.setFieldsValue({ template: undefined })} />
            </Form.Item>
            <Form.Item name="template" label={t('docsList.tplLabel')} style={{ flex: 1 }}>
              <Select allowClear placeholder={t('docsList.tplPh')}
                options={Object.entries(DOC_TEMPLATES).filter(([k]) => k === docType).map(([k, v]) => ({ value: k, label: t('docsList.tplOption', { type: v.docType, n: v.sections.length }) }))} />
            </Form.Item>
          </Space>
          <Form.Item name="projectId" label={t('docsList.projectLabel')}>
            <Select allowClear placeholder={t('docsList.projectPh')} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
          </Form.Item>
        </Form>
      </Modal>

      {/* PDF 导出隐藏渲染根节点 */}
      {pdfDoc && (
        <div ref={pdfRef} aria-hidden style={{ position: 'fixed', left: -9999, top: 0, width: 794, background: '#fff', pointerEvents: 'none', zIndex: -1 }}>
          <div className="export-root">
            <DocRender doc={pdfDoc} />
            <DocSignatureBlock doc={pdfDoc} items={pdfItems} />
          </div>
        </div>
      )}
    </Card>
  );
}
