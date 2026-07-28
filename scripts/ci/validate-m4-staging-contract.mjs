import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractPath = resolve(repositoryRoot, "ops/staging/staging-resource-contract.json");
const architecturePath = resolve(
  repositoryRoot,
  "docs/architecture/M4_1_STAGING_RESOURCE_DECISION.md",
);
const adrPath = resolve(repositoryRoot, "docs/adr/ADR-0005-separate-staging-control-plane.md");
const evidenceDirectory = resolve(
  repositoryRoot,
  process.env.STRONGR_OS_M4_ARTIFACT_DIR ?? "artifacts/m4-staging-contract",
);

const checks = [];

function record(condition, check) {
  checks.push({ check, status: condition ? "pass" : "fail" });
  if (!condition) {
    throw new Error(check);
  }
}

function exactArray(actual, expected, check) {
  record(JSON.stringify(actual) === JSON.stringify(expected), check);
}

async function validate() {
  const [contractText, architecture, adr] = await Promise.all([
    readFile(contractPath, "utf8"),
    readFile(architecturePath, "utf8"),
    readFile(adrPath, "utf8"),
  ]);
  const contract = JSON.parse(contractText);

  record(
    contract.schema_version === "strongr.m4_staging_resource_contract.v1",
    "schema_version",
  );
  record(contract.status === "proposed_unprovisioned", "proposal_status");
  record(contract.environment === "strongr-os-staging", "environment_name");
  record(contract.approved === false, "owner_approval_not_fabricated");
  record(contract.production_authorized === false, "production_forbidden");
  record(
    contract.strongr_daily_connection_authorized === false,
    "strongr_daily_connection_forbidden",
  );
  record(contract.budget.currency === "USD", "budget_currency");
  record(contract.budget.expected_monthly_before_tax === 25, "expected_monthly_cost");
  record(contract.budget.hard_monthly_ceiling_before_tax === 35, "hard_cost_ceiling");
  record(
    contract.budget.provider_cost_confirmation_required === true,
    "provider_cost_confirmation_required",
  );

  record(contract.supabase.organization_name === "Strongr OS Staging", "supabase_org_name");
  record(contract.supabase.organization_id === null, "supabase_org_unprovisioned");
  record(contract.supabase.organization_plan === "pro", "supabase_pro_plan");
  record(contract.supabase.spend_cap === "enabled", "supabase_spend_cap");
  record(contract.supabase.project_name === "strongr-os-staging", "supabase_project_name");
  record(contract.supabase.project_ref === null, "supabase_project_unprovisioned");
  record(contract.supabase.region === "ca-central-1", "supabase_region");
  record(contract.supabase.compute === "micro", "supabase_compute");
  exactArray(contract.supabase.add_ons, [], "supabase_add_ons_forbidden");

  record(contract.github.repository === "neilgasson/strongr-os", "github_repository");
  record(contract.github.environment === "strongr-os-staging", "github_environment");
  exactArray(contract.github.required_reviewers, ["neilgasson"], "github_required_reviewer");
  record(
    contract.github.deployment_branch_policy === "protected_branches_only",
    "github_protected_branches_only",
  );
  exactArray(
    contract.github.secret_bearing_triggers,
    ["workflow_dispatch"],
    "secret_bearing_dispatch_only",
  );
  record(contract.github.default_job_permissions.contents === "read", "github_read_only_default");

  const publicValues = [
    "STAGING_B2_BUCKET",
    "STAGING_B2_ENDPOINT",
    "STAGING_GRAFANA_METRICS_ENDPOINT",
    "STAGING_SUPABASE_PROJECT_REF",
    "STAGING_SUPABASE_PUBLISHABLE_KEY",
    "STAGING_SUPABASE_URL",
  ];
  exactArray(contract.github.public_variables, publicValues, "public_value_allowlist");

  const encryptedSecrets = [
    "STAGING_B2_APPLICATION_KEY",
    "STAGING_B2_KEY_ID",
    "STAGING_BACKUP_ENCRYPTION_KEY",
    "STAGING_GRAFANA_METRICS_WRITE_TOKEN",
    "STAGING_SUPABASE_ACCESS_TOKEN",
    "STAGING_SUPABASE_DB_PASSWORD",
    "STAGING_SUPABASE_WORKER_SECRET_KEY",
    "STAGING_TELEMETRY_DATABASE_URL",
  ];
  exactArray(contract.github.encrypted_secrets, encryptedSecrets, "encrypted_secret_inventory");

  record(contract.hosting.provider === "openai_sites", "hosting_provider");
  record(contract.hosting.project_name === "Strongr Studio Staging", "hosting_project_name");
  record(contract.hosting.project_id === null, "hosting_unprovisioned");
  record(contract.hosting.access_mode === "custom_owner_only", "hosting_owner_only");
  exactArray(contract.hosting.allowed_users, ["neilgasson"], "hosting_allowed_user");
  exactArray(contract.hosting.allowed_groups, [], "hosting_groups_forbidden");
  record(contract.hosting.public_access === false, "hosting_public_access_forbidden");
  exactArray(
    contract.hosting.runtime_public_values,
    ["PUBLIC_SUPABASE_PUBLISHABLE_KEY", "PUBLIC_SUPABASE_URL"],
    "hosting_public_runtime_allowlist",
  );
  exactArray(contract.hosting.server_secrets, [], "hosting_server_secrets_forbidden");

  record(contract.worker.provider === "github_hosted_actions", "worker_provider");
  record(contract.worker.mode === "bounded_approved_job", "worker_bounded");
  record(contract.worker.always_on === false, "worker_not_always_on");
  record(contract.worker.production_suitable === false, "worker_not_production_runtime");

  record(contract.backup.provider === "backblaze_b2", "backup_provider");
  record(contract.backup.data_region === "canada_east", "backup_region");
  record(
    contract.backup.bucket_name === "strongr-os-staging-recovery-20260728",
    "backup_bucket_name",
  );
  record(contract.backup.bucket_id === null, "backup_unprovisioned");
  record(contract.backup.bucket_name_availability_verified === false, "bucket_unverified");
  record(contract.backup.access === "private", "backup_private");
  record(contract.backup.object_lock === "enabled_at_creation", "backup_object_lock");
  record(contract.backup.client_side_encryption === "AES-256-GCM", "backup_encryption");
  record(contract.backup.scheduled_retention_days === 35, "backup_retention");

  record(contract.telemetry.provider === "grafana_cloud", "telemetry_provider");
  record(contract.telemetry.plan === "free", "telemetry_free_plan");
  record(contract.telemetry.stack_name === "strongrosstaging", "telemetry_stack_name");
  record(contract.telemetry.region === "aws_ca-central-1", "telemetry_region");
  record(contract.telemetry.direct_supabase_integration === false, "direct_scrape_forbidden");
  record(
    contract.telemetry.source_authentication === "restricted_postgres_telemetry_login",
    "telemetry_restricted_login",
  );
  record(contract.telemetry.source_table_access === false, "telemetry_table_access_forbidden");
  record(contract.telemetry.source_bypass_rls === false, "telemetry_bypass_rls_forbidden");
  record(
    contract.telemetry.destination_token_scope === "metrics_write_only",
    "telemetry_write_only_destination",
  );

  for (const text of [architecture, adr]) {
    record(text.includes("USD $35"), "documentation_cost_ceiling");
    record(text.includes("strongr-os-staging"), "documentation_staging_target");
    record(text.includes("Strongr Daily"), "documentation_strongr_daily_boundary");
    record(text.includes("no staging resource") || text.includes("No resource"), "documentation_no_resource");
  }

  const serialized = JSON.stringify(contract);
  record(!serialized.includes("strongr-os-dev\""), "development_target_not_selected");
  record(!serialized.includes("strongr-os-disposable\""), "disposable_target_not_selected");
}

await mkdir(evidenceDirectory, { recursive: true });

let status = "pass";
let error = null;
try {
  await validate();
} catch (caught) {
  status = "fail";
  error = caught instanceof Error ? caught.message : String(caught);
}

const summary = {
  check: "m4_staging_resource_contract",
  checks,
  error,
  sha: process.env.GITHUB_SHA ?? "local",
  status,
};

await writeFile(
  resolve(evidenceDirectory, "resource-contract-validation.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify({ check: summary.check, checks: checks.length, status }));

if (status !== "pass") {
  process.exitCode = 1;
}
