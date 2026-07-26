# M1 Acceptance Evidence

This directory defines the final M1 evidence contract. Generated logs and
runtime artifacts belong in GitHub Actions artifacts, not in Git, and must
never contain credentials, connection strings, temporary emails, passwords,
draft bodies, or private database errors.

The committed acceptance record must bind:

- the M1.3 implementation baseline and final tested pull-request head;
- all eight repository migrations and their local exactly-once replay;
- the two guarded M1 remote migration-delta versions;
- real local and `strongr-os-dev` application workflow results;
- tenant isolation, anonymous denial, browser DML denial, and service-role
  isolation;
- durable failure/retry recovery and immutable draft creation;
- all eight automated checks and the blocking transcript-readiness check;
- separate human evidence and three review lanes;
- real AAL1 denial and AAL2 approval/package success;
- exact version, approval evidence-bundle, and package-manifest hashes;
- revocation and post-revocation package denial;
- health, metrics, privacy, cleanup, and failure-artifact preservation;
- exact workflow, job, artifact, commit, PR, and UTC identifiers; and
- explicit owner acceptance.

`acceptance-record.template.json` remains pending while any gate or identifier
is pending. The implementation pull request does not itself authorize
deployment, publication, production acceptance, or changes to Strongr Daily.
