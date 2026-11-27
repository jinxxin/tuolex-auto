// EasyFuSa 二期 M2：行业包数据完整性（S/E/C 枚举合法 / 引擎可回算 / 句式占位替换）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asilOfRaw } from './asil';
import { FS_PACKS, sgTextFromPack, packById } from './fsPacks';

const S = ['S0', 'S1', 'S2', 'S3'];
const E = ['E0', 'E1', 'E2', 'E3', 'E4'];
const C = ['C0', 'C1', 'C2', 'C3'];

test('M2 包注册表：id 唯一且 ≥8 包（一期 4 + 二期 4）', () => {
  const ids = FS_PACKS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, '包 id 不得重复');
  assert.ok(ids.length >= 8, `包数 ${ids.length} < 8`);
  assert.ok(ids.includes('steering') && ids.includes('brake') && ids.includes('cockpit') && ids.includes('powertrain'), '二期 4 新包在册');
});

test('M2 包数据：全部 HARA 条目 S/E/C 枚举合法且引擎可回算（不抛）', () => {
  for (const p of FS_PACKS) {
    assert.ok(p.hazards.length >= 1, `${p.id} 空包`);
    for (const h of p.hazards) {
      assert.ok(S.includes(h.severity), `${p.id}/${h.title} severity=${h.severity}`);
      assert.ok(E.includes(h.exposure), `${p.id}/${h.title} exposure=${h.exposure}`);
      assert.ok(C.includes(h.controllability), `${p.id}/${h.title} controllability=${h.controllability}`);
      assert.doesNotThrow(() => asilOfRaw(h.severity, h.exposure, h.controllability), `${p.id}/${h.title} 无法定级`);
      assert.ok(h.title && h.situation && h.rationale, `${p.id} 条目缺必填（title/situation/rationale）`);
      assert.ok(h.rationale.includes('需工程确认') || h.rationale.includes('review'), `${p.id}/${h.title} 缺「需工程确认」标注`);
    }
  }
});

test('M2 域 SG 句式：占位替换且无残留（steering 包）', () => {
  const p = packById('steering')!;
  const haz = p.hazards[0];
  const out = sgTextFromPack(p, haz);
  assert.ok(out, 'steering 包应有 sgStyle');
  assert.ok(!out!.title.includes('{'), `title 残留占位: ${out!.title}`);
  assert.ok(!out!.text.includes('{'), `text 残留占位: ${out!.text}`);
  assert.ok(out!.text.includes(haz.vehicleLevelHazard.slice(0, 6)), '句式应内嵌车辆级危害');
  // 无句式包 → null（回落通用 sgDraftFromHazard）
  assert.equal(sgTextFromPack(packById('adas'), haz), null);
});
