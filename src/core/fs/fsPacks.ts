// ============ tuoleX FS 行业模板包注册表（二期 M2） ============
// 包 = 域模板集合：HARA 危害事件（S/E/C 参考值，ASIL 一律引擎 Table4 回算）+ 域 SG 句式（本地骨架 fallback）
// 全部条目标注「示例数据，需工程确认」；来源域见 内部领域笔记（多源公开资料交叉，非标准文本）
// 新增包 = 在 FS_PACKS 追加一条（+域 FMEDA 键入 data.ts FMEDA_ROW_TEMPLATES），零代码改动；包体超红线再拆 json 懒加载
import type { FsHazardTemplate } from './data';

export interface FsPackSgStyle {
  /** 标题模板占位 {hazTitle} */
  titleTpl: string;
  /** 正文模板占位 {hazTitle} {effect} {scene} */
  textTpl: string;
}

export interface FsPack {
  id: string;            // 包标识（projects.fsSysType 存该值）
  sysType: string;       // 展示名
  desc: string;
  sgStyle?: FsPackSgStyle; // 域 SG 句式（本地 fallback；无则用通用 sgDraftFromHazard）
  hazards: FsHazardTemplate[];
}

const E = '示例数据，需工程确认';

// ============ 一期既有包（迁入统一注册表，结构不变） ============
const ADAS_HAZARDS: FsHazardTemplate[] = [
  { title: 'AEB 应制动未制动（高速追尾）', vehicleLevelHazard: '车辆与前方障碍物发生碰撞', situation: '高速/城市快速路跟车，前车急刹，AEB 未触发', severity: 'S3', exposure: 'E4', controllability: 'C3', rationale: `高速碰撞伤害致命；跟车场景高频；突发急刹驾驶员无法避免（${E}）` },
  { title: 'AEB 误触发急刹', vehicleLevelHazard: '无碰撞风险时车辆非预期急减速', situation: '城市道路正常行驶（前车转弯让行），AEB 误判急刹', severity: 'S2', exposure: 'E3', controllability: 'C2', rationale: `急刹致后车追尾或乘员伤害；误判场景中等频率；有经验的驾驶员可部分干预（${E}）` },
  { title: 'FCW 应报警未报警', vehicleLevelHazard: '驾驶员失去前碰撞风险提示', situation: '驾驶员依赖预警接管的高速场景，FCW 静默失效', severity: 'S3', exposure: 'E4', controllability: 'C2', rationale: `失去预警提示后驾驶员反应时间不足致碰撞；预警功能 ASIL 通常低于执行功能（${E}）` },
  { title: 'ACC 非预期加速', vehicleLevelHazard: '车辆在跟车/巡航中非预期加速失控', situation: '高速巡航跟车中，目标丢失误判导致急加速', severity: 'S3', exposure: 'E3', controllability: 'C3', rationale: `高速非预期加速难以及时控制；场景中等频率（${E}）` },
  { title: '雷达传感器遮挡/静默', vehicleLevelHazard: '感知能力静默丢失导致 AEB/FCW 功能降级不可用', situation: '泥污/雨雪遮挡前雷达，无降级提示', severity: 'S2', exposure: 'E3', controllability: 'C2', rationale: `功能静默丢失后驾驶员无感知；属可探测降级场景（${E}）` },
  { title: 'AEB 应制动未制动（低速）', vehicleLevelHazard: '车辆与前方低速/静止目标碰撞', situation: '城市低速蠕行，前方行人/静止车，AEB 未触发', severity: 'S2', exposure: 'E4', controllability: 'C3', rationale: `低速碰撞伤害相对低但仍危及生命；城市场景高频；驾驶员反应窗口小（${E}）` },
];

// ============ 二期 M2 新增：转向 / 制动 / 座舱网关 / 动力 ============
const STEERING: FsHazardTemplate[] = [
  { title: '非预期转向扭矩/方向偏移', vehicleLevelHazard: '车辆非预期改变行驶方向', situation: '0-140km/h 公共道路行驶，无驾驶员请求时 EPS 输出转向扭矩', severity: 'S3', exposure: 'E4', controllability: 'C3', rationale: `非预期转向致偏离车道/对向碰撞；来源 fusi-engineering HARA 连续示例、SAE EPS 论文（${E}）` },
  { title: '高速中转向助力突然丧失（无提示）', vehicleLevelHazard: '转向沉重、驾驶员无法及时规避', situation: '高速行驶中助力失效且无降级提示', severity: 'S3', exposure: 'E4', controllability: 'C2', rationale: `机械转向保留→可控性 C2；来源 NHTSA ESV 25ESV-000267（${E}）` },
  { title: '助力输出方向/大小错误', vehicleLevelHazard: '错误助力致车辆非预期横摆', situation: '低速转向中助力方向错误叠加驾驶员输入', severity: 'S3', exposure: 'E3', controllability: 'C3', rationale: `错误助力难以及时纠正；来源 ESV/常见失效归纳（${E}）` },
  { title: '扭矩/转角传感器信号错误未检出', vehicleLevelHazard: '助力控制依据错误信号致误助力', situation: '传感器漂移/断连而合理性监测未检出', severity: 'S2', exposure: 'E4', controllability: 'C2', rationale: `传感器冗余+合理性监测可探测；来源 EPS 域论文（${E}）` },
  { title: '（SbW）横向运动控制完全丧失（无机械备份）', vehicleLevelHazard: '车辆失去转向能力', situation: '线控转向系统行驶中执行路径完全失效', severity: 'S3', exposure: 'E4', controllability: 'C3', rationale: `SbW 无机械连接→冗余执行/安全停车策略；来源 ESV loss of lateral control（${E}）` },
  { title: '（SbW）对驾驶员转向输入响应减弱/延迟', vehicleLevelHazard: '转向响应延迟致操控困难', situation: '线控转向响应衰减未提示', severity: 'S2', exposure: 'E3', controllability: 'C2', rationale: `响应监测+降级提示；来源 ESV reduced responsiveness（${E}）` },
];

const BRAKE: FsHazardTemplate[] = [
  { title: '行车制动功能完全丧失', vehicleLevelHazard: '车辆无法减速/停车致碰撞', situation: '行驶中主制动回路失效且无冗余制动', severity: 'S3', exposure: 'E4', controllability: 'C3', rationale: `保持最小制动能力（冗余回路/机械备份）；来源 quasist/Keysight ABS 侧滑例（${E}）` },
  { title: '非预期制动（行驶中自动刹车）', vehicleLevelHazard: '无制动请求时车辆突然减速', situation: '高速行驶中 EPB/制动系统误激活', severity: 'S2', exposure: 'E3', controllability: 'C2', rationale: `高速误制动致后车追尾（EPB 高速误激活 C 级讨论）；来源 quasist EPB 例（${E}）` },
  { title: '制动力不足/助力衰减（iBooster）', vehicleLevelHazard: '制动距离显著增加', situation: '助力电机/推杆失效，人力制动不足以应付紧急制动', severity: 'S3', exposure: 'E3', controllability: 'C3', rationale: `助力失效检测+人力制动可达+提示；来源 embitel 电子制动（${E}）` },
  { title: '制动防抱死失效（ABS 失效致侧滑）', vehicleLevelHazard: '紧急制动时车轮抱死车辆侧滑', situation: '湿滑路面紧急制动，ABS 失效', severity: 'S3', exposure: 'E3', controllability: 'C3', rationale: `ABS 失效可探测+降级制动+提示；来源 Keysight ABS 例（${E}）` },
  { title: '（AEB 语境）制动请求仲裁错误', vehicleLevelHazard: '矛盾制动请求致非预期制动或漏制动', situation: '多源（AEB/ACC/驾驶员）制动请求冲突仲裁错误', severity: 'S3', exposure: 'E4', controllability: 'C3', rationale: `请求仲裁一致性（可 D→C(D)+A(D) 分解）；来源 Patsnap 冗余分解例（${E}）` },
];

const COCKPIT: FsHazardTemplate[] = [
  { title: '关键报警符号误消失/误显示', vehicleLevelHazard: '驾驶员缺失制动/胎压/气囊等关键告警', situation: '仪表关键符号渲染丢失或错误点亮', severity: 'S3', exposure: 'E2', controllability: 'C2', rationale: `关键符号渲染完整性监测（自检+ECC）；来源 ECD 虚拟仪表（cluster 级 ASIL B）（${E}）` },
  { title: '车速/档位等关键信息错误显示', vehicleLevelHazard: '驾驶员依据错误信息驾驶', situation: '仪表信号链错误导致车速/档位显示偏差', severity: 'S2', exposure: 'E3', controllability: 'C2', rationale: `关键信号合理性校验+故障提示；来源 JAMA cluster 分级（${E}）` },
  { title: '网关路由错误/数据篡改（影响安全功能信号）', vehicleLevelHazard: '安全相关信号错发/被篡改', situation: '中央网关转发安全信号时路由错误或报文被注入', severity: 'S3', exposure: 'E3', controllability: 'C2', rationale: `网关安全路由（与 ISO 21434 联动）；来源 ECD 网关承载安全信号（${E}）` },
  { title: 'T-Box 异常唤醒/指令注入', vehicleLevelHazard: '远程指令异常执行影响车辆状态', situation: 'T-Box 收到伪造远程指令/异常唤醒', severity: 'S2', exposure: 'E3', controllability: 'C2', rationale: `指令认证（21434 联动）；来源网联风险归纳（${E}）` },
];

const POWERTRAIN: FsHazardTemplate[] = [
  { title: '非预期驱动加速（自加速）', vehicleLevelHazard: '车辆在无请求时自行加速', situation: '停车/起步或低速行驶中逆变器输出非预期驱动转矩', severity: 'S3', exposure: 'E4', controllability: 'C3', rationale: `不得在无驾驶员请求时产生驱动转矩；来源 NXP HV Inverter 白皮书官方 HARA（${E}）` },
  { title: '非预期反向驱动/换向错误', vehicleLevelHazard: '车辆非预期反向移动', situation: '换向指令错误或反向转矩输出（倒车/坡道）', severity: 'S3', exposure: 'E3', controllability: 'C3', rationale: `防止反向转矩致非预期后退/倒冲；来源 NXP SG2（${E}）` },
  { title: '行驶中驱动动力突然丧失', vehicleLevelHazard: '车辆高速失速/无法维持车速', situation: '高速或超车场景驱动系统静默关断无提示', severity: 'S2', exposure: 'E4', controllability: 'C2', rationale: `动力丧失可探测+降级提示（滑行/靠边）；来源 NXP SG3（${E}）` },
  { title: '转矩估算失效致非预期加速', vehicleLevelHazard: '转矩闭环依据错误估算输出', situation: '转矩估算信号（电流/转速）失效且未检出', severity: 'S2', exposure: 'E4', controllability: 'C3', rationale: `转矩监测合理性+安全状态；来源 VT 逆变器信号级 HARA E.150.1（${E}）` },
  { title: '充电中绝缘/隔离失效致高压触电', vehicleLevelHazard: '人员接触带电部件触电', situation: '充电过程中高压隔离失效（接触车身/充电接口）', severity: 'S3', exposure: 'E4', controllability: 'C3', rationale: `隔离监测+1s 内停止充电并断开；来源 LinkedIn/SAE 2020-01-0608 充电 HARA（${E}）` },
];

// ============ 全量注册表 ============
export const FS_PACKS: FsPack[] = [
  {
    id: 'adas', sysType: 'ADAS（AEB/FCW）', desc: '自动紧急制动与前碰撞预警（demo 主线）',
    hazards: ADAS_HAZARDS,
  },
  {
    id: 'acc', sysType: 'ADAS ACC', desc: '自适应巡航',
    hazards: [
      { title: 'ACC 非预期加速（目标丢失误判）', vehicleLevelHazard: '车辆非预期加速失控', situation: '高速巡航中目标丢失/弯道误判', severity: 'S3', exposure: 'E3', controllability: 'C3', rationale: `高速失控伤害致命，难控（${E}）` },
      { title: 'ACC 应减速未减速', vehicleLevelHazard: '与前车距离过近致追尾', situation: '前车减速跟随场景失效', severity: 'S3', exposure: 'E4', controllability: 'C3', rationale: `高频场景+高速碰撞（${E}）` },
      { title: 'ACC 传感器性能衰减未降级提示', vehicleLevelHazard: '功能静默失效', situation: '雨雾/遮挡导致目标丢失无提示', severity: 'S2', exposure: 'E3', controllability: 'C2', rationale: `静默失效需探测与提示（${E}）` },
    ],
  },
  {
    id: 'bms', sysType: '电池管理 BMS', desc: '电池管理系统（充电/热失控主线）',
    hazards: [
      { title: '充电过流致热失控', vehicleLevelHazard: '电池起火/爆炸', situation: '快充过程充电电流失控', severity: 'S2', exposure: 'E4', controllability: 'C3', rationale: `TI 白皮书公开案例（${E}）` },
      { title: '过充保护失效', vehicleLevelHazard: '电芯过充致起火', situation: 'BMS 充电管理失效', severity: 'S3', exposure: 'E3', controllability: 'C3', rationale: `（${E}）` },
      { title: '绝缘监测失效', vehicleLevelHazard: '高压漏电致触电', situation: '高压回路绝缘下降无告警', severity: 'S3', exposure: 'E2', controllability: 'C2', rationale: `（${E}）` },
    ],
  },
  {
    id: 'generic', sysType: '通用电子', desc: '通用安全相关 ECU（示例）',
    hazards: [
      { title: '看门狗失效致安全机制静默', vehicleLevelHazard: '控制器失控无降级', situation: 'MCU 运行异常且 WD 未触发', severity: 'S2', exposure: 'E3', controllability: 'C2', rationale: `（${E}）` },
    ],
  },
  {
    id: 'steering', sysType: '转向 EPS/SbW', desc: '电动助力转向与线控转向（ASIL D 高难域）',
    sgStyle: {
      titleTpl: 'SG：防止「{hazTitle}」',
      textTpl: '系统应防止在{scene}中因「{hazTitle}」导致{effect}，通过扭矩限制、传感器合理性监测与冗余、看门狗+关断路径及助力降级策略，将残余风险控制在可接受水平，并按规定向驾驶员提示。',
    },
    hazards: STEERING,
  },
  {
    id: 'brake', sysType: '电子制动 iBooster/BBW', desc: '线控制动/电子助力制动/EPB（安全件主域）',
    sgStyle: {
      titleTpl: 'SG：防止「{hazTitle}」',
      textTpl: '系统应防止在{scene}中因「{hazTitle}」导致{effect}，通过冗余制动通道、失效可探测、人力制动备份与降级策略，将残余风险控制在可接受水平，并按规定向驾驶员提示。',
    },
    hazards: BRAKE,
  },
  {
    id: 'cockpit', sysType: '座舱/网关', desc: '虚拟仪表、中央网关与 T-Box（增量合规域）',
    sgStyle: {
      titleTpl: 'SG：防止「{hazTitle}」',
      textTpl: '系统应防止在{scene}中因「{hazTitle}」导致{effect}，通过显示/信号完整性监测、合理性校验与安全路由（联动 ISO 21434），将残余风险控制在可接受水平，并按规定向驾驶员提示。',
    },
    hazards: COCKPIT,
  },
  {
    id: 'powertrain', sysType: '动力（电驱/OBC）', desc: '电驱逆变器/电机与车载充电（高压 ASIL D 域）',
    sgStyle: {
      titleTpl: 'SG：防止「{hazTitle}」',
      textTpl: '系统应防止在{scene}中因「{hazTitle}」导致{effect}，通过转矩/旋变冗余监测、功率级安全关断、高压隔离与绝缘监测，将残余风险控制在可接受水平，并按规定向驾驶员提示。',
    },
    hazards: POWERTRAIN,
  },
];

export const packById = (id?: string): FsPack | undefined => FS_PACKS.find((p) => p.id === id);

// 兼容别名：一期 HaraPage 引用的 ADAS 模板（导入均改走 FS_PACKS 后此别名仅兜底旧引用）
export const HAZARD_TEMPLATES_ADAS: FsHazardTemplate[] = ADAS_HAZARDS;

/** 包 SG 句式生成（本地骨架 fallback）：占位替换；无句式包返回 null（调用方用通用 sgDraftFromHazard） */
export function sgTextFromPack(pack: FsPack | undefined, haz: { title: string; vehicleLevelHazard?: string; situation?: string }): { title: string; text: string } | null {
  const st = pack?.sgStyle;
  if (!st) return null;
  const effect = (haz.vehicleLevelHazard || haz.title).trim();
  const scene = (haz.situation || '行驶工况').trim();
  const title = st.titleTpl.replaceAll('{hazTitle}', haz.title.trim());
  const text = st.textTpl
    .replaceAll('{hazTitle}', haz.title.trim())
    .replaceAll('{effect}', effect)
    .replaceAll('{scene}', scene);
  return { title, text };
}
