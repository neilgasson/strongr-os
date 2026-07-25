# M0/M1 Authorization Matrix

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

The UI is never an authorization boundary. Command functions re-evaluate the
active organization membership and permission inside the database transaction.
