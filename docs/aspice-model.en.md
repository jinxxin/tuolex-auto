# A-SPICE Process Model (How This Project Models It)

**简体中文** ｜ [English](aspice-model.en.md)

> Note: this document describes **how we model the process structure**. It is not the text of the standard, and it does not constitute an interpretation of the standard.
> Please purchase the official standard from VDA QMC; clause interpretation follows the published text.

## 1. Modeling scope

This project models the A-SPICE **process reference model** as a tree that can carry evidence:

```
Process group → Process → Work product (WP) → Evidence (document / review / signature / change)
```

Built-in process groups (examples):

| Group | Processes (examples) |
|---|---|
| SYS | SYS.1 Requirements elicitation, SYS.2 System requirements analysis, SYS.3 System architectural design, SYS.4 System integration and integration test, SYS.5 System qualification test |
| SWE | SWE.1 Software requirements analysis, SWE.2 Software architectural design, SWE.3 Software detailed design and unit construction, SWE.4 Software unit verification, SWE.5 Software integration and integration test, SWE.6 Software qualification test |
| SUP | SUP.1 Quality assurance, SUP.2 Verification, SUP.4 Joint review, SUP.5 Change request management, SUP.7 Document management, SUP.8 Configuration management, SUP.9 Problem resolution management |
| MAN | MAN.3 Project management, MAN.5 Risk management, MAN.6 Measurement |
| ACQ/SPL | Acquisition and supply (enabled as needed) |

> The **names** of processes and work products are common industry terms; this project does not include any clause text from the standard.

## 2. How capability levels are handled

- Each process has a `processStatus` within a project: not started / in progress / achieved;
- Achievement is not decided by ticking a box, but by **whether the evidence is closed**: the work product exists + the review has passed + (where required) the signature is valid + changes are traceable;
- Broken-link detection lists: requirements without a source, requirements without verification, deliverables without review, reviews with an invalid signature.

This is an **engineering approximation** for internal self-checks and audit preparation. It is not equivalent to a formal assessment result.

## 3. How this differs from an assessment (important)

| Formal assessment | This tool |
|---|---|
| Performed by certified assessors according to the PAM | Performed by the team itself |
| Sampling interviews + evidence checks + rating | Rule-based broken-link detection + evidence index |
| Issues a capability level conclusion | **Issues no conclusion**, only a gap list |

## 4. Data model (simplified)

- `processes`: process catalog (code/name/group)
- `work_products`: work product instances (linked to project, process, status, documents)
- `requirements` / `test_cases` / `trace_links`: requirements, tests and traceability
- `vdocs` / `signatures` / `audit_logs`: documents, signatures, hash-chained audit

## 5. Extension

Adding a process: add an entry in `server/src/data/processes.ts` (no schema change needed).
Adding a work product template: `server/src/data/wpTemplates.ts`.
