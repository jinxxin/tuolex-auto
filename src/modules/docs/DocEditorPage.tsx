import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Button, Space, Typography, Tag, Input, Modal, Form, Select, message, Dropdown,
  Popconfirm, Empty, List, Divider,
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, PlusOutlined, UpOutlined, DownOutlined,
  DeleteOutlined, EditOutlined, FileWordOutlined, EyeOutlined, EditFilled,
  FileTextOutlined, ExperimentOutlined, WarningOutlined, OrderedListOutlined, FileOutlined, HistoryOutlined,
  DownloadOutlined, FilePdfOutlined, SafetyCertificateOutlined, LockFilled, SafetyOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { updateRecord } from '../../core/repo';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import DocEditor from '../../components/DocEditor';
import DocSignatureBlock from '../../components/DocSignatureBlock';
import SignatureModal from '../../components/SignatureModal';
import { applyDocSignature, docContentOf, docSignatureItems } from '../../core/docSign';
import { exportDocx, exportPdfFromElement } from '../../core/exportDoc';
import DocRender from './DocRender';
import dayjs from 'dayjs';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { uid, DOC_TEMPLATES } from './DocsPage';
import { recordEntryVersion, saveDocVersion } from '../../core/history';
import DocHistoryDrawer from './DocHistoryDrawer';
import EntryDetailDrawer from './EntryDetailDrawer';
import type { DocRecord, DocSection, ReqItem, TestCase, FmeaItem, SignatureRecord } from '../../core/types';
import { ENTRY_DEFS, DOC_ENTRY_TYPES, type DocEntryType, type EntrySnap, type Ref, type RefStatus, detectUpdates, syncSnapshot, buildSnapshot, snapshotAtVersion, entryVersionsOf } from '../../core/docEntries';

const { Text, Title } = Typography;

// 条目类型注册表见 core/docEntries.ts（「条目-快照」原则）
const ENTRY_ICON: Record<string, React.ReactNode> = {
  req: <FileTextOutlined style={{ color: '#1b6ca8' }} />,
  tc: <ExperimentOutlined style={{ color: '#0ca678' }} />,
  fmea: <WarningOutlined style={{ color: '#cf1322' }} />,
  vdoc: <FileOutlined style={{ color: '#722ed1' }} />,
  wp: <FileTextOutlined style={{ color: '#08979c' }} />,
  fs_hazard: <SafetyOutlined style={{ color: '#fa541c' }} />, fs_req: <SafetyOutlined style={{ color: '#fa541c' }} />,
  fs_fmeda: <SafetyOutlined style={{ color: '#fa541c' }} />, fs_fta: <SafetyOutlined style={{ color: '#fa541c' }} />,
  fs_dfa: <SafetyOutlined style={{ color: '#fa541c' }} />, fs_case: <SafetyOutlined style={{ color: '#fa541c' }} />,
  fs_confirm: <SafetyOutlined style={{ color: '#fa541c' }} />, fs_plan: <SafetyOutlined style={{ color: '#fa541c' }} />,
};

export default function DocEditorPage() {
  const { id } = useParams();
  const docId = Number(id);
  const nav = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const preview = params.get('view') === '1';
  const [msg, msgCtx] = message.useMessage();
  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };

  const doc = useLiveQuery(() => db.documents.get(docId), [docId]);
  const reqs = useLiveQuery(() => db.req_items.toArray(), []) ?? [];
  const tcs = useLiveQuery(() => db.test_cases.toArray(), []) ?? [];
  const fmeas = useLiveQuery(() => db.fmea_items.toArray(), []) ?? [];

  // 本地编辑态
  const [sections, setSections] = useState<DocSection[] | null>(null);
  const [activeSec, setActiveSec] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  // 文档视图内编辑条目：key = `${type}:${id}` → 字段修改（保存文档时同步到条目主数据并升版）
  const [pendingEdits, setPendingEdits] = useState<Record<string, Record<string, string>>>({});
  const [histOpen, setHistOpen] = useState(false);
  const [updSecId, setUpdSecId] = useState<string | null>(null);
  const [verPick, setVerPick] = useState<{ secId: string; r: RefStatus; versions: { version: number; changedAt: number; changedBy?: string; note?: string }[] } | null>(null);
  const [revOpen, setRevOpen] = useState(false);
  const [revForm] = Form.useForm();
  // 电子签名 + 导出
  const [sigOpen, setSigOpen] = useState(false);
  const [sigItems, setSigItems] = useState<Awaited<ReturnType<typeof docSignatureItems>> | null>(null);
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // 签名记录（用于预览块与导出根节点，随文档/签名变化刷新）
  useEffect(() => {
    let alive = true;
    setSigItems(null);
    (async () => {
      if (!doc) return;
      const items = await docSignatureItems(doc);
      if (alive) setSigItems(items);
    })();
    return () => { alive = false; };
  }, [doc?.id, doc?.version, (doc?.signatureIds || []).join(',')]);

  // 同步库数据到本地编辑态（useEffect，不能在渲染期 setState）
  useEffect(() => {
    if (doc && sections === null) {
      setSections(doc.sections);
      setTitle(doc.title);
      setActiveSec(doc.sections[0]?.id ?? null);
    }
  }, [doc, sections]);

  const current: DocRecord | undefined = doc;
  const secList: DocSection[] = sections ?? current?.sections ?? [];

  // 各类型条目实时数据（用于下拉选项 + 「有更新」检测）
  const liveByType = useMemo<Partial<Record<DocEntryType, Record<string, unknown>[]>>>(() => ({
    req: reqs as unknown as Record<string, unknown>[],
    tc: tcs as unknown as Record<string, unknown>[],
    fmea: fmeas as unknown as Record<string, unknown>[],
  }), [reqs, tcs, fmeas]);

  // 条目选项（按类型分组，来自注册表）
  const entryOptions = useMemo(() => {
    const projId = current?.projectId;
    return DOC_ENTRY_TYPES.map((tp) => {
      const def = ENTRY_DEFS[tp];
      const arr = (liveByType[tp] || []) as Record<string, unknown>[];
      const options = arr
        .filter((e) => !projId || e.projectId === projId)
        .map((e) => { const s = def.build(e); return { value: `${tp}:${e.id}`, label: `${s.code} ${s.title}`.slice(0, 40) }; });
      return { label: `${def.icon} ${def.label}`, options };
    }).filter((g) => g.options.length > 0);
  }, [liveByType, current?.projectId]);

  const active = secList.find((s) => s.id === activeSec) || secList[0];

  // ---- 电子签名 / 导出 ----
  const doSign = async (rec: SignatureRecord) => {
    if (!current) return;
    try {
      const status = await applyDocSignature(current, rec, actor);
      setSigOpen(false);
      msg.success(status === 'approved' ? t('docEditor.signApproved') : t('docEditor.signDone', { meaning: rec.meaning }));
    } catch (e) {
      msg.error(t('docEditor.signFailed', { err: e instanceof Error ? e.message : String(e) }));
    }
  };
  const doExport = async (mode: 'docx' | 'pdf') => {
    if (!current) return;
    setExporting(mode);
    try {
      // 导出内容 = 当前编辑态（含未保存修改）；签名校验仍基于保存态，若未保存修改会导致签名显示失效——符合 Part 11 语义
      const exportDoc: DocRecord = { ...current, title, sections: sections ?? current.sections };
      if (mode === 'docx') {
        await exportDocx(exportDoc);
      } else {
        if (sigItems === null) {
          setSigItems(await docSignatureItems(current));
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        }
        if (exportRef.current) await exportPdfFromElement(exportRef.current, exportDoc.title, exportDoc.version);
      }
      msg.success(mode === 'docx' ? t('docEditor.exportedDocx', { title: exportDoc.title, v: exportDoc.version }) : t('docEditor.exportedPdf', { title: exportDoc.title, v: exportDoc.version }));
    } catch (e) {
      msg.error(t('docEditor.exportFailed', { err: e instanceof Error ? e.message : String(e) }));
    } finally { setExporting(null); }
  };


  if (!current) {
    return <Card><Empty description={t('docEditor.notFound')}><Button onClick={() => nav('/docs')}>{t('docEditor.backList')}</Button></Empty></Card>;
  }

  const approved = current.status === 'approved';
  const locked = approved;

  // ---- 章节操作 ----
  const patchSections = (next: DocSection[]) => { setSections(next); setActiveSec((a) => (secList.find((s) => s.id === a) ? a : next[0]?.id ?? null)); };
  const addSection = (type: DocSection['type']) => {
    const tpl = DOC_TEMPLATES[current.docType]?.sections.find((s) => s.type === type);
    const sec: DocSection = {
      id: uid(),
      title: type === 'text' ? t('docEditor.textSecDefault', { n: secList.length + 1 }) : type === 'entries' ? t('docEditor.entriesSecDefault') : t('docEditor.addTocSec'),
      type,
      content: type === 'text' ? (tpl?.content ?? JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })) : undefined,
      refs: type === 'entries' ? [] : undefined,
      snapshot: type === 'entries' ? [] : undefined,
    };
    patchSections([...secList, sec]);
  };
  const moveSec = (idx: number, dir: -1 | 1) => {
    const next = [...secList];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    patchSections(next);
  };
  const removeSec = (idx: number) => {
    patchSections(secList.filter((_, i) => i !== idx));
  };
  // 更新章节的指定字段（content/intro/outro）
  const patchSectionField = (sec: DocSection, field: 'content' | 'intro' | 'outro', value: string) =>
    patchSections(secList.map((s) => (s.id === sec.id ? { ...s, [field]: value } : s)));

  const renameSec = () => {
    renameForm.validateFields().then((v) => {
      patchSections(secList.map((s) => (s.id === active?.id ? { ...s, title: v.title } : s)));
      setRenameOpen(false);
    });
  };

  // 条目引用编辑（引用即冻结：新增引用立即建立快照，已有引用保持不变）
  const updateRefs = (secId: string, values: string[]) => {
    const refs: Ref[] = values.map((v) => {
      const [type, idStr] = v.split(':');
      return { type: type as DocEntryType, id: Number(idStr) };
    });
    const sec = secList.find((s) => s.id === secId);
    void syncSnapshot(refs, (sec?.snapshot as EntrySnap[]) || []).then((snapshot) => {
      patchSections(secList.map((s) => (s.id === secId ? { ...s, refs, snapshot } : s)));
    });
  };



  // ---- 保存：条目编辑同步升版 + 文档升版 ----
  const saveDoc = async () => {
    setSaving(true);
    try {
      const now = Date.now();
      let entryChanged = 0;
      // 1. 提交文档视图内的条目修改 → 条目主数据更新 + 版本 +1
      for (const [key, fields] of Object.entries(pendingEdits)) {
        const [type, idStr] = key.split(':');
        const id = Number(idStr);
        if (type === 'req') {
          const it = await db.req_items.get(id);
          if (it && fields.desc && it.desc !== fields.desc) {
            const nextV = (it.version ?? 1) + 1;
            await updateRecord<ReqItem>('req_items', id, { desc: fields.desc, version: nextV, updatedAt: now }, actor, t('docEditor.auditEditReq', { code: it.reqId, v: nextV }));
            await recordEntryVersion('req', id, { desc: it.desc }, { desc: fields.desc, version: nextV }, actor, t('docEditor.auditEntryCtx', { title, v: current?.version }));
            entryChanged++;
          }
        } else if (type === 'tc') {
          const it = await db.test_cases.get(id);
          if (it && ((fields.steps && it.steps !== fields.steps) || (fields.expected && it.expected !== fields.expected))) {
            const nextV = (it.version ?? 1) + 1;
            await updateRecord<TestCase>('test_cases', id, { steps: fields.steps, expected: fields.expected, version: nextV, updatedAt: now }, actor, t('docEditor.auditEditTc', { code: it.tcId, v: nextV }));
            await recordEntryVersion('tc', id, { steps: it.steps, expected: it.expected }, { steps: fields.steps, expected: fields.expected, version: nextV }, actor, t('docEditor.auditEntryCtx', { title, v: current?.version }));
            entryChanged++;
          }
        } else if (type === 'fmea') {
          const it = await db.fmea_items.get(id);
          if (it && ((fields.failureMode && it.failureMode !== fields.failureMode) || (fields.effect && it.effect !== fields.effect))) {
            const nextV = (it.version ?? 1) + 1;
            await updateRecord<FmeaItem>('fmea_items', id, { failureMode: fields.failureMode, effect: fields.effect, version: nextV, updatedAt: now }, actor, t('docEditor.auditEditFmea', { rpn: it.rpn, v: nextV }));
            await recordEntryVersion('fmea', id, { failureMode: it.failureMode, effect: it.effect }, { failureMode: fields.failureMode, effect: fields.effect, version: nextV }, actor, t('docEditor.auditEntryCtx', { title, v: current?.version }));
            entryChanged++;
          }
        }
      }
      // 2. 快照冻结：仅为「文档内编辑过的条目」刷新快照；其余引用保持引用时快照
      const editedKeys = new Set(Object.keys(pendingEdits));
      const newSections = await Promise.all(secList.map(async (s) => {
        if (s.type !== 'entries') return s;
        const prev = (s.snapshot as EntrySnap[]) || [];
        const snapshot: EntrySnap[] = [];
        for (const r of ((s.refs || []) as Ref[])) {
          if (editedKeys.has(`${r.type}:${r.id}`)) {
            snapshot.push(...(await buildSnapshot([r])));
          } else {
            const kept = prev.find((x) => x.type === r.type && x.id === r.id);
            snapshot.push(...(kept ? [kept] : await buildSnapshot([r])));
          }
        }
        return { ...s, snapshot: (s.refs && s.refs.length) ? snapshot : prev };
      }));
      // 3. 文档升版 + 修订记录
      const nextVersion = (current?.version ?? 1) + 1;
      await updateRecord<DocRecord>('documents', docId, {
        title, sections: newSections, version: nextVersion, updatedAt: now,
        history: [...(current?.history || []), { version: nextVersion, date: now, by: user?.name || '', note: entryChanged ? t('docEditor.noteSaveSyncUp', { n: entryChanged }) : t('docEditor.noteSave') }],
      }, actor, entryChanged ? t('docEditor.auditSaveSync', { title, v: nextVersion, n: entryChanged }) : t('docEditor.auditSave', { title, v: nextVersion }));
      setSections(newSections);
      setPendingEdits({});
      // 4. 记录文档版本快照（历史预览/对比用）
      await saveDocVersion({ id: docId, title, sections: newSections, version: nextVersion }, user?.name || '', entryChanged ? t('docEditor.noteSaveSync', { n: entryChanged }) : t('docEditor.noteSave'));
      msg.success(entryChanged ? t('docEditor.savedSync', { v: nextVersion, n: entryChanged }) : t('docEditor.saved', { v: nextVersion }));
    } catch (e) {
      msg.error(t('docEditor.saveFailed', { err: e instanceof Error ? e.message : String(e) }));
    } finally { setSaving(false); }
  };

  // ---- 渲染条目块（可编辑：文档视图内直接修改条目内容，保存时同步主数据并升版）----
  const renderEntry = (e: EntrySnap) => (
    <EntryCard key={`${e.type}-${e.id}`} snap={e} editable={!preview && !locked}
      pending={pendingEdits[`${e.type}:${e.id}`]}
      onChange={(fields) => setPendingEdits((prev) => ({ ...prev, [`${e.type}:${e.id}`]: fields }))} />
  );

  // ---- 章节内容渲染 ----
  const renderSection = (sec: DocSection) => {
    if (sec.type === 'text') {
      if (preview || locked) {
        try {
          const json = JSON.parse(sec.content || '{}');
          return <div className="doc-editor"><RenderJson json={json} /></div>;
        } catch { return <Text type="secondary">{t('docEditor.emptySec')}</Text>; }
      }
      return <DocEditor value={sec.content || ''} onChange={(json) => patchSectionField(sec, 'content', json)} placeholder={t('docEditor.contentPh')} />;
    }
    if (sec.type === 'entries') {
      const snapshot = (sec.snapshot as EntrySnap[]) || [];
      const st = detectUpdates(snapshot, liveByType);
      const upd = st.filter((r) => r.updated).length;
      return (
        <div>
          {/* 上方说明文字 */}
          {!preview && !locked && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fafbfc', borderRadius: 6, border: '1px dashed #d9d9d9' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('docEditor.aboveNote')}</Text>
              <DocEditor value={sec.intro || ''} onChange={(json) => patchSectionField(sec, 'intro', json)} placeholder={t('docEditor.notePh')} />
            </div>
          )}
          {(preview || locked) && sec.intro && <div className="doc-editor"><RenderJson json={parseJson(sec.intro)} /></div>}

          {/* 条目更新提示 */}
          {!preview && upd > 0 && (
            <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', color: '#874d00', padding: '8px 14px', borderRadius: 6, marginBottom: 12, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span>{locked ? t('docEditor.updLocked', { n: upd }) : t('docEditor.updBanner', { n: upd })}</span>
              {!locked && <Button size="small" onClick={() => setUpdSecId(sec.id)}>{t('docEditor.updReview')}</Button>}
            </div>
          )}

          {/* 条目引用区 */}
          <div style={{ margin: '8px 0' }}>
            {!preview && !locked && (
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>{t('docEditor.pickEntries')}</Text>
                <Select mode="multiple" allowClear style={{ width: '100%', marginTop: 6 }} placeholder={t('docEditor.pickEntriesPh')}
                  options={entryOptions} value={(sec.refs || []).map((r) => `${r.type}:${r.id}`)}
                  onChange={(v) => updateRefs(sec.id, v)} optionFilterProp="label" />
              </div>
            )}
            {snapshot.length === 0 ? <Empty description={t('docEditor.noEntries')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              : snapshot.map(renderEntry)}
          </div>

          {/* 下方说明文字 */}
          {!preview && !locked && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#fafbfc', borderRadius: 6, border: '1px dashed #d9d9d9' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('docEditor.belowNote')}</Text>
              <DocEditor value={sec.outro || ''} onChange={(json) => patchSectionField(sec, 'outro', json)} placeholder={t('docEditor.notePh')} />
            </div>
          )}
          {(preview || locked) && sec.outro && <div className="doc-editor"><RenderJson json={parseJson(sec.outro)} /></div>}
        </div>
      );
    }
    // toc
    return (
      <div>
        {secList.filter((s) => s.type !== 'toc' && s.id !== sec.id).map((s) => (
          <div className="doc-toc-item" key={s.id} onClick={() => { setActiveSec(s.id); document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth' }); }}>
            <OrderedListOutlined /> {s.title}
          </div>
        ))}
      </div>
    );
  };

  // ---- 条目快照变更控制 ----
  const applyRefSnap = (secId: string, snap: EntrySnap) => {
    patchSections(secList.map((s) => (s.id === secId ? {
      ...s, snapshot: ((s.snapshot as EntrySnap[]) || []).map((x) => (x.type === snap.type && x.id === snap.id ? snap : x)),
    } : s)));
  };
  const doRevise = async () => {
    if (!current) return;
    const v = await revForm.validateFields();
    const now = Date.now();
    const nextVersion = current.version + 1;
    await updateRecord<DocRecord>('documents', docId, {
      status: 'draft' as DocRecord['status'], version: nextVersion, signatureIds: [], updatedAt: now,
      history: [...(current.history || []), { version: nextVersion, date: now, by: user?.name || '', note: t('docEditor.noteRevise', { reason: v.reason, from: current.version }) }],
    }, actor, t('docEditor.auditRevise', { title: current.title, v: nextVersion, reason: v.reason }));
    setRevOpen(false);
    setSections(null);
    msg.success(t('docEditor.reviseDone'));
  };

  return (
    <div className="doc-workspace">
      {msgCtx}
      {/* 顶部工具栏 */}
      <div style={{ maxWidth: 860, margin: '0 auto 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => nav('/docs')}>{t('common.back')}</Button>
          <FileWordOutlined style={{ fontSize: 20, color: '#1b6ca8' }} />
          <Title level={5} style={{ margin: 0, maxWidth: 320 }} ellipsis>{preview ? t('docEditor.titlePreview', { title }) : title}</Title>
          <Tag color="geekblue">{current.docType}</Tag>
          <Tag color="cyan">v{current.version}</Tag>
          <Tag>{current.status === 'approved' ? t('docs.status.approved') : t('docs.status.draft')}</Tag>
        </Space>
        <Space>
          {!preview && (
            <>
              <Button icon={<HistoryOutlined />} onClick={() => setHistOpen(true)}>{t('docEditor.history')}</Button>
              {!approved && (
                <Button icon={<SafetyCertificateOutlined style={{ color: '#1b6ca8' }} />} onClick={() => setSigOpen(true)}>{t('docEditor.sign')}</Button>
              )}
              {approved && (
                <Button icon={<EditOutlined />} onClick={() => { revForm.resetFields(); setRevOpen(true); }}>{t('docEditor.revise')}</Button>
              )}
              <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={locked} onClick={saveDoc}>{t('docEditor.saveVersion', { v: current.version + 1 })}</Button>
            </>
          )}
          <Dropdown menu={{
            items: [
              { key: 'docx', icon: <FileWordOutlined />, label: t('docEditor.exportWord') },
              { key: 'pdf', icon: <FilePdfOutlined />, label: t('docEditor.exportPdf') },
            ],
            onClick: ({ key }) => doExport(key as 'docx' | 'pdf'),
          }}>
            <Button icon={<DownloadOutlined />} loading={!!exporting}>{exporting ? t('docEditor.exporting') : t('docEditor.export')}</Button>
          </Dropdown>
          <Button icon={preview ? <EditFilled /> : <EyeOutlined />} onClick={() => nav(`/docs/${docId}${preview ? '' : '?view=1'}`)}>
            {preview ? t('docEditor.editMode') : t('docEditor.preview')}
          </Button>
        </Space>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* 左栏：章节管理 */}
        {!preview && (
          <Card size="small" style={{ width: 240, flexShrink: 0 }} styles={{ body: { padding: 8 } }}>
            <Space style={{ marginBottom: 8 }} wrap>
              <Button size="small" type="primary" icon={<PlusOutlined />} disabled={locked} onClick={() => addSection('text')}>{t('docEditor.addTextSec')}</Button>
              <Button size="small" icon={<PlusOutlined />} disabled={locked} onClick={() => addSection('entries')}>{t('docEditor.addEntriesSec')}</Button>
              <Button size="small" icon={<PlusOutlined />} disabled={locked} onClick={() => addSection('toc')}>{t('docEditor.addTocSec')}</Button>
            </Space>
            <List
              size="small" dataSource={secList} style={{ maxHeight: 560, overflow: 'auto' }}
              renderItem={(s, idx) => (
                <List.Item style={{ padding: '4px 0', cursor: 'pointer' }}
                  onClick={() => setActiveSec(s.id)}
                  actions={[
                    <Button key="up" size="small" type="text" icon={<UpOutlined />} disabled={locked} onClick={(e) => { e.stopPropagation(); moveSec(idx, -1); }} />,
                    <Button key="down" size="small" type="text" icon={<DownOutlined />} disabled={locked} onClick={(e) => { e.stopPropagation(); moveSec(idx, 1); }} />,
                    <Button key="ren" size="small" type="text" icon={<EditOutlined />} disabled={locked} onClick={(e) => { e.stopPropagation(); renameForm.setFieldsValue({ title: s.title }); setRenameOpen(true); }} />,
                    <Popconfirm key="del" title={t('docEditor.delSecTitle')} onConfirm={(e) => { e?.stopPropagation(); removeSec(idx); }}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={locked} onClick={(e) => e.stopPropagation()} />
                    </Popconfirm>,
                  ]}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px', borderRadius: 4, background: s.id === active?.id ? '#e6f4ff' : 'transparent', width: '100%' }}>
                    {s.type === 'text' ? <FileTextOutlined /> : s.type === 'entries' ? <ExperimentOutlined /> : <OrderedListOutlined />}
                    <Text style={{ fontSize: 12.5 }} ellipsis>{s.title}</Text>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        )}

        {/* 右栏：A4 文档页 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="doc-page" id={`sec-${active?.id}`}>
            {/* 文档标题 */}
            {preview || locked ? (
              <Title level={2} style={{ textAlign: 'center', margin: '0 0 8px', color: '#0b2545' }}>{title}</Title>
            ) : (
              <Input value={title} onChange={(e) => setTitle(e.target.value)} size="large"
                style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, color: '#0b2545', border: 'none', boxShadow: 'none', padding: 0, marginBottom: 8 }}
                placeholder={t('docEditor.titlePh')} />
            )}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{current.docType} · v{current.version} · {t('docEditor.revisedOn', { date: dayjs(current.updatedAt).format('YYYY-MM-DD') })}</Text>
            </div>
            <Divider style={{ margin: '0 0 20px' }} />

            {locked && (
              <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', color: '#237804', padding: '8px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
                <LockFilled /> {t('docEditor.lockedNote', { v: current.version })}
              </div>
            )}

            {/* 修订记录表 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24, fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f0f5fa' }}>
                  {[t('docEditor.hdrVersion'), t('docEditor.hdrDate'), t('docEditor.hdrBy'), t('docEditor.hdrNote')].map((h, i) => <th key={i} style={{ border: '1px solid #d9d9d9', padding: '6px 10px', textAlign: 'left' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...(current.history || [])].reverse().map((h) => (
                  <tr key={h.version}>
                    <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px' }}>v{h.version}</td>
                    <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px' }}>{dayjs(h.date).format('YYYY-MM-DD HH:mm')}</td>
                    <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px' }}>{h.by}</td>
                    <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px' }}>{h.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 章节内容：预览模式渲染完整文档（全部章节），编辑模式只显示当前章节 */}
            {preview ? (
              <div style={{ marginTop: 8 }}>
                {secList.length === 0
                  ? <Empty description={t('docEditor.noSections')} />
                  : secList.map((s) => (
                      <div key={s.id} style={{ marginBottom: 28, breakInside: 'avoid' }}>
                        <Title level={4} style={{ color: '#0b2545', marginBottom: 8 }}>{s.title}</Title>
                        {renderSection(s)}
                      </div>
                    ))}
                <DocSignatureBlock doc={current} items={sigItems} />
              </div>
            ) : active ? (
              <div style={{ marginTop: 8 }}>
                <Title level={4} style={{ color: '#0b2545', marginBottom: 8 }}>{active.title}</Title>
                {renderSection(active)}
              </div>
            ) : <Empty description={t('docEditor.noSectionsHint')} />}
          </div>
        </div>
      </div>

      {/* 文档历史（版本预览 + 对比） */}
      <DocHistoryDrawer docId={docId} open={histOpen} onClose={() => setHistOpen(false)} />

      <Modal open={renameOpen} onCancel={() => setRenameOpen(false)} onOk={renameSec} title={t('docEditor.renameSec')} width={380}>
        <Form form={renameForm} layout="vertical">
          <Form.Item name="title" rules={[{ required: true }]}><Input placeholder={t('docEditor.secTitlePh')} /></Form.Item>
        </Form>
      </Modal>

      {/* 条目更新处理（快照 → 最新 / 指定版本 / 保持） */}
      <Modal open={!!updSecId} onCancel={() => setUpdSecId(null)} footer={null} width={760} title={t('docEditor.updTitle')}>
        {(!updSecId ? [] : detectUpdates(((secList.find((s) => s.id === updSecId)?.snapshot as EntrySnap[]) || []), liveByType)).length === 0 ? <Empty description={t('docEditor.updNone')} image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
          <List size="small"
            dataSource={detectUpdates(((secList.find((s) => s.id === updSecId)?.snapshot as EntrySnap[]) || []), liveByType)}
            renderItem={(r) => (
              <List.Item actions={r.updated ? [
                <Button key="l" size="small" type="link" onClick={async () => { if (!updSecId) return; const s = await snapshotAtVersion(r.type, r.id); if (s) applyRefSnap(updSecId, s); }}>{t('docEditor.updToLatest')}</Button>,
                <Button key="v" size="small" type="link" onClick={async () => { if (!updSecId) return; const versions = await entryVersionsOf(r.type, r.id); setVerPick({ secId: updSecId, r, versions }); }}>{t('docEditor.updToVersion')}</Button>,
              ] : [<Tag key="ok" color="green">{t('docEditor.updKeep')}</Tag>]}>
                <List.Item.Meta avatar={ENTRY_ICON[r.type]}
                  title={<span>{r.snap?.code} <Text type="secondary">{r.snap?.title}</Text></span>}
                  description={<span>{ENTRY_DEFS[r.type].label} · {t('docEditor.updSnapTo', { snap: r.snapLabel, live: r.liveLabel })}{r.updated ? '' : t('docEditor.updSame')}</span>} />
              </List.Item>
            )} />
        )}
      </Modal>

      {/* 选择引用条目的历史版本 */}
      <Modal open={!!verPick} onCancel={() => setVerPick(null)} footer={null} width={460} title={t('docEditor.verPickTitle')}>
        {verPick && (
          <List size="small" dataSource={verPick.versions.length ? verPick.versions : [{ version: verPick.r.live?.version ?? 0, changedAt: Date.now() }]}
            renderItem={(v) => (
              <List.Item actions={[<Button key="p" size="small" onClick={async () => { const s = await snapshotAtVersion(verPick.r.type, verPick.r.id, v.version); if (s) applyRefSnap(verPick.secId, s); setVerPick(null); }}>{t('docEditor.verUse')}</Button>]}>
                <span>v{v.version} · {dayjs(v.changedAt).format('YYYY-MM-DD HH:mm')}</span>
              </List.Item>
            )} />
        )}
      </Modal>

      {/* 发起改版（解除锁定 → 重新签署） */}
      <Modal open={revOpen} onCancel={() => setRevOpen(false)} onOk={doRevise} title={t('docEditor.reviseTitle')} okText={t('docEditor.reviseOk')} width={480}>
        <div style={{ background: '#fff7e6', border: '1px solid #ffd591', color: '#874d00', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          {t('docEditor.reviseNote')}
        </div>
        <Form form={revForm} layout="vertical">
          <Form.Item name="reason" label={t('docEditor.reviseReason')} rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder={t('docEditor.reviseReasonPh')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 电子签名弹窗（内容哈希绑定） */}
      <SignatureModal
        open={sigOpen}
        onClose={() => setSigOpen(false)}
        docInfo={{ docType: current.docType, docTitle: current.title, docVersion: `v${current.version}`, docContent: docContentOf(current) }}
        onSuccess={doSign}
      />

      {/* 隐藏导出根节点（PDF 渲染用）：A4 宽度 + 零内边距，DocRender + 签署记录 */}
      <div ref={exportRef} aria-hidden style={{ position: 'fixed', left: -9999, top: 0, width: 794, background: '#fff', pointerEvents: 'none', zIndex: -1 }}>
        <div className="export-root">
          <DocRender doc={{ ...current, title, sections: sections ?? current.sections }} />
          <DocSignatureBlock doc={current} items={sigItems} />
        </div>
      </div>
    </div>
  );
}

// 条目卡片（文档视图内可编辑）
function EntryCard({ snap, editable, pending, onChange }: {
  snap: EntrySnap; editable: boolean;
  pending?: Record<string, string>;
  onChange: (fields: Record<string, string>) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [openDetail, setOpenDetail] = useState(false);
  const fields = pending || {};
  // 兼容旧结构快照（无 fieldLabels/fields 时退化为纯文本显示）
  const fieldLabels = snap.fieldLabels || {};
  const fieldKeys = Object.keys(fieldLabels);
  const fieldVals = snap.fields || {};
  // 显示文本：编辑缓冲优先，否则快照字段，旧结构直接使用 desc
  const descText = fieldKeys.length > 0
    ? fieldKeys.map((k) => fields[k] ?? fieldVals[k]).join('\n')
    : (fields.desc ?? snap.desc);
  return (
    <div className="doc-entry">
      <EntryDetailDrawer snap={snap} open={openDetail} onClose={() => setOpenDetail(false)} />
      <div className="entry-head">
        {ENTRY_ICON[snap.type]}
        <a onClick={() => setOpenDetail(true)} style={{ color: '#1b6ca8', cursor: 'pointer' }}>{snap.code}</a>
        <a onClick={() => setOpenDetail(true)} style={{ fontWeight: 500, color: '#1b6ca8', cursor: 'pointer' }}>{snap.title}</a>
        {Object.keys(fields).length > 0 && <Tag color="orange" style={{ marginLeft: 4 }}>{t('docEditor.pendingTag')}</Tag>}
        {editable && (
          <Button size="small" type="link" style={{ marginLeft: 'auto' }}
            onClick={() => { if (editing) onChange(fields); setEditing(!editing); }}>
            {editing ? t('docEditor.done') : t('common.edit')}
          </Button>
        )}
      </div>
      {editing ? (
        <div style={{ marginTop: 8 }}>
          {fieldKeys.map((k) => (
            <div key={k} style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{fieldLabels[k]}：</Text>
              <Input.TextArea rows={k === 'desc' || k === 'steps' ? 3 : 2} value={fields[k] ?? fieldVals[k]}
                onChange={(e) => onChange({ ...fields, [k]: e.target.value })} />
            </div>
          ))}
          <Text type="secondary" style={{ fontSize: 12, color: '#fa8c16' }}>
            ⚠ {t('docEditor.entryWarn')}
          </Text>
        </div>
      ) : (
        <>
          <div className="entry-desc">{descText}</div>
          {snap.meta && <div className="entry-meta">{snap.meta}</div>}
        </>
      )}
    </div>
  );
}

// 安全解析 TipTap JSON
function parseJson(s?: string): JsonNode {
  try { return s ? JSON.parse(s) : { type: 'doc' }; } catch { return { type: 'doc' }; }
}

// 预览模式：递归渲染 TipTap JSON
interface JsonNode { type?: string; content?: JsonNode[]; text?: string; level?: number; marks?: { type: string }[] }

function RenderJson({ json }: { json: JsonNode }) {
  if (!json) return null;
  const children = renderChildren(json.content);
  if (json.type === 'paragraph') return <p>{children}</p>;
  if (json.type === 'heading') return <div>{children}</div>;
  if (json.type === 'bulletList') return <ul>{children}</ul>;
  if (json.type === 'orderedList') return <ol>{children}</ol>;
  if (json.type === 'listItem') return <li>{children}</li>;
  if (json.type === 'blockquote') return <blockquote>{children}</blockquote>;
  if (json.type === 'horizontalRule') return <hr />;
  if (json.type === 'text') {
    let t: React.ReactNode = json.text;
    for (const m of json.marks || []) {
      if (m.type === 'bold') t = <strong>{t}</strong>;
      if (m.type === 'italic') t = <em>{t}</em>;
      if (m.type === 'strike') t = <s>{t}</s>;
      if (m.type === 'code') t = <code>{t}</code>;
    }
    return <>{t}</>;
  }
  return <>{children}</>;
}

function renderChildren(children: JsonNode[] | undefined): React.ReactNode {
  if (!children) return null;
  return children.map((c, i) => <RenderJson key={i} json={c} />);
}
