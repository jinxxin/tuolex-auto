// ============ STEP 装配语义解析器（纯 JS，零依赖）============
// 输入：STEP 文本（ISO 10303-21，AP203/AP214/AP242 均可）
// 输出：装配树 + 汇总（EBOM 结构），不依赖几何内核
// 已验证：OpenCASCADE / Pro/E / UG(NX) 导出的真实 STEP 文件
'use strict';

export interface EbomNode {
  id?: string;          // 节点唯一标识（文档内，如 n1/n2…，BFS 序）
  name: string;
  count: number;
  children?: EbomNode[];
}

export interface EbomParseResult {
  ok: boolean;
  error?: string;
  products: number;
  assemblies: number;
  tree: EbomNode[];
  summary: { name: string; totalQty: number }[];
  warnings: string[];
}

// 解析 DATA 段实体（括号配对，支持多行、/* */ 与 (* *) 注释）
function parseEntities(data: string): Map<number, { type: string; args: string }> {
  const entities = new Map<number, { type: string; args: string }>();
  let i = 0;
  const n = data.length;
  while (i < n) {
    const hash = data.indexOf('#', i);
    if (hash === -1) break;
    const idEnd = data.indexOf('=', hash);
    if (idEnd === -1 || idEnd > hash + 12) { i = hash + 1; continue; }
    const id = parseInt(data.slice(hash + 1, idEnd), 10);
    let depth = 0;
    let j = idEnd + 1;
    let startArg = -1;
    for (; j < n; j++) {
      const ch = data[j];
      if (ch === '(') { if (depth === 0) startArg = j; depth++; }
      else if (ch === ')') { depth--; if (depth === 0) break; }
      else if (ch === ';' && depth === 0) break;
      else if (ch === '/' && data[j + 1] === '*') { const e2 = data.indexOf('*/', j + 2); if (e2 !== -1) j = e2 + 1; }
      else if (ch === '(' && data[j + 1] === '*') { const e2 = data.indexOf('*)', j + 2); if (e2 !== -1) j = e2 + 1; }
      else if (ch === '\'' && depth === 0 && startArg === -1) {
        const endQ = data.indexOf('\'', j + 1);
        if (endQ !== -1) j = endQ;
      }
    }
    if (startArg === -1) { i = hash + 1; continue; }
    const type = data.slice(idEnd + 1, startArg).trim();
    const args = data.slice(startArg + 1, j);
    entities.set(id, { type, args });
    i = j + 1;
  }
  return entities;
}

export function parseStep(text: string): EbomParseResult {
  const warnings: string[] = [];
  const empty: EbomParseResult = { ok: false, products: 0, assemblies: 0, tree: [], summary: [], warnings };

  if (!text || text.length < 50) return { ...empty, error: '文件内容过短，不是有效的 STEP 文件' };
  const head = text.slice(0, 200);
  if (!head.includes('ISO-10303-21')) {
    return { ...empty, error: '不是 STEP 文件（缺少 ISO-10303-21 头）——CATIA 原生 .CATPart/.CATProduct 等二进制格式请先导出 STEP' };
  }
  const dataStart = text.indexOf('DATA;');
  const dataEnd = text.indexOf('ENDSEC;', dataStart);
  if (dataStart === -1 || dataEnd === -1) return { ...empty, error: 'STEP 文件缺少 DATA 段' };
  const data = text.slice(dataStart + 5, dataEnd);

  const entities = parseEntities(data);

  // 提取关键实体
  const products = new Map<number, { code: string; name: string }>(); // productId
  const pdfProduct = new Map<number, number>();   // pdfId -> productId
  const pdFormation = new Map<number, number>();  // pdId -> pdfId
  const nauo: { name: string; parentPd: number; childPd: number }[] = [];

  for (const [id, e] of entities) {
    if (e.type === 'PRODUCT') {
      // desc 字段可能为 $（UG 导出），名称可能为空（Pro/E 导出）→ 宽容匹配前两个字符串
      const m = e.args.match(/^'([^']*)','([^']*)'/);
      if (m) products.set(id, { code: m[1], name: m[2] || m[1] || `#${id}` });
    } else if (e.type === 'PRODUCT_DEFINITION_FORMATION') {
      const m = e.args.match(/^'[^']*','[^']*',#(\d+)/);
      if (m) pdfProduct.set(id, Number(m[1]));
    } else if (e.type === 'PRODUCT_DEFINITION') {
      const m = e.args.match(/^'[^']*','[^']*',#(\d+)/);
      if (m) pdFormation.set(id, Number(m[1]));
    } else if (e.type === 'NEXT_ASSEMBLY_USAGE_OCCURRENCE') {
      const refs = [...e.args.matchAll(/#(\d+)/g)].map((x) => Number(x[1]));
      const nm = e.args.match(/^'([^']*)'/);
      if (refs.length >= 2) nauo.push({ name: nm ? nm[1] : '', parentPd: refs[0], childPd: refs[1] });
    }
  }

  if (products.size === 0 && nauo.length === 0) {
    return { ...empty, error: 'STEP 中未找到 PRODUCT/装配关系（可能不是装配模型或格式异常）' };
  }
  if (nauo.length === 0) {
    warnings.push('未找到 NEXT_ASSEMBLY_USAGE_OCCURRENCE 装配关系——该文件可能是单个零件（无子装配）');
  }

  // pdId -> productId
  const pdProduct = new Map<number, number>();
  for (const [pdId, pdfId] of pdFormation) {
    const prodId = pdfProduct.get(pdfId);
    if (prodId !== undefined) pdProduct.set(pdId, prodId);
  }

  // 装配图
  const children = new Map<number, { name: string; childPd: number }[]>();
  const hasParent = new Set<number>();
  for (const rel of nauo) {
    if (!children.has(rel.parentPd)) children.set(rel.parentPd, []);
    children.get(rel.parentPd)!.push(rel);
    hasParent.add(rel.childPd);
  }

  const productName = (pdId: number): string => {
    const prodId = pdProduct.get(pdId);
    const p = prodId !== undefined ? products.get(prodId) : undefined;
    if (!p) return `#${pdId}`;
    return p.code ? (p.name && p.name !== p.code ? `${p.code} · ${p.name}` : p.code) : (p.name || `#${prodId}`);
  };

  // 构建树并赋予节点 id（BFS 序：n1/n2/…，文档内唯一，供追溯引用）
  let nodeSeq = 0;
  function buildNode(pdId: number, count: number): EbomNode {
    const node: EbomNode = { id: `n${++nodeSeq}`, name: productName(pdId), count: count || 1 };
    const kids = children.get(pdId);
    if (kids && kids.length) {
      node.children = [];
      for (const k of kids) node.children.push(buildNode(k.childPd, 1));
    }
    return node;
  }

  const rootPds = [...children.keys()].filter((pd) => !hasParent.has(pd));
  // 若 NAUO 为空但存在产品，尝试所有 free product 作为顶层（单零件场景）
  let tree: EbomNode[];
  if (rootPds.length > 0) {
    tree = rootPds.map((pd) => buildNode(pd, 1));
  } else {
    tree = [...pdProduct.entries()]
      .filter(([pdId]) => !hasParent.has(pdId))
      .map(([pdId]) => buildNode(pdId, 1));
  }

  // 叶子汇总（数量统计）
  const allCounts = new Map<string, number>();
  (function count(node: EbomNode) {
    if (!node.children || !node.children.length) {
      allCounts.set(node.name, (allCounts.get(node.name) || 0) + (node.count || 1));
    } else node.children.forEach(count);
  })({ name: 'ROOT', count: 1, children: tree } as EbomNode);

  const summary = [...allCounts.entries()]
    .map(([name, totalQty]) => ({ name, totalQty }))
    .sort((a, b) => b.totalQty - a.totalQty);

  return {
    ok: true,
    products: products.size,
    assemblies: nauo.length,
    tree,
    summary,
    warnings,
  };
}
