// ============ FMEA 模板与评分标准（AIAG-VDA / ISO 26262 功能安全 / ISO 21434 网络安全）============

// 风险等级
export function riskLevel(rpn: number): { level: '高' | '中' | '低'; color: string } {
  if (rpn >= 100) return { level: '高', color: 'red' };
  if (rpn >= 50) return { level: '中', color: 'orange' };
  return { level: '低', color: 'green' };
}

// 评分标准（导出 Excel 说明页用）
export const FMEA_SCALE: { dim: string; values: [number, string][] }[] = [
  {
    dim: '严重度 S（后果影响）',
    values: [
      [1, '无影响'], [2, '轻微影响，不影响功能安全'], [3, '轻微影响，可快速发现纠正'],
      [4, '中等影响，功能异常但可检测'], [5, '中等影响，可能导致功能降级'],
      [6, '较大影响，功能部分丧失'], [7, '重大影响，违反功能安全/网络安全要求'],
      [8, '严重：关键功能失效，影响行车安全'], [9, '非常严重：可能导致人身伤害'], [10, '灾难性：直接危及人身安全'],
    ],
  },
  {
    dim: '发生度 O（发生可能性）',
    values: [
      [1, '几乎不可能（<1/10000）'], [2, '极低（1/5000）'], [3, '低（1/2000）'],
      [4, '较低（1/1000）'], [5, '中等（1/500）'], [6, '较高（1/200）'],
      [7, '高（1/100）'], [8, '很高（1/50）'], [9, '极高（1/20）'], [10, '几乎必然（>1/10）'],
    ],
  },
  {
    dim: '探测度 D（发现能力，越高越难发现）',
    values: [
      [1, '几乎肯定能发现（自动校验+测试覆盖）'], [2, '很高：多重自动化测试'], [3, '高：自动化测试'],
      [4, '较高：定期台架/实车核查'], [5, '中等：人工抽查'], [6, '较低：偶发核查'],
      [7, '低：无系统化核查'], [8, '很低：仅事后发现'], [9, '极低：几乎无法发现'], [10, '无法探测'],
    ],
  },
];

// 预置常见风险条目模板（点击一键添加）——按项目系统类型（产品属性）配置：
// FMEA_TEMPLATES[sysType] 为各类型特色模板；default 为通用汽车电子模板（兜底）。
// 页面通过 templatesFor(sysType) 取「类型特色 + 通用」合并集合。
export type FmeaTemplate = Omit<FmeaItemLite, 'projectId' | 'status' | 'action'>;

const COMMON_AUTO: FmeaTemplate[] = [
  {
    process: '功能安全', failureMode: '安全机制失效且未被诊断（看门狗/ECC/E2E 校验失效）',
    effect: '危害事件无法被抑制，违反 ISO 26262 安全目标',
    cause: '安全机制无自检；诊断覆盖不足；看门狗配置错误',
    severity: 9, occurrence: 3, detection: 4,
    owner: '功能安全 / 软件', rpn: 9 * 3 * 4,
  },
  {
    process: '网络安全', failureMode: '未加密/未认证的车载通信被注入（CAN 伪造报文）',
    effect: '非预期控制指令被执行，违反 ISO 21434 网络安全要求',
    cause: '报文无认证；密钥管理缺失；诊断端口暴露',
    severity: 9, occurrence: 3, detection: 4,
    owner: '网络安全 / 软件', rpn: 9 * 3 * 4,
  },
  {
    process: '软件实现', failureMode: '内存越界/缓冲区溢出导致控制器崩溃',
    effect: '关键功能不可用，可能触发安全事件',
    cause: '边界检查缺失；未使用安全编程规范；静态分析未覆盖',
    severity: 8, occurrence: 3, detection: 3,
    owner: '软件', rpn: 8 * 3 * 3,
  },
  {
    process: '需求追溯', failureMode: '系统需求未双向追溯到软件/硬件需求',
    effect: '需求实现遗漏或多余实现，验证覆盖不全',
    cause: '追溯矩阵未维护；需求变更未同步',
    severity: 7, occurrence: 3, detection: 3,
    owner: '系统工程 / QA', rpn: 7 * 3 * 3,
  },
  {
    process: '配置管理', failureMode: '软件/标定版本混淆，装车版本与验证版本不一致',
    effect: '验证结果无法覆盖实际装车软件，合规风险',
    cause: '版本基线未受控；构建产物标识缺失',
    severity: 8, occurrence: 2, detection: 4,
    owner: '配置管理 / 软件', rpn: 8 * 2 * 4,
  },
  {
    process: '供电管理', failureMode: '电压跌落/掉电导致非易失数据损坏',
    effect: '标定/学习值丢失，功能回退到不安全默认值',
    cause: '掉电保护电路缺失；写时序无校验',
    severity: 7, occurrence: 3, detection: 3,
    owner: '硬件 / 软件', rpn: 7 * 3 * 3,
  },
  {
    process: '时钟同步', failureMode: 'ECU 间时钟漂移导致事件时序错乱',
    effect: '日志时序与事件关联错误，故障归因困难',
    cause: '未同步时间主站；PTP 配置错误',
    severity: 6, occurrence: 3, detection: 3,
    owner: '软件 / 系统', rpn: 6 * 3 * 3,
  },
  {
    process: '诊断管理', failureMode: 'DTC 误报/漏报导致故障无法及时识别',
    effect: '维修误判或安全隐患被掩盖',
    cause: '诊断阈值不合理；DTC 清除逻辑缺陷',
    severity: 7, occurrence: 3, detection: 3,
    owner: '诊断 / 软件', rpn: 7 * 3 * 3,
  },
];

// 各系统类型特色模板（ECU/ADAS/BMS/域控制器/网关/传感器/车载信息娱乐/其他）
const TYPE_TEMPLATES: Record<string, FmeaTemplate[]> = {
  ECU: [
    {
      process: '运行监控', failureMode: '看门狗失效导致死机后无复位',
      effect: '控制器永久失去响应，功能不可用',
      cause: '喂狗逻辑错误；看门狗时钟源失效无冗余',
      severity: 8, occurrence: 3, detection: 3,
      owner: '软件', rpn: 8 * 3 * 3,
    },
    {
      process: '标定管理', failureMode: '标定数据损坏导致控制参数错误',
      effect: '发动机/底盘控制输出异常',
      cause: '标定校验和缺失；刷写中断无恢复',
      severity: 8, occurrence: 2, detection: 3,
      owner: '标定 / 软件', rpn: 8 * 2 * 3,
    },
    {
      process: '非易失存储', failureMode: 'EEPROM/Flash 写磨损导致配置丢失',
      effect: '用户设置/学习值丢失，功能异常',
      cause: '无磨损均衡；写入频率过高',
      severity: 6, occurrence: 3, detection: 3,
      owner: '软件 / 硬件', rpn: 6 * 3 * 3,
    },
  ],
  ADAS: [
    {
      process: '环境感知', failureMode: '摄像头/雷达误检或漏检目标',
      effect: '危险目标未识别，AEB/ACC 功能失效',
      cause: '感知算法边界不足；传感器标定漂移',
      severity: 9, occurrence: 3, detection: 4,
      owner: '感知算法 / 系统', rpn: 9 * 3 * 4,
    },
    {
      process: '传感器融合', failureMode: '多传感器融合输出错误（目标位置/速度错）',
      effect: '危险目标误判，触发错误决策',
      cause: '融合权重配置错误；时间戳未对齐',
      severity: 9, occurrence: 2, detection: 4,
      owner: '融合算法', rpn: 9 * 2 * 4,
    },
    {
      process: '执行控制', failureMode: '紧急制动/转向干预误触发',
      effect: '非预期减速或转向，引发次生事故',
      cause: '决策阈值过于激进；安全冗余缺失',
      severity: 9, occurrence: 2, detection: 4,
      owner: '功能安全 / 控制', rpn: 9 * 2 * 4,
    },
  ],
  BMS: [
    {
      process: '电池保护', failureMode: '过充/过放保护失效',
      effect: '电池损伤甚至热失控',
      cause: '电压采样故障未冗余；保护阈值被绕过',
      severity: 10, occurrence: 2, detection: 4,
      owner: 'BMS 软件 / 硬件', rpn: 10 * 2 * 4,
    },
    {
      process: '状态估算', failureMode: 'SOC/SOH 估算漂移',
      effect: '续航里程误判，电量耗尽风险',
      cause: '库仑计漂移；开路电压模型偏差',
      severity: 7, occurrence: 3, detection: 3,
      owner: 'BMS 算法', rpn: 7 * 3 * 3,
    },
    {
      process: '热管理', failureMode: '电池温度超限无降功率/告警',
      effect: '高温加速老化或热失控',
      cause: '温度传感器失效；热管理策略缺失',
      severity: 9, occurrence: 2, detection: 3,
      owner: 'BMS / 热管理', rpn: 9 * 2 * 3,
    },
  ],
  '域控制器': [
    {
      process: '任务调度', failureMode: '关键任务优先级反转/调度延迟',
      effect: '安全相关控制响应超时',
      cause: '实时性设计缺陷；负载过载无降级',
      severity: 8, occurrence: 3, detection: 3,
      owner: '软件 / 系统', rpn: 8 * 3 * 3,
    },
    {
      process: '资源管理', failureMode: '内存/CPU 耗尽导致服务降级',
      effect: '部分功能不可用，用户体验与安全受影响',
      cause: '内存泄漏；资源上限缺失',
      severity: 7, occurrence: 3, detection: 3,
      owner: '软件', rpn: 7 * 3 * 3,
    },
    {
      process: '跨域通信', failureMode: '域间通信故障导致功能降级',
      effect: '整车功能协同失效',
      cause: '通信中间件故障；超时重试机制缺失',
      severity: 7, occurrence: 3, detection: 3,
      owner: '软件 / 系统', rpn: 7 * 3 * 3,
    },
  ],
  网关: [
    {
      process: '报文路由', failureMode: '路由规则错误导致报文未转发/错转发',
      effect: '跨域信号丢失，功能链路中断',
      cause: '路由表配置错误；信号映射未验证',
      severity: 8, occurrence: 3, detection: 3,
      owner: '网关软件', rpn: 8 * 3 * 3,
    },
    {
      process: '访问控制', failureMode: '防火墙规则缺失导致非法访问',
      effect: '外部攻击可进入车内网络',
      cause: '默认放行策略；规则未评审',
      severity: 9, occurrence: 2, detection: 4,
      owner: '网络安全 / 网关', rpn: 9 * 2 * 4,
    },
    {
      process: '密钥管理', failureMode: '密钥泄露/轮换失败',
      effect: '通信可被解密或伪造',
      cause: '密钥存储不安全；轮换流程缺失',
      severity: 9, occurrence: 2, detection: 4,
      owner: '网络安全', rpn: 9 * 2 * 4,
    },
  ],
  传感器: [
    {
      process: '信号质量', failureMode: '传感器标定漂移导致测量偏差',
      effect: '控制策略基于错误输入，功能异常',
      cause: '长期漂移未补偿；自校准缺失',
      severity: 7, occurrence: 3, detection: 3,
      owner: '硬件 / 软件', rpn: 7 * 3 * 3,
    },
    {
      process: '输出特性', failureMode: '输出饱和/死区导致信号失真',
      effect: '测量值不反映真实物理量',
      cause: '量程设计不足；异常值未钳位',
      severity: 7, occurrence: 3, detection: 3,
      owner: '硬件', rpn: 7 * 3 * 3,
    },
    {
      process: '连接可靠性', failureMode: '连接器接触不良导致间歇性失效',
      effect: '偶发信号丢失，难以复现与定位',
      cause: '端子工艺不良；振动环境下接触电阻增大',
      severity: 7, occurrence: 3, detection: 4,
      owner: '硬件 / 质量', rpn: 7 * 3 * 4,
    },
  ],
  '车载信息娱乐': [
    {
      process: '系统稳定性', failureMode: '系统崩溃/黑屏导致功能不可用',
      effect: '导航/娱乐功能中断，影响用户体验',
      cause: '应用内存泄漏；驱动兼容问题',
      severity: 5, occurrence: 3, detection: 3,
      owner: '软件', rpn: 5 * 3 * 3,
    },
    {
      process: '数据安全', failureMode: '蓝牙/WiFi 连接导致用户数据泄露',
      effect: '隐私数据外泄，合规风险',
      cause: '通信未加密；权限模型缺陷',
      severity: 7, occurrence: 2, detection: 4,
      owner: '网络安全 / 软件', rpn: 7 * 2 * 4,
    },
    {
      process: 'OTA 升级', failureMode: 'OTA 更新失败导致软件版本不一致',
      effect: '功能回退或系统无法启动',
      cause: '升级包校验缺失；断点续传失败',
      severity: 7, occurrence: 2, detection: 3,
      owner: '软件 / 系统', rpn: 7 * 2 * 3,
    },
  ],
  '其他': [],
};

export const FMEA_TEMPLATES: Record<string, FmeaTemplate[]> = { default: COMMON_AUTO, ...TYPE_TEMPLATES };

// 按项目系统类型取模板集合：类型特色在前，通用汽车电子模板兜底在后
export function templatesFor(sysType?: string): FmeaTemplate[] {
  const specific = sysType ? FMEA_TEMPLATES[sysType] : undefined;
  return specific && specific.length ? [...specific, ...COMMON_AUTO] : COMMON_AUTO;
}

// 简化类型（模板用）
interface FmeaItemLite {
  process: string; failureMode: string; effect: string; cause: string;
  severity: number; occurrence: number; detection: number; rpn: number;
  owner: string;
}
