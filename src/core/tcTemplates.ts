import { db } from './db';
import { createRecord } from './repo';
import { nextSeq } from './seq';
import type { ReqItem, TestCase, TraceLink, VLayer } from './types';

// ============ 测试用例模板库（V 模型右侧自动生成）============
// 按需求层级（reqType）提供通用用例骨架：功能/边界/异常/接口/性能/安全。
// 生成时：批量创建 test_cases（TC-xxx 全局递增）→ 自动建立「验证覆盖」追溯（req → tc）。
// A-SPICE 右侧映射：user_req/sys_req → SYS.5 系统合格性测试；sys_arch → SYS.4 系统集成测试；
//   hw_req → 系统合格性（硬件相关）；sw_req → SWE.6 软件合格性测试；sw_arch → SWE.5 软件集成验证；
//   dd/unit/task → SWE.4 单元验证。

export interface TcTemplate {
  id: string;          // 模板 ID（稳定）
  layer: VLayer;       // 适用需求层
  process: string;     // 对应 A-SPICE 右侧过程
  title: string;       // 用例标题模板（{req} 占位=来源需求描述）
  steps: string;       // 步骤模板（{req} 占位）
  expected: string;    // 预期结果模板
  kind: string;        // 用例类型标签：功能/边界/异常/接口/性能/安全
}

export const TC_TEMPLATES: TcTemplate[] = [
  // ============ 用户需求 / 系统需求 → SYS.5 系统合格性测试 ============
  { id: 'sqt-func', layer: 'user_req', process: 'SYS.5', kind: '功能', title: '功能符合性：{req}', steps: '1. 按需求描述配置系统运行环境\n2. 触发需求对应的功能场景\n3. 观察系统行为与输出', expected: '系统行为与输出完全符合需求描述，无异常' },
  { id: 'sqt-bound', layer: 'user_req', process: 'SYS.5', kind: '边界', title: '边界场景：{req}', steps: '1. 构造需求边界的输入（最大值/最小值/临界值）\n2. 执行功能\n3. 记录系统响应', expected: '系统在边界输入下行为正确、无崩溃或错误输出' },
  { id: 'sqt-err', layer: 'user_req', process: 'SYS.5', kind: '异常', title: '异常输入：{req}', steps: '1. 构造非法/异常输入（越界、空值、格式错误）\n2. 执行功能\n3. 检查错误处理', expected: '系统给出明确错误提示或安全降级，不影响其他功能' },
  { id: 'sqt-safety', layer: 'user_req', process: 'SYS.5', kind: '安全', title: '失效安全：{req}', steps: '1. 模拟关键输入源失效（传感器断连/通信中断）\n2. 观察系统进入的安全状态', expected: '系统进入定义的失效安全状态（如降级、告警、保持）' },

  // ============ 系统架构 → SYS.4 系统集成测试 ============
  { id: 'sit-if', layer: 'sys_arch', process: 'SYS.4', kind: '接口', title: '系统元素接口集成：{req}', steps: '1. 集成需求对应的系统元素（硬件/软件/机械）\n2. 触发元素间交互\n3. 检查数据/信号传递', expected: '元素间接口数据正确传递，时序与协议符合设计' },
  { id: 'sit-compat', layer: 'sys_arch', process: 'SYS.4', kind: '功能', title: '元素协同：{req}', steps: '1. 在整车上电/初始化场景下启动相关元素\n2. 执行典型工作流\n3. 检查元素间协同行为', expected: '各系统元素协同工作正常，无冲突或资源争用' },

  // ============ 硬件需求 → 系统合格性（硬件相关）============
  { id: 'hqt-func', layer: 'hw_req', process: 'SYS.5', kind: '功能', title: '硬件功能符合性：{req}', steps: '1. 按需求配置硬件（选型/参数）\n2. 施加需求规定的激励\n3. 测量硬件输出/特性', expected: '硬件输出与需求规格一致（含精度/范围要求）' },
  { id: 'hqt-env', layer: 'hw_req', process: 'SYS.5', kind: '环境', title: '环境适应性：{req}', steps: '1. 按需求规定的温度/湿度/振动条件施加环境应力\n2. 运行典型负载\n3. 检测硬件工作状态', expected: '硬件在环境应力下功能正常，无漂移或失效' },

  // ============ 软件需求 → SWE.6 软件合格性测试 ============
  { id: 'sqt6-func', layer: 'sw_req', process: 'SWE.6', kind: '功能', title: '软件功能符合性：{req}', steps: '1. 在目标环境/测试台架加载软件\n2. 执行需求对应的功能路径\n3. 检查软件输出', expected: '软件输出与需求描述一致' },
  { id: 'sqt6-bound', layer: 'sw_req', process: 'SWE.6', kind: '边界', title: '软件边界测试：{req}', steps: '1. 构造输入边界（最大/最小/临界值）\n2. 执行\n3. 检查结果', expected: '边界输入下输出正确，无溢出/截断错误' },
  { id: 'sqt6-err', layer: 'sw_req', process: 'SWE.6', kind: '异常', title: '软件异常处理：{req}', steps: '1. 注入异常输入/故障（错误报文、缺失数据）\n2. 执行\n3. 检查错误处理与恢复', expected: '软件正确处理异常，不崩溃，可恢复或安全降级' },
  { id: 'sqt6-perf', layer: 'sw_req', process: 'SWE.6', kind: '性能', title: '软件性能：{req}', steps: '1. 按需求条件施加负载\n2. 测量响应时间/吞吐/资源占用\n3. 与需求指标对比', expected: '性能指标满足需求规定（响应时间/资源上限）' },

  // ============ 软件架构 → SWE.5 软件集成验证 ============
  { id: 'sit5-if', layer: 'sw_arch', process: 'SWE.5', kind: '接口', title: '软件组件集成：{req}', steps: '1. 集成需求对应的软件组件\n2. 触发组件间调用/通信\n3. 检查接口契约', expected: '组件间接口按设计工作，参数/返回/异常传递正确' },
  { id: 'sit5-seq', layer: 'sw_arch', process: 'SWE.5', kind: '时序', title: '组件时序交互：{req}', steps: '1. 构造多组件并发/顺序调用场景\n2. 监控时序\n3. 检查无死锁/竞态/超时', expected: '组件交互时序符合设计，无死锁、竞态或超时' },

  // ============ 详细设计 / 单元 / 任务 → SWE.4 单元验证 ============
  { id: 'ut-func', layer: 'dd', process: 'SWE.4', kind: '功能', title: '单元功能验证：{req}', steps: '1. 依据详细设计搭建单元测试环境\n2. 执行设计规定的输入向量\n3. 检查输出', expected: '单元输出与设计规格一致（含分支/路径覆盖）' },
  { id: 'ut-bound', layer: 'dd', process: 'SWE.4', kind: '边界', title: '单元边界验证：{req}', steps: '1. 构造数据类型边界输入（最大值/最小值/溢出）\n2. 执行\n3. 检查结果', expected: '边界输入正确处理，无内存越界/溢出' },
  { id: 'ut-algo', layer: 'dd', process: 'SWE.4', kind: '算法', title: '算法正确性：{req}', steps: '1. 准备标准输入集与期望输出\n2. 执行算法\n3. 比对结果（含精度）', expected: '算法输出与期望一致（容差范围内）' },
  { id: 'ut-exception', layer: 'unit', process: 'SWE.4', kind: '异常', title: '单元异常路径：{req}', steps: '1. 注入非法参数/空指针/越界索引\n2. 执行单元\n3. 检查异常处理', expected: '单元安全处理异常，不崩溃，返回约定错误码' },
  { id: 'ut-task', layer: 'task', process: 'SWE.4', kind: '任务', title: '任务交付验证：{req}', steps: '1. 按任务描述确认交付物（接口定义/参数表/状态机）\n2. 对交付物进行静态检查/走查\n3. 记录结论', expected: '任务交付物完整、符合详细设计要求，走查无未关闭问题' },
];

// 某层适用的模板
export function templatesForLayer(layer: string): TcTemplate[] {
  return TC_TEMPLATES.filter((t) => t.layer === layer);
}

// 某层对应的 A-SPICE 右侧过程说明
export function verifyProcessFor(layer: string): string {
  const hit = TC_TEMPLATES.find((t) => t.layer === layer);
  return hit ? hit.process : '—';
}

// 批量生成测试用例：对一条需求生成所选模板的用例，并建立 req→tc「验证覆盖」追溯
export async function genTestCasesForReq(
  projectId: number,
  req: ReqItem,
  templateIds: string[],
  actor: { id: number; username: string },
  createdBy: string,
): Promise<{ added: number; tcIds: string[] }> {
  const tpls = TC_TEMPLATES.filter((t) => templateIds.includes(t.id));
  const added: string[] = [];
  for (const t of tpls) {
    const tcId = await nextSeq(projectId, 'TC');
    const title = t.title.replaceAll('{req}', req.desc.length > 30 ? req.desc.slice(0, 30) + '…' : req.desc);
    const steps = t.steps.replaceAll('{req}', req.desc);
    const expected = t.expected.replaceAll('{req}', req.desc);
    await createRecord<TestCase>('test_cases', {
      tcId, projectId, docId: 0, title, steps, expected,
      result: 'not_run', status: 'draft', createdAt: Date.now(), updatedAt: Date.now(),
    }, actor, `自动生成测试用例：${tcId}（${t.kind}·${t.process}，覆盖 ${req.reqId}）`);
    // 找新记录 id
    const all = await db.test_cases.where('projectId').equals(projectId).toArray();
    const saved = all.find((x) => x.tcId === tcId);
    if (saved?.id) {
      await createRecord<TraceLink>('trace_links', {
        projectId, fromType: 'req', fromId: req.id!, toType: 'tc', toId: saved.id,
        relType: '验证覆盖', createdAt: Date.now(), createdBy,
      }, actor, `自动追溯：${req.reqId} → ${tcId}（验证覆盖）`);
    }
    added.push(tcId);
  }
  return { added: added.length, tcIds: added };
}
