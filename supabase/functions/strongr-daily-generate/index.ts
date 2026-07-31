import { createStrongrDailyGenerateHandler } from "./handler.ts";

declare const Deno: {
  readonly env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

Deno.serve(
  createStrongrDailyGenerateHandler({
    environment: {
      OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY"),
      SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    },
  }),
);
