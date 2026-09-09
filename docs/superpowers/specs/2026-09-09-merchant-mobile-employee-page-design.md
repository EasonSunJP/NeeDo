# Merchant Mobile Employee Page Design

## Goal

Align the merchant mobile employee list and detail flow with the approved screenshots and the existing formal Store Admin employee contract.

## Approved interaction

- The employee-list header is one shared fullscreen header surface. Its first row contains Back, employee search, and Close. Its second row contains All, Staff, Temporary, and Review.
- All is the union of Staff and Temporary; Review is a separate formal technician-application queue and is never mixed into employee counts or role groups.
- The employee page does not render the shared bottom navigation.
- Employee links use the canonical technician NeeDoID. Detail uses `/merchant-admin/employees/:needoId` plus the existing compensation, payroll-policy, schedule, and timeline APIs.
- The detail header contains both shared Back and Close controls. Explanatory copy is available through the shared info affordance instead of a visible subtitle.
- Detail content reuses `EmployeeDetailCard`, including explicit edit-mode controls for profile, affiliation, compensation, and payroll policy.

## Visual structure

```text
+--------------------------------------------------+
| [Back] [ Search employee / NeeDoID / status ] [X]|
| [ All ] [ Staff ] [ Temporary ] [ Review ]       |
+--------------------------------------------------+
| employee statistics / role sections              |
| or formal review queue                            |
+--------------------------------------------------+

+--------------------------------------------------+
| [Back] Employee name [i]                     [X] |
+--------------------------------------------------+
| employee identity hero                            |
| detail tabs without an extra enclosing capsule    |
| active detail panel at the widest safe inset      |
+--------------------------------------------------+
```

## Data and safety boundary

- No mock, placeholder API, schema, migration, or remote operation is added.
- The existing merchant-scoped APIs and RBAC remain authoritative.
- The current legacy technician list is fully paginated before classification, preventing the prior first-100 join failure.
- Search and tab filtering are presentation-only and never broaden merchant scope.

## Verification

- Red/green regression tests for the header, tab semantics, full pagination, canonical detail route, reusable employee card, close action, and flat detail tabs.
- Targeted Vitest suite, TypeScript check, production build, and mobile browser inspection on an unused port other than 5180.

