# M0.2 Acceptance Evidence

This directory defines the evidence contract. Generated run logs must be
attached to the draft pull request or its CI artifact, not committed with
credentials or personal data.

Every accepted run records:

- exact Git commit SHA;
- pull request number and head SHA;
- target environment (`local`, `strongr-os-dev`, or disposable restore);
- migration versions;
- original 17-test result;
- new pgTAP totals;
- concurrency result;
- exact-replay and changed-request idempotency results;
- remote two-user, inactive-member, revoked-role, and AAL results;
- concurrent outbox leasing result;
- outbox result;
- poison-message/operator-visibility result;
- migration failure and exact forward-repair replay results;
- backup/restore archive hash and duration;
- health and metrics snapshot;
- GitHub protection result;
- UTC timestamps; and
- reviewer and owner approval.

`acceptance-record.template.json` is the canonical final record shape.

M0.2 remains incomplete while any value is `pending`, any test failed, the
head SHA differs from the tested SHA, or the owner approval is absent.
