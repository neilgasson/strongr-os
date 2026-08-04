import { createStrongrDailyPhase4b5OnceHandler } from "./handler.ts";

declare const Deno: {
  readonly env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");

Deno.serve(
  createStrongrDailyPhase4b5OnceHandler({
    environment: {
      ...(openAiApiKey ? { OPENAI_API_KEY: openAiApiKey } : {}),
      ...(supabaseAnonKey ? { SUPABASE_ANON_KEY: supabaseAnonKey } : {}),
      ...(supabaseServiceRoleKey ? { SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey } : {}),
      ...(supabaseUrl ? { SUPABASE_URL: supabaseUrl } : {}),
    },
  }),
);
