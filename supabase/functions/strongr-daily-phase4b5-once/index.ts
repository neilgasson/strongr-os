import { createStrongrDailyPhase4b5OnceHandler } from "./handler.ts";

declare const Deno: {
  serve(handler: (request: Request) => Promise<Response>): void;
};

// This source intentionally reads no provider or privileged service credentials.
Deno.serve(createStrongrDailyPhase4b5OnceHandler());
