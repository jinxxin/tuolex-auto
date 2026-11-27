// ============ tuoleX FS 静态领域数据（UI 只读对照视图/表单选项/种子模板） ============
// 数值来源与 asil.ts 同源（内部领域笔记）

import type {
  FsSeverity, FsExposure, FsControllability, FsAsil, FsIndependence,
  FsReqKind, FsCaseNodeKind,
} from '../types';
import { ASIL_ORDER, DECOMPOSITIONS, HW_TARGETS } from './asil';

// ---------- S/E/C 等级定义（tooltip/下拉文案；公开共识表述） ----------
export const SEVERITY_OPTIONS: { value: FsSeverity; zh: string; en: string }[] = [
  { value: 'S0', zh: '无伤害（通常仅财产损失）', en: 'No injuries' },
  { value: 'S1', zh: '轻到中度伤害', en: 'Light to moderate injuries' },
  { value: 'S2', zh: '严重、危及生命（存活可能大）', en: 'Severe/life-threatening, survival probable' },
  { value: 'S3', zh: '危及生命或致命（存活不确定）', en: 'Life-threatening or fatal' },
];
export const EXPOSURE_OPTIONS: { value: FsExposure; zh: string; en: string }[] = [
  { value: 'E0', zh: '不可信 / 极罕见', en: 'Incredibly unlikely' },
  { value: 'E1', zh: '很低（很罕见）', en: 'Very low / very rare' },
  { value: 'E2', zh: '低（罕见）', en: 'Low / rare' },
  { value: 'E3', zh: '中（偶尔）', en: 'Medium / occasional' },
  { value: 'E4', zh: '高（频繁，多数工况）', en: 'High / frequent' },
];
export const CONTROLLABILITY_OPTIONS: { value: FsControllability; zh: string; en: string }[] = [
  { value: 'C0', zh: '总体可控', en: 'Controllable in general' },
  { value: 'C1', zh: '简单可控', en: 'Simply controllable' },
  { value: 'C2', zh: '正常可控', en: 'Normally controllable' },
  { value: 'C3', zh: '难控或不可控', en: 'Difficult to control or uncontrollable' },
];

export const ASIL_COLOR: Record<FsAsil, string> = {
  QM: 'default', A: 'green', B: 'blue', C: 'orange', D: 'red',
};
export const ASIL_TAG_TEXT: Record<FsAsil, string> = { QM: 'QM', A: 'ASIL A', B: 'ASIL B', C: 'ASIL C', D: 'ASIL D' };

// ---------- ASIL 判定表只读视图（HARA 页对照表；36 格 + 短路说明） ----------
export const ASIL_TABLE_VIEW = {
  note: 'ISO 26262-3:2018 Table 4（ASIL determination）。S0/E0/C0 短路 QM。S3+E1+C3 默认 A；若组合低概率情境总暴露 < E1 可论证 QM（标准 6.4.3.11，人工覆写需留痕）。',
  severities: ['S1', 'S2', 'S3'] as FsSeverity[],
  exposures: ['E1', 'E2', 'E3', 'E4'] as FsExposure[],
  controllabilities: ['C1', 'C2', 'C3'] as FsControllability[],
};

// ---------- 分解表只读视图 ----------
export const DECOMPOSITION_VIEW = {
  note: 'ISO 26262-9:2018 Clause 5。仅 Safety Requirements 可分解（Safety Goal 不可分解）；记号 X(Y)：按 Y 原级论证、按 X 级开发；分解依赖冗余元素独立性与 DFA 论证；硬件度量目标与确认措施独立性按原级 Y。',
  rows: (ASIL_ORDER.filter((a) => a !== 'QM') as Exclude<FsAsil, 'QM'>[]).map((orig) => ({
    orig,
    combos: DECOMPOSITIONS[orig],
  })),
};

// ---------- 硬件目标值只读视图 ----------
export const HW_TARGETS_VIEW = {
  note: 'ISO 26262-5:2018（PMHF 单位 FIT，1 FIT=1E-9/h）。ASIL A 与 QM 无定量要求。分解后按分解前原级取目标。',
  rows: (Object.keys(HW_TARGETS) as ('B' | 'C' | 'D')[]).map((asil) => ({
    asil, ...HW_TARGETS[asil],
  })),
};

// ---------- 确认措施独立性等级（I0-I3；笔记 §6.2） ----------
export const INDEPENDENCE_LEVELS: { value: FsIndependence; zh: string; en: string }[] = [
  { value: 'I0', zh: '不同的人执行（同团队可；措施应执行）', en: 'Different person (same team allowed)' },
  { value: 'I1', zh: '不同的人（不同于创建者）', en: 'Different person from author' },
  { value: 'I2', zh: '不同团队（不同直接上级）', en: 'Different team / direct superior' },
  { value: 'I3', zh: '不同部门或组织（管理/资源/发布权独立）', en: 'Different department / organization' },
];
/** ASIL → 独立性典型建议（工作规则；可裁剪，具体以项目与评估机构要求为准） */
export const INDEPENDENCE_SUGGEST: Record<FsAsil, FsIndependence> = {
  QM: 'I1', A: 'I1', B: 'I2', C: 'I2', D: 'I3',
};

// ---------- 需求链 kind（分色与层级说明） ----------
export const FS_KIND_META: Record<FsReqKind, { zh: string; en: string; color: string }> = {
  SG: { zh: '安全目标', en: 'Safety Goal', color: 'red' },
  FSC: { zh: '功能安全概念', en: 'Functional Safety Concept', color: 'orange' },
  TSC: { zh: '技术安全概念', en: 'Technical Safety Concept', color: 'blue' },
  HSI: { zh: '软硬件接口规格', en: 'HW-SW Interface', color: 'cyan' },
  SYSTEM_SR: { zh: '系统安全需求', en: 'System Safety Req.', color: 'geekblue' },
  HW_SR: { zh: '硬件安全需求', en: 'HW Safety Req.', color: 'purple' },
  SW_SR: { zh: '软件安全需求', en: 'SW Safety Req.', color: 'magenta' },
};

// ---------- GSN 元素（Safety Case 编辑器图例；GSN Community Standard v3） ----------
export const GSN_ELEMENTS: { kind: FsCaseNodeKind; zh: string; en: string; shape: string }[] = [
  { kind: 'goal', zh: '主张 Goal', en: 'Goal', shape: '矩形' },
  { kind: 'strategy', zh: '论证策略', en: 'Strategy', shape: '平行四边形' },
  { kind: 'solution', zh: '证据 Solution', en: 'Solution', shape: '圆形' },
  { kind: 'context', zh: '上下文', en: 'Context', shape: '圆角矩形' },
  { kind: 'assumption', zh: '假设', en: 'Assumption', shape: '椭圆' },
  { kind: 'justification', zh: '理由', en: 'Justification', shape: '椭圆(J)' },
];

// ---------- HARA 模板类型（行业包数据见 core/fs/fsPacks.ts，二期 M2 起统一注册表） ----------
export interface FsHazardTemplate {
  title: string;
  vehicleLevelHazard: string;
  situation: string;
  severity: FsSeverity;
  exposure: FsExposure;
  controllability: FsControllability;
  rationale: string;
}
// ---------- 需求链模板（M2 用；SG 文案风格示例） ----------
export interface FsReqTemplate { kind: FsReqKind; text: string; }
export const SG_TEMPLATES: { title: string; text: string }[] = [
  { title: '防止非预期加速', text: '系统应防止在无驾驶员请求或驾驶场景不允许时产生非预期驱动扭矩，避免车辆失控。' },
  { title: '提供碰撞缓解制动', text: '系统应在检测到不可避免的前碰撞风险时提供自动制动，以减轻或避免碰撞后果。' },
  { title: '安全状态可达', text: '系统在检测到自身故障时，应在 FTTI 内进入安全状态并向驾驶员提示。' },
];

// ---------- M5 AI 智能搭建：内置模板库（= 云端无 AI key 的降级内容；生成物均为草稿需工程确认） ----------

// FMEDA 常见失效行模板（按元件类型匹配，AI 辅助/一键生成）
export interface FsFmedaRowTemplate { component: string; failureMode: string; effect: string; lambda: number; faultType: FsFmedaRowTplClass; mitigation: string }
type FsFmedaRowTplClass = 'singlePoint' | 'latent' | 'safe';
export const FMEDA_ROW_TEMPLATES: Record<string, FsFmedaRowTemplate[]> = {
  MCU: [
    { component: 'MCU', failureMode: '时钟丢失/漂移', effect: '逻辑执行错误可能违背安全目标', lambda: 80, faultType: 'singlePoint', mitigation: '时钟监测 + 安全关断' },
    { component: 'MCU', failureMode: '内存单元失效（单粒子/老化）', effect: '数据损坏', lambda: 50, faultType: 'latent', mitigation: 'ECC + 周期性内存自检' },
    { component: 'MCU', failureMode: 'IO 引脚粘连', effect: '执行器误驱动', lambda: 30, faultType: 'singlePoint', mitigation: '回读诊断' },
  ],
  电源: [
    { component: '电源', failureMode: '过压/欠压', effect: '系统复位或误动作', lambda: 60, faultType: 'safe', mitigation: '电源监测 + 安全状态' },
    { component: '电源', failureMode: '纹波超标', effect: '模拟采样漂移', lambda: 20, faultType: 'latent', mitigation: '滤波 + 采样自检' },
  ],
  传感器: [
    { component: '传感器', failureMode: '信号漂移/饱和', effect: '感知错误', lambda: 40, faultType: 'singlePoint', mitigation: '合理性检查 + 冗余' },
    { component: '传感器', failureMode: '遮挡/污染致信号丢失', effect: '功能静默', lambda: 25, faultType: 'latent', mitigation: '遮挡检测与降级提示' },
  ],
  看门狗: [
    { component: '看门狗 WD', failureMode: 'WD 自检失效', effect: '安全机制不可用', lambda: 10, faultType: 'singlePoint', mitigation: 'WD 周期性功能测试' },
  ],
  // 二期 M2 域元件表（行业包联动，item 含域关键字命中）
  'EPS 电机': [
    { component: 'EPS 电机', failureMode: '绕组短路/断路', effect: '助力丢失或异常助力', lambda: 40, faultType: 'singlePoint', mitigation: '电机相电流监测 + 安全关断' },
    { component: 'EPS 电机', failureMode: '霍尔/换向信号失效', effect: '助力脉动或丧失', lambda: 30, faultType: 'latent', mitigation: '换向自检 + 降级助力' },
  ],
  扭矩传感器: [
    { component: '扭矩传感器', failureMode: '信号漂移/断连', effect: '助力大小错误', lambda: 25, faultType: 'singlePoint', mitigation: '双传感器冗余 + 合理性比对' },
  ],
  转角传感器: [
    { component: '转角传感器', failureMode: '信号错误未检出', effect: '转向控制依据错误', lambda: 20, faultType: 'latent', mitigation: '冗余 + 周期性自检' },
  ],
  电磁阀: [
    { component: '制动电磁阀', failureMode: '卡滞/线圈断路', effect: '制动液路异常（抱死或无力）', lambda: 35, faultType: 'singlePoint', mitigation: '阀状态回读 + 冗余回路' },
  ],
  推杆电机: [
    { component: '推杆电机', failureMode: '堵转/失效', effect: '助力制动丧失', lambda: 40, faultType: 'singlePoint', mitigation: '电流监测 + 人力制动备份提示' },
  ],
  主缸压力: [
    { component: '主缸压力传感器', failureMode: '漂移/失效', effect: '制动控制闭环错误', lambda: 20, faultType: 'latent', mitigation: '冗余压力传感 + 合理性检查' },
  ],
  轮速传感器: [
    { component: '轮速传感器', failureMode: '信号丢失/错误', effect: 'ABS/ESC 功能异常', lambda: 30, faultType: 'singlePoint', mitigation: '多轮交叉校验 + 降级' },
  ],
  显示驱动: [
    { component: '显示驱动 IC', failureMode: '输出错误/自检失效', effect: '关键符号误显/丢失', lambda: 25, faultType: 'singlePoint', mitigation: '符号渲染完整性监测 + ECC' },
  ],
  '仪表 MCU': [
    { component: '仪表 MCU', failureMode: '内存/时钟失效', effect: '仪表数据错误', lambda: 50, faultType: 'latent', mitigation: '锁步/自检 + 安全符号独立路径' },
  ],
  '网关 SoC': [
    { component: '网关 SoC', failureMode: '路由表错误/缓冲区溢出', effect: '安全信号错发/丢帧', lambda: 30, faultType: 'singlePoint', mitigation: '路由完整性校验 + 看门狗' },
  ],
  IGBT: [
    { component: 'IGBT/SiC 功率模块', failureMode: '直通/短路', effect: '母线短路致驱动失控', lambda: 15, faultType: 'singlePoint', mitigation: '退饱和检测 + 快速关断（ASIL D）' },
  ],
  栅极驱动: [
    { component: '栅极驱动 IC', failureMode: '驱动失效/米勒误开通', effect: '功率级异常开关', lambda: 20, faultType: 'singlePoint', mitigation: '互锁 + 驱动状态回读' },
  ],
  旋变: [
    { component: '旋变/位置传感器', failureMode: '信号失效/偏差', effect: '电机控制角度错误致转矩错误', lambda: 25, faultType: 'singlePoint', mitigation: '双通道/观测器冗余 + 合理性监测' },
  ],
  母线电容: [
    { component: '直流母线电容', failureMode: '容量衰减/短路', effect: '母线电压纹波/放电异常', lambda: 10, faultType: 'latent', mitigation: '母线电压监测 + 主动放电回路' },
  ],
  HVIL: [
    { component: 'HVIL 高压互锁回路', failureMode: '回路断开未检出', effect: '高压连接器带电可触及', lambda: 15, faultType: 'singlePoint', mitigation: '互锁监测 + 断开即断电/放电' },
  ],
  'OBC PFC': [
    { component: 'OBC PFC MOSFET', failureMode: '直通/过流', effect: '充电输入异常/器件损坏', lambda: 20, faultType: 'singlePoint', mitigation: '过流/过压保护 + 隔离监测' },
  ],
};

// Safety Case 论证骨架模板（一键生成 GSN 树草稿）
export interface FsCaseSkeleton { goalText: string; strategies: { text: string; solutions: string[] }[] }
export const CASE_SKELETONS: FsCaseSkeleton[] = [
  {
    goalText: '系统在既定运行场景下功能安全可接受（安全目标受控）',
    strategies: [
      { text: '论证：相关危害已识别并完成 ASIL 定级', solutions: ['HARA 分析报告（含 S/E/C 与定级理由）'] },
      { text: '论证：安全机制按 ASIL 要求实现且有效', solutions: ['安全需求链证据（SG→FSC→TSC→软硬件）', 'FMEDA 度量达标证据'] },
      { text: '论证：验证活动覆盖安全需求', solutions: ['安全相关测试用例与执行记录'] },
    ],
  },
];
