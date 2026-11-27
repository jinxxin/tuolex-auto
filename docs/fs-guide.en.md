# Functional Safety Module Guide (tuoleX auto · ISO 26262)

[简体中文](fs-guide.md) ｜ **English**

- **Applies to**: the functional safety domain in the Community Edition (tuoleX auto, ISO 26262:2018, second edition)
- **Built-in standard capabilities**: ASIL determination table (ISO 26262-3 Table 4, 36 cells + short-circuit rules), ASIL decomposition rules (26262-9), and hardware architectural metric targets (26262-5) — built in and directly viewable (HARA page "ASIL determination table", decomposition wizard, FMEDA target comparison) for review and self-checks
- **Positioning**: a **work product and evidence chain management tool** for functional safety engineering — the platform manages work products and traceability; it does not replace a conformity judgment by a certification body

---

## 1. Module overview

The functional safety domain is a built-in module of tuoleX auto (navigation group "Functional Safety", 7 pages). It covers the ISO 26262:2018 engineering loop from concept to safety case:

```
HARA hazard analysis and classification (S/E/C → ASIL)
   ↓ each hazard event with an ASIL → safety goal SG
Safety requirement chain (SG → FSC → TSC → hardware/software safety requirements,
ASIL propagates along the chain, X(Y) decomposition supported)
   ↓
Safety analysis (FMEDA hardware metrics / FTA fault tree / DFA dependent failures
+ decomposition consistency)
   ↓
Safety Case (GSN argument tree + evidence back-links + gap scan)
Cross-cutting: confirmation measures (CR/Audit/FSA + independence),
safety plan (lifecycle tailoring), audit package export
```

**Shared platform foundation**: server-side hash-chained audit (tamper-evident), electronic signatures, reviews, online documents, bilingual UI.

**Standard scope boundaries**: covers the management and development work products of Parts 2/3/4/5/6/8/9; **excludes** Part 7 (production and operation) and Part 12 (motorcycles); the Part 11 (semiconductors) data model is reserved but not expanded. Adjacent standards: SOTIF (21448) and cybersecurity (21434) are linked through reference fields/FMEA templates, not as separate modules.

## 2. Quick start

1. **Enable the functional safety domain**: project list → create/edit project → tick "Functional Safety (ISO 26262)". Existing A-SPICE projects can be enabled at any time (both domains run side by side).
2. Open "Functional Safety → FS Overview" and confirm a project is selected (the project dropdown at top right lists only fsEnabled projects).
3. Recommended path: **HARA analysis** (template or manual hazards) → confirm classification → **safety requirement chain** (one-click SG+FSC+TSC skeleton) → **safety analysis** (FMEDA/FTA/DFA) → **Safety Case** (generate argument skeleton, attach evidence, scan gaps) → **confirmation measures / safety plan** → Overview "Export audit package".
4. Demo data: the full ADAS AEB main line is built in (4 confirmed HARA entries → 15 requirement nodes → two FMEDA examples, one meeting and one missing targets → Safety Case evidence attached → confirmation measures → plan).

## 3. Glossary (minimal set)

| Term | Meaning | Page |
|---|---|---|
| HARA | Hazard analysis and risk assessment: hazard × situation → S/E/C → ASIL | HARA |
| S/E/C | Severity / Exposure / Controllability | HARA |
| ASIL | Automotive Safety Integrity Level QM/A/B/C/D (D is highest) | All modules |
| SG | Safety goal (vehicle-level safety requirement, **not decomposable**) | Safety chain |
| FSC/TSC | Functional safety concept / technical safety concept | Safety chain |
| HW_SR/SW_SR | Hardware/software safety requirements (26262 Parts 5/6) | Safety chain |
| X(Y) | Decomposition notation: argued at level Y, developed at level X (e.g. B(D)) | Safety chain |
| FMEDA | Failure mode effects and diagnostic analysis → SPFM/LFM/PMHF metrics | Safety analysis |
| FTA/DFA | Fault tree analysis / dependent failure analysis (mandatory for independence arguments) | Safety analysis |
| GSN | Goal Structuring Notation (Goal → Strategy → Solution) | Safety Case |
| CR/Audit/FSA | Confirmation review / functional safety audit / functional safety assessment (three types of confirmation measures) | Confirmation measures |
| I0-I3 | Independence levels (I0 different person → I3 different department/organization) | Confirmation measures |

## 4. Page-by-page operations

### 4.1 HARA (/fs/hara)

**What it does**: enter hazard events, classify them by the three S/E/C parameters (the engine computes ASIL in real time), confirm the classification (assessment baseline), and export the worksheet.

**Operations**:
1. **Add a hazard**: fill in the hazard event title, vehicle-level hazard, and operational situation; select S/E and C (the dropdowns include definitions for each level) — the ASIL badge updates in real time (determination table = ISO 26262-3 Table 4).
2. **Import from templates**: tick and import ADAS/BMS/generic templates in bulk (S/E/C values are **suggested references** and need engineering confirmation).
3. **Every row is a work item**: click the ID/row → detail drawer on the right (all fields + definitions of the three parameters + audit timeline).
4. **Confirm the classification**: the rationale is mandatory (HARA report evidence); once confirmed, the hazard becomes a candidate for SG generation.
5. **Manual override**: for special arguments (e.g. a QM argument for a low-probability combination under clause 6.4.3.11) → enable the override switch → select the ASIL manually + **the override reason is mandatory** (recorded in the audit trail).
6. **ASIL determination table**: top-right "ASIL determination table" for read-only comparison (36 cells + note a), making reviews transparent.
7. **Export the HARA sheet**: Excel with 3 sheets (data / determination table / parameter definitions); an EXPORT audit entry is written automatically.

**Domain notes**: HARA **does not consider safety mechanisms internal to the item** (those are subsequent measures); classification should be **conservative** (when in doubt, take the higher level); S/E/C are engineering judgments — the platform provides calculation support and a traceable record.

### 4.2 Safety requirement chain (/fs/safety-chain)

**What it does**: maintain the SG→FSC→TSC→hardware/software requirement tree, propagate ASIL along the chain, support decomposition, and automatically scan chain completeness.

**Operations**:
1. **Generate SGs from HARA**: tick confirmed hazards → generate SG drafts (optionally include the FSC/TSC skeleton in one three-layer step); the hazard's sgId is written back automatically.
2. **Tree operations** (icons to the right of a node): open work item details / add child (allowed types depend on the parent) / edit / **ASIL decomposition** / void / delete.
3. **Add/edit**: children **inherit the parent's ASIL** by default; if inheritance is turned off and a manually selected ASIL is **higher than the parent's, a warning is shown** (no silent upgrades on the chain); for leaves (hardware/software/system safety requirements/HSI) filling in a **verification method** is recommended (a chain-completeness check item).
4. **ASIL decomposition wizard**: for FSC/TSC etc. (not SG) → choose a combination scheme (default dual redundancy B(D)+B(D); also C+A, D+QM, etc.; validity checked against 26262-9 Table 1) → select a hand/hardware type for each path + an independence statement is mandatory → generate X(Y) child requirements and record the decomposition on the parent. Note: QM(X) paths must argue independence and some assessors remain reserved about them; hardware metrics and confirmation-measure independence **follow the original level before decomposition**.
5. **A-SPICE mapping links** (see §5): create links quickly inside the requirement detail drawer using the recommended target layer.
6. **Chain gap card** (top-right statistics): click to see details (SG without FSC / FSC without TSC / TSC without hardware/software requirements / leaf without verification method / ASIL upgrade / dangling node); it turns green when gaps are closed.

### 4.3 Safety analysis (/fs/analysis, three tabs)

**FMEDA metrics workbench**:
1. Create an analysis: analysis target (e.g. AEB controller) + target ASIL (B/C/D have quantitative targets; A/QM do not).
2. Fill in failure data row by row: component / failure mode / **failure classification** (residual single-point / latent / detected safe / no effect QM) / λ (FIT) / DC% / safety-related toggle / safety mechanism.
3. **Live metrics** at the bottom: SPFM/LFM/PMHF + target comparison (level D: PMHF < 10 FIT, SPFM ≥ 99%, LFM ≥ 90%) + target verdict. Convention: numerator = single-point + latent; denominator = all safety-related rows (including safe rows); **QM rows (safety-related toggle off) are excluded entirely** — consistent with ISO 26262-5 C.2 / TI calculation examples.
4. Note: the platform uses a simplified linear model (Annex C approximation); for complex architectures, re-check with a full probabilistic model manually (marked in the UI).
5. Shortcut: while editing, insert **common failure template** rows for the analysis target in one click (MCU / power supply / sensor / watchdog).

**FTA**: top event + ASIL; recursive editing (AND/OR gates, basic events may optionally carry λ); live text preview. AND = triggers only if all occur; OR = triggers if any occurs.

**DFA dependent failures**: element-pair matrix (A/B + cascading / common cause / interaction + coupling details + mitigation); **consistency check at the top of the page**: every ASIL decomposition claim in the project (e.g. TSC-001) must be referenced by the text of at least one DFA row, otherwise a yellow warning bar appears — adding the reference turns it green (assessors always check the independence argument for decompositions).

### 4.4 Safety Case (/fs/safety-case)

**What it does**: organize the argument and evidence for "the system's functional safety is acceptable" as a GSN argument tree.

**Operations**:
1. Create a case → one top-level Goal (claim) by default.
2. Node row: type (Goal / Strategy / Solution evidence / Context / Assumption / Justification) + text + actions:
   - A Goal can be marked **undeveloped ◇** (a draft placeholder; the gap scan will find it)
   - For a Solution, click "Attach evidence" → choose the evidence type (10 kinds of platform artifacts: FS requirements / HARA hazards / FMEDA / FTA / DFA / A-SPICE requirements / test cases / FMEA / verification documents / work products) → choose the object → the evidence can be clicked to return to its source
   - A Goal can be **signed off** (person and time recorded)
3. **One-click argument skeleton** (template: hazards controlled → strategy sub-arguments → Solution placeholders), then fill in evidence one by one.
4. **Scan gaps**: undeveloped claims / strategies without support / unattached evidence → details in a modal; the gap count in the list matches the scan (live).
5. Status flow: draft → under review → approved (final state).

### 4.5 Confirmation measures (/fs/confirm)

Three types: **confirmation review CR** (key work products such as FSC/TSC), **functional safety audit Audit** (process), and **functional safety assessment FSA** (the item as a whole, the highest level). Each entry includes:
- Relevant ASIL + **independence I0-I3** (a suggested default by ASIL at creation: D→I3, B/C→I2, A/QM→I1; adjustable; the standard table is subject to project tailoring and assessor requirements)
- Status flow: planned → in progress → closed (recorded in the audit trail)
- FSA conclusion in three states: accepted / conditionally accepted / rejected (recorded in the assessment conclusion)
- Recommendation: schedule CRs at key points such as HARA / requirement chain / Safety Case; complete the FSA before release (usually mandatory for levels C/D).

### 4.6 Safety plan (/fs/plan)

Lifecycle task list (preset phases: concept / system / hardware / software / integration and verification, plus free phases):
- Task / deliverable / ASIL / owner / due date; status: planned → in progress → completed.
- **NA tailoring**: if a phase does not apply (e.g. no hardware development) → mark it NA and **the tailoring rationale is mandatory** (assessors often ask "why was this not done").

### 4.7 FS overview (/fs/overview)

Domain cockpit: aggregated status of the four phases (HARA confirmation rate and ASIL distribution / requirement chain and gaps / FMEDA target hit rate and decomposition coverage / case evidence, confirmation measures and plan progress) + a quick view of open gaps (click to jump to the page) + module entries + **Export audit package** (10-sheet xlsx: HARA / requirement chain / FMEDA + details / FTA / DFA / Safety Case nodes / confirmation measures / safety plan / audit trail, newest first).

## 5. Integration with A-SPICE (mapping rules)

**Why it is needed**: in dual-domain projects (A-SPICE process + functional safety), ISO 26262 safety requirements must be realized and verified by A-SPICE engineering requirement items — at assessment, "are safety requirements covered by engineering items, bidirectionally traceable" is mandatory evidence.

**Layer mapping rules** (development and analysis conclusions, implemented in `core/fs/aspiceMap.ts`; the UI recommends accordingly):

| FS layer (safety requirement) | Maps to A-SPICE req_items layer | A-SPICE process context | Basis |
|---|---|---|---|
| SG safety goal | Direct link not recommended (may link tests/documents) | Upstream of SYS.1 | SG is at vehicle hazard level; req_items has no corresponding layer |
| FSC functional safety concept | sys_req (system requirements) | SYS.1/SYS.2 | FSRs land in the safety-related part of system requirements |
| TSC technical safety concept | sys_req (optionally sys_arch) | SYS.2/SYS.3 | TSR technical requirements / architectural measures |
| SYSTEM_SR system safety requirement | sys_req | SYS.2 | Same-layer coverage |
| HW_SR hardware safety requirement | hw_req | HWE.1 (4.0) / V-model hw_req | 26262-5 ↔ HWE.1 |
| **SW_SR software safety requirement** | **sw_req** | **SWE.1** | 26262 Part 6 ↔ SWE.1 safety-related software requirements (most typical) |
| HSI hardware-software interface | sys_arch / sw_req | SYS.3/SWE.1 | Interface specification requirements |

**How to use**:
1. FS requirement detail drawer → "A-SPICE mapping links" section → shows the recommended layer for the current type (Tag with process context) → target layer (defaults to the recommendation, can switch to all) → candidate item dropdown (searchable) → "Create link".
2. Links are recorded in trace_links (relation "refines"), **bidirectionally**: on the A-SPICE requirement side (work item / traceability panel) FS links are equally visible and can be created in reverse (including FS requirements / hazards / analyses entities).
3. Unlink: remove links one by one in the linked list (recorded in the audit trail).
4. Practical advice: keep SGs at the concept level (do not map them into req_items); create one-to-many refinement links between SW_SR and SWE.1 software requirement items; back-link test cases from the safety requirement side by attaching tc (verification coverage evidence then goes into the Safety Case).

## 6. AI scaffold (built-in template library)

Provided by a **built-in template library** (= the degraded content used when the cloud has no AI key; identical locally, so behavior is consistent):
- Package-style HARA generation (four sets: ADAS AEB/ACC, BMS, generic electronics; each with several hazards + S/E/C suggestions)
- Confirmed hazards → three-layer SG+FSC+TSC skeleton (batch)
- Common FMEDA failure rows (matched by component)
- Safety Case argument skeleton (Goal → Strategy → Solution)

**Hard rule**: everything generated is a **draft**. S/E/C, ASIL and metrics all require engineering confirmation — AI/templates never produce confirmed safety data directly.

## 7. Audit and compliance

- **Hash-chained audit**: every write to an fs entity is automatically recorded in the server-side audit (create/update/delete/confirm/void/link/export), tamper-evident; the detail drawer shows the item-level trail; Overview "Export audit package" includes an audit sheet.
- **Electronic signatures**: key work products can be signed off through online documents / the signature center (platform foundation; FS reports go through the signing flow after export).
- **Assessment view**: hand over an evidence package = Overview → Export audit package (all work products + audit trail) → together with Safety Case evidence back-links and confirmation-measure closure records.
- The platform **does not judge conformity**: ASIL/metric conclusions are engineering judgments; the engine provides calculations and target comparisons, and edge cases keep manual overrides/rationale records.

## 8. Bilingual

Language switch zh/en at top right; all FS pages and messages are bilingual (an EN-mode scan guards against leftover Chinese). Terms are shown in English with Chinese tooltips (ASIL/HARA and other industry-standard wording, to avoid ambiguity in translation). Demo data content is in Chinese (data, allowed).

## 9. FAQ / common misconceptions

| Question | Explanation |
|---|---|
| Can the platform "certify" ISO 26262? | No. The platform manages the evidence chain; assessment bodies (SGS/TÜV/CATARC etc.) make the judgment. |
| Can safety mechanisms be counted in HARA to lower the ASIL? | No. HARA assesses the fault behavior itself; safety mechanisms are measures of the subsequent safety concept. |
| What if I am unsure about the classification? | Be conservative and take the higher level (standard principle); for edge cases (e.g. S3+E1+C3) use a manual override with a recorded rationale per note a. |
| Does QM mean "nothing to do"? | No. QM = no further 26262 activities, but quality management system requirements still apply. |
| Is decomposition just a way to lower the level? | No. Decomposition requires redundancy + independence (argued by DFA); metrics and confirmation measures still follow the original level before decomposition. |
| Are FMEDA metrics exact values? | The model is simplified (linear approximation); complex architectures (multiple fault paths / repair rates) need re-checking with a full probabilistic model (marked in the UI). |
| My project has no A-SPICE requirement items? | FS-only projects can skip linking; linking adds value in dual-domain projects (§5). |
| The Safety Case has many gaps? | That is a normal state while iterating: ◇ undeveloped / no evidence / strategy without support are all listed; they turn green when completed. |

## 10. Boundaries and disclaimer

- The built-in standard knowledge is **our own summaries / public facts** (not ISO text); terminology follows the English original (Chinese translations are for understanding only).
- S/E/C classification, ASIL determination and metric conclusions are **engineering judgments**; the platform records the process and basis for assessor review.
- Demo data is derived from public cases and marked "example, requires engineering confirmation"; it must not be used directly as a conclusion for a real project.
- For further customization (Part 11 semiconductor templates, SOTIF scenario libraries, assessor report formats), contact jinxxin@live.com.
