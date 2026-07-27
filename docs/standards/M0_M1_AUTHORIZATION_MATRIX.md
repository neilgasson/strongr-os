# M0/M1/M2.3 Authorization Matrix

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
| Request media for an exact package | `media.request` | Yes | No; `m2_request_media` only |
| Record human media/accessibility review | `media.review` | No | No; `m2_record_media_review` only |
| Create staged release bundle | `release.stage` | Yes | No; `m2_stage_release` only |
| Revoke staged release authority | `release.revoke` | Yes | No; `m2_revoke_staged_release` only |
| Create media attempt/artifact/reconciliation evidence | `service_role` | Server | No; exact M2.1 worker commands only |
| Upload media bytes | `service_role` worker | Server | Supported write-once Storage API only |
| Inventory, back up, restore, and remove exact acceptance-fixture bytes | `service_role` acceptance runtime | Server | Supported Storage API; exact random fixture prefix only |
| Upload, overwrite, delete, list, or obtain public media URL in browser | Not permitted | N/A | No |

The UI is never an authorization boundary. Command functions re-evaluate the
active organization membership and permission inside the database transaction.
`anon` and `authenticated` cannot execute worker or operational functions.

M2.2 grants human review at the assurance level approved in the M2 scope and
requires real AAL2 for staging and revocation. Exact private object retrieval
requires an authenticated operation, canonical artifact metadata, and current
tenant membership. Bucket listing and all browser Storage mutation remain
denied. No application role receives direct M2 table DML, and the service role
does not receive human review, staging, or revocation authority.
