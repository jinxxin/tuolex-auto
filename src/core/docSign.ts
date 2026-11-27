import { db } from './db';
import { signWithPasswordCheck, verifySignature } from './signature';
import { updateRecord } from './repo';
import type { Actor } from './repo';
import type { DocRecord, SignatureRecord } from './types';

// ============ 在线文档电子签名（内容哈希绑定）============
// 签名与「文档类型 + 章节内容」哈希绑定；内容/标题/版本变化 → 签名自动失效。
// 批准类签名（含义含「批准」）将文档置为 approved 并锁定内容编辑。

export function docContentOf(doc: Pick<DocRecord, 'docType' | 'sections'>): { docType: string; sections: unknown } {
  return { docType: doc.docType, sections: doc.sections };
}

// 签名记录已生成后，回写文档（signatureIds、状态）
export async function applyDocSignature(
  doc: DocRecord,
  rec: SignatureRecord,
  actor: Actor,
): Promise<DocRecord['status']> {
  if (doc.status === 'approved') throw new Error('文档已批准，无需重复签署');
  const approved = rec.meaning.includes('批准');
  const status: DocRecord['status'] = approved ? 'approved' : doc.status;
  await updateRecord<DocRecord>('documents', doc.id!, {
    signatureIds: [...(doc.signatureIds || []), rec.id!],
    status,
  }, actor, `电子签名：${doc.title} v${doc.version}（${rec.meaning}）${approved ? '→ 文档已批准，内容锁定' : ''}`);
  return status;
}

// 完整流程：密码校验签名 + 回写文档（供无弹窗场景直接调用）
export async function signDoc(
  doc: DocRecord,
  username: string,
  pwd: string,
  meaning: string,
  actor: Actor,
): Promise<{ rec: SignatureRecord; status: DocRecord['status'] }> {
  if (doc.status === 'approved') throw new Error('文档已批准，无需重复签署');
  const rec = await signWithPasswordCheck(username, pwd, {
    meaning,
    docType: doc.docType,
    docTitle: doc.title,
    docVersion: `v${doc.version}`,
    docContent: docContentOf(doc),
  });
  const status = await applyDocSignature(doc, rec, actor);
  return { rec, status };
}

// 文档全部签名的有效性校验（哈希绑定检查）
export interface DocSignatureItem extends SignatureRecord {
  valid: boolean;
  reason?: string;
}

export async function docSignatureItems(doc: DocRecord): Promise<DocSignatureItem[]> {
  const ids = doc.signatureIds || [];
  if (ids.length === 0) return [];
  const recs = await db.signatures.where('id').anyOf(ids).toArray();
  const out: DocSignatureItem[] = [];
  for (const r of recs) {
    const v = await verifySignature(r.id!, docContentOf(doc));
    out.push({ ...r, valid: v.valid, reason: v.reason });
  }
  return out.sort((a, b) => a.signedAt - b.signedAt);
}
