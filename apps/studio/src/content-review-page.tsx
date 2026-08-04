import { useMemo, useState } from "react";

type Status =
  | "draft" | "owner_review" | "revision_requested" | "owner_editing" | "owner_edit_complete"
  | "owner_approved" | "narration_authorized" | "audio_generated" | "audio_review"
  | "audio_accepted_private" | "release_approved";

type Item = Readonly<{
  id: string; title: string; type: string; scripture: string; status: Status; reflection: string;
  script: string; prayer: string; journal: string; practice: string; notes: string; rights: string;
  narrationRights: boolean; versions: readonly string[]; lockedHash?: string; audioReview?: PrivateAudioReview;
}>;

type ScriptureRightsRecord = Readonly<{
  sourceEdition: string;
  quotationStatus: string;
  narrationRights: string;
  appDisplayRights: string;
  publicationStatus: string;
  territoryLimitations: string;
  attribution: string;
  unresolvedQuestions: string;
}>;

type PrivateAudioReview = Readonly<{
  durationSeconds: number;
  creditsUsed: number;
  generatedAt: string;
  qaNotes: string;
  scriptHash: string;
}>;

const seeds: readonly Item[] = [
  { id: "quiet-trust", title: "Quiet Trust", type: "Guided audio reflection", scripture: "Psalm 46:10; Isaiah 30:15", status: "audio_accepted_private", reflection: "A written Quiet Trust package is approved for private narration review.", script: "Private narration-review script retained in the approved package.", prayer: "Lord Jesus, meet us with Your peace. Amen.", journal: "What concern can you bring to God?", practice: "Pause and pray.", notes: "Private narration accepted. Release remains closed.", rights: "Scripture quotation remains reference-only", narrationRights: false, versions: ["Version 3 — wording approved", "Version 2 — owner revision"], lockedHash: "Recorded in approved package" },
  { id: "renewal-1", title: "Renewal Day 1 — Return", type: "Guided audio reflection", scripture: "Psalm 51:10; 2 Corinthians 5:17", status: "owner_review", reflection: "Return begins with truth. We bring God neither a polished version of ourselves nor a promise that we will never struggle again. We come honestly, trusting that Christ meets those who turn toward Him with mercy.\n\nThe call to renewal is not a demand to earn our way back. In Jesus, repentance is a return to the One whose love has already made room for us. We can name what needs to change, receive His forgiveness, and begin again under His care.", script: "Welcome to Strongr Daily.\n\nToday we reflect on returning to God. Psalm 51:10 and 2 Corinthians 5:17 point us toward the mercy of God and the new life we receive in Christ.\n\nPerhaps there is something you have been carrying with regret: a choice, a pattern, a strained relationship, or a prayer you have avoided. You do not have to hide it from God. He already knows, and in Christ He receives those who return.\n\nReturning is not pretending the past did not matter. It is bringing the truth into the light of Jesus' mercy. He does not ask us to make ourselves worthy before we come near. He invites us to come honestly, to receive forgiveness, and to let His grace begin its work in us.\n\nTake a moment now to turn your heart toward Him. You may simply say, Lord Jesus, I return to You.\n\nWhatever has felt distant, unfinished, or ashamed in you, place it before Christ. His mercy is not reluctant. His welcome is not fragile. The One who calls us to return is the One who has opened the way for us to be received.\n\nAs you continue today, rest in this: Christ's mercy is real, and He receives those who return.", prayer: "Lord Jesus, You know the places in me that feel tired, distracted, or distant from the life You call me to live. Receive my honest return to You. Renew my heart and make my spirit steadfast in You. Give me courage to confess what is true, grace to repair what I can, and patience to continue walking with You. Thank You that Your mercy meets me here. Amen.", journal: "What do you want to bring honestly before Christ today?", practice: "Take one unhurried moment to pray: “Lord Jesus, I return to You.”", notes: "", rights: "Translation and quotation decision pending", narrationRights: false, versions: ["Version 2 — revised from owner feedback; ready for owner review", "Version 1 — ready for owner review"] },
  { id: "renewal-2", title: "Renewal Day 2 — Release", type: "Guided prayer", scripture: "1 Peter 5:7; Psalm 55:22", status: "owner_review", reflection: "Release is not denial. Some burdens are serious, and naming them before God is an act of honesty. Christ does not minimize what weighs on us; He invites us to bring it into His care.\n\nWe release what we cannot carry well, not because it no longer matters, but because Jesus is faithful and compassionate. Returning to prayer when a concern rises again is not failure. It is practising trust.", script: "Welcome to Strongr Daily.\n\nToday we bring what feels heavy into the care of Christ. First Peter 5:7 and Psalm 55:22 remind us that God welcomes the burdens we cannot carry alone.\n\nThere may be a concern that has followed you through the day: uncertainty about someone you love, a decision without a clear answer, grief, pressure, or a responsibility that feels beyond your strength. Christ does not ask you to make it seem smaller before you come to Him. He meets you with invitation and care.\n\nIn prayer, we can name the burden plainly. We can release the need to control every outcome. We can ask Jesus to hold what is beyond our reach and to guide us in what is ours to do.\n\nIf this concern returns later, you have not failed. Return to prayer again. Each return is a practice of trust: a way of placing the same real need in the faithful care of Christ.\n\nFor this moment, bring one burden before Him. Let your prayer be simple and true. Jesus, I place this in Your care.", prayer: "Faithful God, hold what is too heavy for me. Amen.", journal: "What burden do you need to place again in Christ's care?", practice: "Name one burden before Jesus, then pray: “I place this in Your care.”", notes: "", rights: "Translation and quotation decision pending", narrationRights: false, versions: ["Version 2 — revised from owner feedback; ready for owner review", "Version 1 — ready for owner review"] },
  { id: "renewal-3", title: "Renewal Day 3 — Be Still", type: "Guided Scripture reflection", scripture: "Psalm 46:10; Isaiah 30:15", status: "owner_review", reflection: "Christian stillness is not empty attention. It is a quiet turning of the heart toward the God who is present and faithful.\n\nPsalm 46:10 and Isaiah 30:15 call us to remember who God is before we are consumed by what is urgent. In Christ, quiet becomes a place to receive His care and to attend to His Word.", script: "Welcome to Strongr Daily.\n\nThis is a guided Scripture reflection on Psalm 46:10 and Isaiah 30:15. We will not add Scripture wording here while its translation and quotation decision remains open. Instead, let these references direct your attention toward God.\n\nAs you breathe, receive each breath as a gift from the Lord. Let the quiet make room for this simple truth: Jesus Christ is near, and His care is steady.\n\nYou may have brought hurry, questions, or weariness into this moment. You do not need to force them away. Turn them toward God. Ask Him to gather your attention and to make you receptive to His presence.\n\nStillness before God is not withdrawal from life. It is a way of remembering that the Lord is God and that we belong to Him.\n\nRemain for a brief moment in prayer. Lord Jesus, keep my heart turned toward You.\n\nAs you return to your day, carry this quiet confidence: Christ is with you, and His faithfulness does not depend on your ability to hold everything together.", prayer: "God of peace, meet me in the noise and unfinished places of this day. Teach me to become still before You—not to escape my responsibilities, but to receive wisdom and strength from Your presence. Quiet the urgency that keeps me from listening. Give me clarity for what You are asking of me and grace to entrust the rest to You. Help me walk forward in faithful obedience. Amen.", journal: "Where do you need to turn your attention toward God today?", practice: "Set aside three minutes to sit before God and pray, “Lord Jesus, keep my heart turned toward You.”", notes: "", rights: "Translation and quotation decision pending", narrationRights: false, versions: ["Version 2 — revised from owner feedback; ready for owner review", "Version 1 — ready for owner review"] },
];

const approvedRenewalScriptHashes: Readonly<Record<string, string>> = {
  "renewal-1": "4138096b8d2b431e48b5c1b2a687a861624389e1c2af90d43ddd0cbaa4129432",
  "renewal-2": "ca23187fef3fb924ec9881823d67445a54c36084d293abb5c07fe6218f8a9ce1",
  "renewal-3": "e8485d755450b39c3857b1bbbbdb5706b65bcaa749b1b94be0aef5ad241f191b",
};

const renewalPrivateAudioReviews: Readonly<Record<string, PrivateAudioReview>> = {
  "renewal-1": { durationSeconds: 83.408924, creditsUsed: 1108, generatedAt: "2026-08-03", scriptHash: "4138096b8d2b431e48b5c1b2a687a861624389e1c2af90d43ddd0cbaa4129432", qaNotes: "Generated once from the verified locked Stronger Daily script. Reference-only: no KJV verse wording, music or sound effects. Awaiting Neil’s private listening review." },
  "renewal-2": { durationSeconds: 71.471, creditsUsed: 975, generatedAt: "2026-08-03", scriptHash: "ca23187fef3fb924ec9881823d67445a54c36084d293abb5c07fe6218f8a9ce1", qaNotes: "Generated once from the verified locked Stronger Daily script. Reference-only: no KJV verse wording, music or sound effects. Awaiting Neil’s private listening review." },
  "renewal-3": { durationSeconds: 69.22445, creditsUsed: 988, generatedAt: "2026-08-03", scriptHash: "e8485d755450b39c3857b1bbbbdb5706b65bcaa749b1b94be0aef5ad241f191b", qaNotes: "Generated once from the verified locked Stronger Daily script. Reference-only: no KJV verse wording, music or sound effects. Awaiting Neil’s private listening review." },
};

const renewalScriptureRights: Readonly<Record<string, ScriptureRightsRecord>> = {
  "renewal-1": {
    sourceEdition: "The King James Version of the Bible, Project Gutenberg eBook #10 (release 1 August 1989; last updated 6 April 2024).",
    quotationStatus: "Reference-only. No Scripture wording is inserted in the locked reflection or narration script.",
    narrationRights: "Authorized by Neil for this exact locked, reference-only private review draft. No KJV verse wording was inserted or narrated; no publication or distribution authority is granted.",
    appDisplayRights: "Reference-only metadata is recorded for internal review. Display of verse wording is not cleared.",
    publicationStatus: "Not approved for publication or distribution.",
    territoryLimitations: "Project Gutenberg records this edition as public domain in the United States only and makes no representation for other territories.",
    attribution: "If a source credit is later shown, use: Source record: The King James Version of the Bible, Project Gutenberg eBook #10. Do not reuse Project Gutenberg branding or its ebook license without confirming the applicable terms.",
    unresolvedQuestions: "Confirm each intended distribution territory, storefront and commercial-use context; confirm the exact quotation use; and obtain rights/legal sign-off before any verse text is displayed, narrated or distributed.",
  },
  "renewal-2": {
    sourceEdition: "The King James Version of the Bible, Project Gutenberg ebook #10 (release 1 August 1989; last updated 6 April 2024).",
    quotationStatus: "Reference-only. No Scripture wording is inserted in the locked reflection or narration script.",
    narrationRights: "Authorized by Neil for this exact locked, reference-only private review draft. No KJV verse wording was inserted or narrated; no publication or distribution authority is granted.",
    appDisplayRights: "Reference-only metadata is recorded for internal review. Display of verse wording is not cleared.",
    publicationStatus: "Not approved for publication or distribution.",
    territoryLimitations: "Project Gutenberg records this edition as public domain in the United States only and makes no representation for other territories.",
    attribution: "If a source credit is later shown, use: Source record: The King James Version of the Bible, Project Gutenberg eBook #10. Do not reuse Project Gutenberg branding or its ebook license without confirming the applicable terms.",
    unresolvedQuestions: "Confirm each intended distribution territory, storefront and commercial-use context; confirm the exact quotation use; and obtain rights/legal sign-off before any verse text is displayed, narrated or distributed.",
  },
  "renewal-3": {
    sourceEdition: "The King James Version of the Bible, Project Gutenberg ebook #10 (release 1 August 1989; last updated 6 April 2024).",
    quotationStatus: "Reference-only. No Scripture wording is inserted in the locked reflection or narration script.",
    narrationRights: "Authorized by Neil for this exact locked, reference-only private review draft. No KJV verse wording was inserted or narrated; no publication or distribution authority is granted.",
    appDisplayRights: "Reference-only metadata is recorded for internal review. Display of verse wording is not cleared.",
    publicationStatus: "Not approved for publication or distribution.",
    territoryLimitations: "Project Gutenberg records this edition as public domain in the United States only and makes no representation for other territories.",
    attribution: "If a source credit is later shown, use: Source record: The King James Version of the Bible, Project Gutenberg ebook #10. Do not reuse Project Gutenberg branding or its ebook license without confirming the applicable terms.",
    unresolvedQuestions: "Confirm each intended distribution territory, storefront and commercial-use context; confirm the exact quotation use; and obtain rights/legal sign-off before any verse text is displayed, narrated or distributed.",
  },
};

const ownerApprovedSeeds: readonly Item[] = seeds.map((item) => {
  const correctedScript = item.script.replace(/^Welcome to Strongr Daily\./, "Welcome to Stronger Daily.");
  const correctedItem = correctedScript !== item.script
    ? {
      ...item,
      script: correctedScript,
      notes: "",
      versions: [`Version ${item.versions.length + 1} — pronunciation wording revision`, ...item.versions],
    }
    : item;
  const lockedHash = approvedRenewalScriptHashes[correctedItem.id];
  const audioReview = renewalPrivateAudioReviews[correctedItem.id];
  if (!lockedHash) return correctedItem;
  const approvedVersion = [`Version ${correctedItem.versions.length + 1} — immutable wording approval`, ...correctedItem.versions];
  return audioReview
    ? { ...correctedItem, status: "audio_review", narrationRights: true, lockedHash, audioReview, versions: approvedVersion }
    : { ...correctedItem, status: "narration_authorized", narrationRights: true, lockedHash, versions: approvedVersion };
});

const labels: Record<Status, string> = { draft: "Draft", owner_review: "Owner review", revision_requested: "Revision requested", owner_editing: "Owner editing", owner_edit_complete: "Owner edit complete", owner_approved: "Wording approved", narration_authorized: "Narration authorized", audio_generated: "Audio generated", audio_review: "Audio review", audio_accepted_private: "Private audio accepted", release_approved: "Release approved" };
const count = (value: string) => value.trim() ? value.trim().split(/\s+/).length : 0;

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function ContentReviewPage({ developmentPreview = false }: { readonly developmentPreview?: boolean }) {
  const [items, setItems] = useState<readonly Item[]>(ownerApprovedSeeds);
  const [selectedId, setSelectedId] = useState(ownerApprovedSeeds[1]!.id);
  const [notice, setNotice] = useState("Owner edits stay in Studio. Nothing is sent to a provider from this screen.");
  const item = items.find(({ id }) => id === selectedId) ?? items[0]!;
  const words = useMemo(() => count(item.script), [item.script]);
  const estimatedDurationSeconds = Math.round((words / 130) * 60);
  const estimatedDuration = `${Math.floor(estimatedDurationSeconds / 60)}m ${estimatedDurationSeconds % 60}s`;
  const estimatedCredits = item.script.length;
  const scriptureRights = renewalScriptureRights[item.id];
  const privateAudio = item.audioReview;
  const update = (patch: Partial<Item>) => setItems((current) => current.map((entry) => {
    if (entry.id !== item.id) return entry;
    const wordingChanged = ["reflection", "script", "prayer", "journal", "practice"].some((key) => Object.hasOwn(patch, key));
    const status = patch.status ?? (wordingChanged && (entry.status === "owner_approved" || entry.status === "narration_authorized") ? "owner_editing" : entry.status);
    const next = { ...entry, ...patch, status } as Item;
    if (wordingChanged) {
      const { lockedHash: _discarded, ...withoutLock } = next;
      return withoutLock;
    }
    return next;
  }));
  const mutate = (status: Status, message: string) => { update({ status }); setNotice(message); };
  const approve = async () => { const hash = await sha256(item.script); update({ status: "owner_approved", lockedHash: hash, versions: [`Version ${item.versions.length + 1} — immutable wording approval`, ...item.versions] }); setNotice("Wording approved for this exact version. The locked script is recorded in the Audit details."); };
  const authorize = () => mutate("narration_authorized", "Narration authorization is recorded for the locked wording only. No provider call was made.");
  const field = (label: string, key: keyof Pick<Item, "reflection" | "script" | "prayer" | "journal" | "practice" | "notes">, rows = 4) => <label>{label}<textarea disabled={Boolean(item.lockedHash) && item.status !== "owner_editing"} onChange={(event) => update({ [key]: event.currentTarget.value })} rows={rows} value={item[key]} /></label>;

  return <div className="content-review-page">
    {developmentPreview ? <aside className="development-preview-banner" role="status"><strong>Development review mode</strong><span>Local seeded data only. This preview is not connected to Studio authentication, tenant data, providers, or production actions.</span></aside> : null}
    <div className="page-heading"><p className="eyebrow">Strongr Daily · Owner workspace</p><h1>Content review</h1><p>Review wording in one calm place. Sensitive actions stay unavailable until their required approvals are complete.</p></div>
    <p className="workflow-notice" role="status">{notice}</p>
    <div className="review-layout">
      <aside className="review-list" aria-label="Content items">{items.map((entry) => <button className={entry.id === item.id ? "is-selected" : ""} key={entry.id} onClick={() => setSelectedId(entry.id)} type="button"><strong>{entry.title}</strong><span>{labels[entry.status]}</span></button>)}</aside>
      <section className="review-editor">
        <header className="review-heading"><div><p className="eyebrow">{labels[item.status]}</p><h2>{item.title}</h2><p>{item.type} · {item.scripture}</p></div><span className="status-pill status-pill--warning">{item.rights}</span></header>
        <div className="review-metadata"><span>Last edited by Neil</span><span>Last edited today</span><span>{words} words · {item.script.length} characters · about {Math.max(1, Math.round(words / 130))} minutes</span></div>
        <div className="review-fields">{field("Written reflection", "reflection", 6)}{field("Narration script", "script", 10)}{field("Prayer", "prayer", 4)}{field("Journal prompt", "journal", 3)}{field("Daily Practice", "practice", 3)}{field("Owner notes", "notes", 3)}</div>
        <div className="review-actions"><button className="secondary-button" onClick={() => setNotice("Draft saved in this review session. No wording was changed.")} type="button">Save Draft</button><button className="secondary-button" onClick={() => mutate("revision_requested", "Revision requested. The wording remains editable.")} type="button">Request Revision</button><button className="secondary-button" onClick={() => mutate("owner_edit_complete", "Owner editing marked complete. Review the exact wording before approval.")} type="button">Mark Owner Edit Complete</button><button className="primary-button" disabled={item.status !== "owner_edit_complete"} onClick={() => void approve()} type="button">Approve Wording</button><button className="secondary-button" onClick={() => mutate("owner_editing", "Reopened for owner editing. Any prior wording lock is no longer valid.")} type="button">Reopen for Editing</button><button className="primary-button" disabled={item.status !== "owner_approved" || !item.narrationRights} onClick={authorize} type="button">Authorize ElevenLabs</button><button className="danger-button" disabled={item.status !== "narration_authorized"} onClick={() => mutate("owner_approved", "Narration authorization revoked. No provider call was made.")} type="button">Revoke Narration Authorization</button></div>
        <section className="audio-review"><h3>Private audio review</h3><p>Private audio acceptance will never release content.</p><div className="audio-placeholder">{privateAudio ? "Private review draft available in ElevenLabs History" : "Audio player placeholder"}</div><dl><div><dt>Duration</dt><dd>{privateAudio ? `${privateAudio.durationSeconds.toFixed(1)} seconds` : "Not generated"}</dd></div><div><dt>Voice</dt><dd>{privateAudio ? "Donovan — Articulate, Strong and Deep" : "Not selected"}</dd></div><div><dt>Model</dt><dd>{privateAudio ? "Eleven Multilingual v2 · 0.95 speed · 0.50 stability · 0.75 similarity · style 0 · speaker boost off" : "Not connected"}</dd></div><div><dt>Script lock</dt><dd>{item.lockedHash ? "Approved wording locked" : "Not yet locked"}</dd></div><div><dt>Credits</dt><dd>{privateAudio ? `${privateAudio.creditsUsed} used` : "None used"}</dd></div>{privateAudio ? <div><dt>QA notes</dt><dd>{privateAudio.qaNotes}</dd></div> : null}</dl><div className="review-actions"><button className="secondary-button" disabled={!privateAudio} onClick={() => setNotice("Open the private draft in ElevenLabs History to listen. This does not accept or release it.")} type="button">Review Audio</button><button className="secondary-button" disabled={!privateAudio} onClick={() => mutate("audio_accepted_private", "Private audio accepted. Release remains blocked and no publication occurred.")} type="button">Accept Private Audio</button><button className="danger-button" disabled={!privateAudio} onClick={() => mutate("revision_requested", "Audio rejected. No retry was generated.")} type="button">Reject Audio</button><button className="secondary-button" disabled={!privateAudio} onClick={() => mutate("revision_requested", "One revision requested. No provider call was made.")} type="button">Request One Revision</button></div></section>
        <section className="status-timeline"><h3>Status timeline</h3><ol>{["draft", "owner_review", "owner_editing", "owner_edit_complete", "owner_approved", "narration_authorized", "audio_review", "audio_accepted_private", "release_approved"].map((status) => <li className={status === item.status ? "current" : ""} key={status}>{labels[status as Status]}</li>)}</ol></section>
        <details className="advanced-details"><summary>Details and audit</summary><p>Version history: {item.versions.join(" · ")}</p><p>Script SHA-256: {item.lockedHash ?? "Created only after wording approval"}</p><p>Locked-script readiness: {item.script.length} characters · estimated {estimatedDuration} · estimated ElevenLabs use {estimatedCredits} credits (character-based estimate only; no provider call).</p>{privateAudio ? <p>Actual private-review generation: {privateAudio.generatedAt} · {privateAudio.durationSeconds.toFixed(1)} seconds · {privateAudio.creditsUsed} credits · verified script hash {privateAudio.scriptHash}.</p> : null}{scriptureRights ? <><h3>Scripture rights record</h3><dl className="evidence-list"><div><dt>References and intended translation</dt><dd>{item.scripture} · King James Version (KJV)</dd></div><div><dt>Exact source edition</dt><dd>{scriptureRights.sourceEdition}</dd></div><div><dt>Quotation status</dt><dd>{scriptureRights.quotationStatus}</dd></div><div><dt>Narration rights</dt><dd>{scriptureRights.narrationRights}</dd></div><div><dt>App-display rights</dt><dd>{scriptureRights.appDisplayRights}</dd></div><div><dt>Publication and distribution</dt><dd>{scriptureRights.publicationStatus}</dd></div><div><dt>Territory limitations</dt><dd>{scriptureRights.territoryLimitations}</dd></div><div><dt>Attribution requirements</dt><dd>{scriptureRights.attribution}</dd></div><div><dt>Unresolved rights questions</dt><dd>{scriptureRights.unresolvedQuestions}</dd></div><div><dt>Narration authorization eligibility</dt><dd>{item.status === "audio_review" ? "Authorized and generated for private reference-only review. Acceptance and release remain separate gates." : item.narrationRights ? "Eligible after separate owner authorization." : "Not eligible: rights remain unresolved and Neil has not separately authorized ElevenLabs narration."}</dd></div></dl></> : null}<p>Tenant isolation, owner permissions, MFA/AAL2, approval evidence, audit history, and service-role boundaries remain enforced by the existing governed workflow.</p></details>
      </section>
    </div>
  </div>;
}
