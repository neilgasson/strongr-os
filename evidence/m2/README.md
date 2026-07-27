# M2 acceptance evidence

`acceptance-record.template.json` defines the immutable closure record for M2.
The accepted record is created only after:

- the exact M2.3 implementation head and protected-main merge are identified;
- `M2 acceptance / local` passes on protected `main`;
- the explicitly dispatched `M2 acceptance / strongr-os-dev` job passes;
- both jobs upload checksummed evidence, including the encrypted media backup;
- the required-check ruleset is verified on its final configuration; and
- the repository owner's standing M2 authority and all security conditions are
  satisfied.

The record contains identifiers, hashes, counts, timings, and outcomes. It
must not contain database URLs, API keys, JWTs, passwords, encryption keys,
plaintext media, private content, or personal data.

`acceptance-record.json` is the canonical accepted record. It binds the exact
protected-main commit to the required checks, clean local replay,
non-production remote proof, encrypted byte-recovery evidence, preserved
failure artifact, and active GitHub ruleset.
