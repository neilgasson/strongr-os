# M0/M1/M2.0 Authorization Matrix

| Operation | Required permission | AAL2 | Direct table write |
|---|---|---:|---:|
| Read tenant records | Active membership | No | Read only |
| Create brief/draft | `content.create` | No | No |
| Submit version | `content.submit` | No | No |
| Create review policy | `role.manage` | Yes | No |
| Record Scripture evidence/review | `review.scripture` | Yes | No |
| Record rights/editorial review | `review.editorial` | Yes | No |
| Record theology review | `review.theology` | Yes | No |
| Record automated checks | `service_role` | Server | No |
| Grant approval | `approval.grant` | Yes | No |
| Revoke approval | `approval.revoke` | Yes | No |
| Create production package | `export.request` | Yes | No |
| Request AI generation | `content.create` | No | No |
| Read audit evidence | `audit.read` | No | Read only |
| Claim/fail/ack outbox delivery | `service_role` | Server | No |
| Write worker heartbeat | `service_role` | Server | No |
| Read cross-tenant operational health/metrics | `service_role` | Server | No |
| Read M2 output specifications | Authenticated session | No | Read only |
| Read own-tenant M2 job/artifact/review/staging metadata | Active membership | No | Read only |
| Read one canonical private media object | Active membership plus exact canonical artifact path | No | Storage read only |
| Request media for an exact package | `media.request` | Yes | No; command deferred to M2.1 |
| Record human media/accessibility review | `media.review` | Yes | No; command deferred to M2.2 |
| Create staged release bundle | `release.stage` | Yes | No; command deferred to M2.2 |
| Revoke staged release authority | `release.revoke` | Yes | No; command deferred to M2.2 |
| Create media attempt/artifact/reconciliation evidence | `service_role` | Server | No; commands deferred to M2.1 |
| Upload media bytes | Future M2.1 worker command boundary | Server | Supported Storage API only |
| Upload, overwrite, delete, list, or obtain public media URL in browser | Not permitted | N/A | No |

The UI is never an authorization boundary. Command functions re-evaluate the
active organization membership and permission inside the database transaction.
`anon` and `authenticated` cannot execute worker or operational functions.

M2.0 registers permission definitions and read boundaries only. It grants no
M2 mutation function to any role and grants no application Storage insert,
update, or delete policy. Later stages must introduce each command in a
separately reviewed migration with fixed search paths, in-body authorization,
exact role grants, and positive/negative pgTAP coverage.
