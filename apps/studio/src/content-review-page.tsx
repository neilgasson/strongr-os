import { useMemo, useState } from "react";

type Status =
  | "draft" | "owner_review" | "revision_requested" | "owner_editing" | "owner_edit_complete"
  | "owner_approved" | "narration_authorized" | "audio_generated" | "audio_review"
  | "audio_accepted_private" | "release_approved";

type Item = Readonly<{
  id: string; title: string; type: string; scripture: string; status: Status; reflection: string;
  script: string; prayer: string; journal: string; practice: string; notes: string; rights: string;
  narrationRights: boolean; versions: readonly string[]; lockedHash?: string;
}>;

const seeds: readonly Item[] = [
  { id: "quiet-trust", title: "Quiet Trust", type: "Guided audio reflection", scripture: "Psalm 46:10; Isaiah 30:15", status: "audio_accepted_private", reflection: "A written Quiet Trust package is approved for private narration review.", script: "Private narration-review script retained in the approved package.", prayer: "Lord Jesus, meet us with Your peace. Amen.", journal: "What concern can you bring to God?", practice: "Pause and pray.", notes: "Private narration accepted. Release remains closed.", rights: "Scripture quotation remains reference-only", narrationRights: false, versions: ["Version 3 — wording approved", "Version 2 — owner revision"], lockedHash: "Recorded in approved package" },
  { id: "renewal-1", title: "Renewal Day 1 — Return", type: "Guided audio reflection", scripture: "Psalm 51:10; 2 Corinthians 5:17", status: "owner_review", reflection: "Renewal begins with an honest return to God and confidence in Christ's mercy.", script: "Welcome to Strongr Daily. Today we return to God with honesty and hope.", prayer: "Lord Jesus, receive us as we return to You. Amen.", journal: "Where are you being invited to return?", practice: "Make a quiet, honest prayer today.", notes: "", rights: "Translation and quotation decision pending", narrationRights: false, versions: ["Version 1 — ready for owner review"] },
  { id: "renewal-2", title: "Renewal Day 2 — Release", type: "Guided prayer", scripture: "1 Peter 5:7; Psalm 55:22", status: "owner_review", reflection: "In Christ, we bring burdens to God with trust rather than carrying them alone.", script: "Welcome to Strongr Daily. Bring the concern you are carrying into prayer.", prayer: "Faithful God, hold what is too heavy for me. Amen.", journal: "What burden can you place in God's care?", practice: "Name one burden in prayer.", notes: "", rights: "Translation and quotation decision pending", narrationRights: false, versions: ["Version 1 — ready for owner review"] },
  { id: "renewal-3", title: "Renewal Day 3 — Be Still", type: "Guided Scripture reflection", scripture: "Psalm 46:10; Isaiah 30:15", status: "owner_review", reflection: "Stillness turns our attention toward God while life remains unfinished.", script: "Welcome to Strongr Daily. Let this quiet moment turn your attention toward God.", prayer: "God of peace, draw my attention to You. Amen.", journal: "Where do you need God's quiet today?", practice: "Set aside three minutes to pray.", notes: "", rights: "Translation and quotation decision pending", narrationRights: false, versions: ["Version 1 — ready for owner review"] },
];

const labels: Record<Status, string> = { draft: "Draft", owner_review: "Owner review", revision_requested: "Revision requested", owner_editing: "Owner editing", owner_edit_complete: "Owner edit complete", owner_approved: "Wording approved", narration_authorized: "Narration authorized", audio_generated: "Audio generated", audio_review: "Audio review", audio_accepted_private: "Private audio accepted", release_approved: "Release approved" };
const count = (value: string) => value.trim() ? value.trim().split(/\s+/).length : 0;

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function ContentReviewPage({ developmentPreview = false }: { readonly developmentPreview?: boolean }) {
  const [items, setItems] = useState<readonly Item[]>(seeds);
  const [selectedId, setSelectedId] = useState(seeds[1]!.id);
  const [notice, setNotice] = useState("Owner edits stay in Studio. Nothing is sent to a provider from this screen.");
  const item = items.find(({ id }) => id === selectedId) ?? items[0]!;
  const words = useMemo(() => count(item.script), [item.script]);
  const update = (patch: Partial<Item>) => setItems((current) => current.map((entry) => {
    if (entry.id !== item.id) return entry;
    const status = patch.status ?? (Object.hasOwn(patch, "script") && (entry.status === "owner_approved" || entry.status === "narration_authorized") ? "owner_editing" : entry.status);
    const next = { ...entry, ...patch, status } as Item;
    if (Object.hasOwn(patch, "script")) {
      const { lockedHash: _discarded, ...withoutLock } = next;
      return withoutLock;
    }
    return next;
  }));
  const mutate = (status: Status, message: string) => { update({ status }); setNotice(message); };
  const approve = async () => { const hash = await sha256(item.script); update({ status: "owner_approved", lockedHash: hash, versions: [`Version ${item.versions.length + 1} — immutable wording approval`, ...item.versions] }); setNotice("Wording approved for this exact version. The locked script is recorded in the Audit details."); };
  const authorize = () => mutate("narration_authorized", "Narration authorization is recorded for the locked wording only. No provider call was made.");
  const field = (label: string, key: keyof Pick<Item, "reflection" | "script" | "prayer" | "journal" | "practice" | "notes">, rows = 4) => <label>{label}<textarea onChange={(event) => update({ [key]: event.currentTarget.value })} rows={rows} value={item[key]} /></label>;

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
        <section className="audio-review"><h3>Private audio review</h3><p>Audio is not connected in this phase. Private audio acceptance will never release content.</p><div className="audio-placeholder">Audio player placeholder</div><dl><div><dt>Duration</dt><dd>Not generated</dd></div><div><dt>Voice</dt><dd>Not selected</dd></div><div><dt>Model</dt><dd>Not connected</dd></div><div><dt>Script lock</dt><dd>{item.lockedHash ? "Approved wording locked" : "Not yet locked"}</dd></div><div><dt>Credits</dt><dd>None used</dd></div></dl><div className="review-actions"><button className="secondary-button" disabled type="button">Review Audio</button><button className="secondary-button" disabled type="button">Accept Private Audio</button><button className="danger-button" disabled type="button">Reject Audio</button><button className="secondary-button" disabled type="button">Request One Revision</button></div></section>
        <section className="status-timeline"><h3>Status timeline</h3><ol>{["draft", "owner_review", "owner_editing", "owner_edit_complete", "owner_approved", "narration_authorized", "audio_review", "audio_accepted_private", "release_approved"].map((status) => <li className={status === item.status ? "current" : ""} key={status}>{labels[status as Status]}</li>)}</ol></section>
        <details className="advanced-details"><summary>Details and audit</summary><p>Version history: {item.versions.join(" · ")}</p><p>Script SHA-256: {item.lockedHash ?? "Created only after wording approval"}</p><p>Tenant isolation, owner permissions, MFA/AAL2, approval evidence, audit history, and service-role boundaries remain enforced by the existing governed workflow.</p></details>
      </section>
    </div>
  </div>;
}
