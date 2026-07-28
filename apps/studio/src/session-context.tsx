import type { Factor, Session } from "@supabase/auth-js";
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Uuid } from "../../../packages/contracts/src/index.ts";

import { createStudioAuthClient } from "./auth-client.ts";
import type { BrowserEnvironmentState } from "./browser-environment.ts";
import { createStudioFoundation, type StudioFoundation } from "./foundation.ts";
import {
  createStudioIdentityGateway,
  type OperatorIdentity,
  type OperatorOrganization,
  type StudioCapabilities,
} from "./identity-gateway.ts";
import { createStudioSupabaseGateway, StudioApiError } from "./supabase-http.ts";
import { loadCanonicalWorkQueue, type WorkQueueSnapshot } from "./work-queue.ts";

export interface StudioFactor {
  readonly friendlyName: string;
  readonly id: string;
  readonly status: "unverified" | "verified";
}

export interface TotpEnrollment {
  readonly factorId: string;
  readonly qrCode: string;
  readonly secret: string;
}

type Loadable<Value> =
  | Readonly<{ status: "idle" | "loading" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "ready"; value: Value }>;

interface MfaState {
  readonly currentLevel: "aal1" | "aal2" | null;
  readonly factors: readonly StudioFactor[];
  readonly nextLevel: "aal1" | "aal2" | null;
}

export interface StudioSessionContextValue {
  readonly activeOrganization: OperatorOrganization | null;
  readonly authentication:
    | Readonly<{ status: "initializing" | "unconfigured" | "signed_out" }>
    | Readonly<{ email: string; status: "signed_in" }>;
  readonly capabilities: Loadable<StudioCapabilities>;
  readonly foundation: StudioFoundation | null;
  readonly identity: Loadable<OperatorIdentity>;
  readonly mfa: Loadable<MfaState>;
  readonly notice: string | null;
  readonly totpEnrollment: TotpEnrollment | null;
  readonly workQueue: Loadable<WorkQueueSnapshot>;
  announce(message: string): void;
  clearNotice(): void;
  enrollTotp(friendlyName: string): Promise<boolean>;
  refreshWorkQueue(): Promise<void>;
  reportWorkflowFailure(error: unknown, fallback: string): void;
  selectOrganization(organizationId: Uuid): void;
  signIn(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;
  unenrollFactor(factorId: string): Promise<boolean>;
  verifyFactor(factorId: string, code: string): Promise<boolean>;
}

const StudioSessionContext = createContext<StudioSessionContextValue | null>(null);

function safeAuthFailure(error: unknown, fallback: string): string {
  const record =
    typeof error === "object" && error !== null
      ? (error as Readonly<Record<string, unknown>>)
      : null;
  const code =
    typeof record?.code === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(record.code)
      ? record.code
      : null;
  return code ? `${fallback} (${code}).` : `${fallback}.`;
}

function toFactor(factor: Factor): StudioFactor | null {
  if (factor.factor_type !== "totp") {
    return null;
  }
  return Object.freeze({
    friendlyName: factor.friendly_name ?? "Authenticator app",
    id: factor.id,
    status: factor.status,
  });
}

function toAssuranceLevel(value: string | null): "aal1" | "aal2" | null {
  return value === "aal1" || value === "aal2" ? value : null;
}

function isExpiredRequest(error: unknown): boolean {
  return error instanceof StudioApiError && error.status === 401;
}

export function StudioSessionProvider({
  children,
  environment,
}: {
  readonly children: ReactNode;
  readonly environment: BrowserEnvironmentState;
}) {
  const client = useMemo(
    () => (environment.status === "configured" ? createStudioAuthClient(environment.value) : null),
    [environment],
  );
  const [session, setSession] = useState<Session | null | undefined>(
    environment.status === "configured" ? undefined : null,
  );
  const [identity, setIdentity] = useState<Loadable<OperatorIdentity>>({ status: "idle" });
  const [activeOrganization, setActiveOrganization] = useState<OperatorOrganization | null>(null);
  const [capabilities, setCapabilities] = useState<Loadable<StudioCapabilities>>({
    status: "idle",
  });
  const [workQueue, setWorkQueue] = useState<Loadable<WorkQueueSnapshot>>({ status: "idle" });
  const [mfa, setMfa] = useState<Loadable<MfaState>>({ status: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [totpEnrollment, setTotpEnrollment] = useState<TotpEnrollment | null>(null);
  const foundation = useMemo<StudioFoundation | null>(() => {
    if (!session || environment.status !== "configured") {
      return null;
    }
    const gateway = createStudioSupabaseGateway({
      accessToken: session.access_token,
      environment: environment.value,
    });
    return createStudioFoundation(gateway, gateway);
  }, [environment, session]);

  const clearSignedInState = useCallback(() => {
    setIdentity({ status: "idle" });
    setActiveOrganization(null);
    setCapabilities({ status: "idle" });
    setWorkQueue({ status: "idle" });
    setMfa({ status: "idle" });
    setTotpEnrollment(null);
  }, []);
  const expireLocalSession = useCallback(
    (message: string) => {
      setNotice(message);
      setSession(null);
      clearSignedInState();
      if (client) {
        void client.signOut({ scope: "local" });
      }
    },
    [clearSignedInState, client],
  );
  const announce = useCallback((message: string) => setNotice(message), []);
  const reportWorkflowFailure = useCallback(
    (error: unknown, fallback: string) => {
      if (isExpiredRequest(error)) {
        expireLocalSession("Your session expired during governed work. Please sign in again.");
        return;
      }
      setNotice(
        error instanceof StudioApiError && /^[A-Za-z0-9_.-]{1,80}$/.test(error.code)
          ? `${fallback} (${error.code}). Canonical state will be reloaded.`
          : `${fallback}. Canonical state will be reloaded.`,
      );
    },
    [expireLocalSession],
  );

  useEffect(() => {
    if (!client) {
      setSession(null);
      clearSignedInState();
      return;
    }

    let active = true;
    const {
      data: { subscription },
    } = client.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        if (!nextSession) {
          clearSignedInState();
        }
      }
    });

    void client.getSession().then(({ data, error }) => {
      if (!active) {
        return;
      }
      if (error) {
        setNotice(safeAuthFailure(error, "The saved session could not be restored"));
        setSession(null);
        clearSignedInState();
        return;
      }
      setSession(data.session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [clearSignedInState, client]);

  useEffect(() => {
    if (!client || !session || environment.status !== "configured") {
      return;
    }

    let active = true;
    const identityGateway = createStudioIdentityGateway({
      accessToken: session.access_token,
      environment: environment.value,
    });
    setIdentity({ status: "loading" });
    setMfa({ status: "loading" });

    void identityGateway
      .discover(session.user.id)
      .then((value) => {
        if (!active) {
          return;
        }
        setIdentity({ status: "ready", value });
        setActiveOrganization((current) => {
          const preserved = value.organizations.find(({ id }) => id === current?.id);
          if (preserved) {
            return preserved;
          }
          return value.organizations.length === 1 ? (value.organizations[0] ?? null) : null;
        });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        if (isExpiredRequest(error)) {
          expireLocalSession("Your session no longer authorizes Studio. Please sign in again.");
          return;
        }
        setIdentity({
          message: "Your active organizations could not be loaded. No tenant was selected.",
          status: "error",
        });
        setActiveOrganization(null);
      });

    void Promise.all([
      client.mfa.listFactors(),
      client.mfa.getAuthenticatorAssuranceLevel(session.access_token),
    ]).then(([factorResult, levelResult]) => {
      if (!active) {
        return;
      }
      if (factorResult.error || levelResult.error || !factorResult.data || !levelResult.data) {
        setMfa({
          message: "Authenticator status could not be loaded. AAL2 is not assumed.",
          status: "error",
        });
        return;
      }
      const factors = factorResult.data.all.flatMap((factor) => {
        const mapped = toFactor(factor);
        return mapped ? [mapped] : [];
      });
      setMfa({
        status: "ready",
        value: Object.freeze({
          currentLevel: toAssuranceLevel(levelResult.data.currentLevel),
          factors: Object.freeze(factors),
          nextLevel: toAssuranceLevel(levelResult.data.nextLevel),
        }),
      });
    });

    return () => {
      active = false;
    };
  }, [client, environment, expireLocalSession, session]);

  const loadWork = useCallback(async () => {
    if (!session || !activeOrganization || environment.status !== "configured") {
      setWorkQueue({ status: "idle" });
      return;
    }
    setWorkQueue({ status: "loading" });
    try {
      const gateway = createStudioSupabaseGateway({
        accessToken: session.access_token,
        environment: environment.value,
      });
      setWorkQueue({
        status: "ready",
        value: await loadCanonicalWorkQueue(gateway, activeOrganization.id),
      });
    } catch (error) {
      if (isExpiredRequest(error)) {
        expireLocalSession("Your session expired while loading work. Please sign in again.");
        return;
      }
      setWorkQueue({
        message: "The canonical work queue could not be loaded. No success is assumed.",
        status: "error",
      });
    }
  }, [activeOrganization, environment, expireLocalSession, session]);

  useEffect(() => {
    if (!session || !activeOrganization || environment.status !== "configured") {
      setCapabilities({ status: "idle" });
      setWorkQueue({ status: "idle" });
      return;
    }
    let active = true;
    const gateway = createStudioIdentityGateway({
      accessToken: session.access_token,
      environment: environment.value,
    });
    setCapabilities({ status: "loading" });
    void gateway
      .loadCapabilities(activeOrganization.id)
      .then((value) => {
        if (active) {
          setCapabilities({ status: "ready", value });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        if (isExpiredRequest(error)) {
          expireLocalSession(
            "Your session expired while checking permissions. Please sign in again.",
          );
          return;
        }
        setCapabilities({
          message: "Capabilities could not be confirmed. Governed actions remain unavailable.",
          status: "error",
        });
      });
    void loadWork();
    return () => {
      active = false;
    };
  }, [activeOrganization, environment, expireLocalSession, loadWork, session]);

  const reloadMfa = useCallback(async () => {
    if (!client || !session) {
      return;
    }
    setMfa({ status: "loading" });
    const [factorResult, levelResult] = await Promise.all([
      client.mfa.listFactors(),
      client.mfa.getAuthenticatorAssuranceLevel(session.access_token),
    ]);
    if (factorResult.error || levelResult.error || !factorResult.data || !levelResult.data) {
      setMfa({
        message: "Authenticator status could not be refreshed. AAL2 is not assumed.",
        status: "error",
      });
      return;
    }
    setMfa({
      status: "ready",
      value: Object.freeze({
        currentLevel: toAssuranceLevel(levelResult.data.currentLevel),
        factors: Object.freeze(
          factorResult.data.all.flatMap((factor) => {
            const mapped = toFactor(factor);
            return mapped ? [mapped] : [];
          }),
        ),
        nextLevel: toAssuranceLevel(levelResult.data.nextLevel),
      }),
    });
  }, [client, session]);

  const value = useMemo<StudioSessionContextValue>(
    () => ({
      activeOrganization,
      announce,
      authentication:
        environment.status !== "configured"
          ? { status: "unconfigured" }
          : session === undefined
            ? { status: "initializing" }
            : session
              ? {
                  email: session.user.email ?? "Provisioned operator",
                  status: "signed_in",
                }
              : { status: "signed_out" },
      capabilities,
      clearNotice: () => setNotice(null),
      enrollTotp: async (friendlyName) => {
        if (!client || !session) {
          setNotice("Sign in before enrolling an authenticator.");
          return false;
        }
        const normalizedName = friendlyName.trim();
        if (normalizedName.length < 2 || normalizedName.length > 80) {
          setNotice("Authenticator name must be between 2 and 80 characters.");
          return false;
        }
        const { data, error } = await client.mfa.enroll({
          factorType: "totp",
          friendlyName: normalizedName,
        });
        if (error || !data || data.type !== "totp") {
          setNotice(safeAuthFailure(error, "Authenticator enrollment did not complete"));
          return false;
        }
        setTotpEnrollment(
          Object.freeze({
            factorId: data.id,
            qrCode: data.totp.qr_code,
            secret: data.totp.secret,
          }),
        );
        setNotice("Scan the QR code, then enter a current six-digit code to finish enrollment.");
        return true;
      },
      identity,
      foundation,
      mfa,
      notice,
      refreshWorkQueue: loadWork,
      reportWorkflowFailure,
      selectOrganization: (organizationId) => {
        if (identity.status !== "ready") {
          return;
        }
        const selected = identity.value.organizations.find(({ id }) => id === organizationId);
        if (!selected) {
          setNotice("That organization is not available to the current signed-in operator.");
          setActiveOrganization(null);
          return;
        }
        setActiveOrganization(selected);
        setNotice(`Active organization changed to ${selected.name}.`);
      },
      signIn: async (email, password) => {
        if (!client) {
          setNotice("Studio needs its isolated public browser configuration before sign-in.");
          return false;
        }
        const normalizedEmail = email.trim();
        if (!normalizedEmail || !password) {
          setNotice("Enter both email and password.");
          return false;
        }
        const { error } = await client.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) {
          setNotice(safeAuthFailure(error, "Sign-in was not accepted"));
          return false;
        }
        setNotice("Signed in. Studio is loading your active organizations.");
        return true;
      },
      signOut: async () => {
        if (client) {
          const { error } = await client.signOut({ scope: "local" });
          if (error) {
            setNotice(safeAuthFailure(error, "The local session could not be cleared"));
            return;
          }
        }
        setSession(null);
        clearSignedInState();
        setNotice("Signed out on this browser.");
      },
      totpEnrollment,
      unenrollFactor: async (factorId) => {
        if (!client || !session) {
          setNotice("Sign in before changing authenticators.");
          return false;
        }
        const known =
          mfa.status === "ready" && mfa.value.factors.some((factor) => factor.id === factorId);
        if (!known) {
          setNotice("That authenticator is not available to the current session.");
          return false;
        }
        const { error } = await client.mfa.unenroll({ factorId });
        if (error) {
          setNotice(safeAuthFailure(error, "Authenticator removal did not complete"));
          return false;
        }
        const refreshResult = await client.refreshSession();
        if (refreshResult.error) {
          setNotice(
            safeAuthFailure(
              refreshResult.error,
              "Authenticator was removed, but assurance could not be refreshed",
            ),
          );
          return false;
        }
        setTotpEnrollment(null);
        await reloadMfa();
        setNotice("Authenticator removed and session assurance refreshed.");
        return true;
      },
      verifyFactor: async (factorId, code) => {
        if (!client || !session) {
          setNotice("Sign in before verifying an authenticator.");
          return false;
        }
        if (!/^\d{6}$/.test(code)) {
          setNotice("Enter the six-digit code from your authenticator app.");
          return false;
        }
        const permittedFactor =
          totpEnrollment?.factorId === factorId ||
          (mfa.status === "ready" && mfa.value.factors.some((factor) => factor.id === factorId));
        if (!permittedFactor) {
          setNotice("That authenticator is not available to the current session.");
          return false;
        }
        const challenge = await client.mfa.challenge({ factorId });
        if (challenge.error || !challenge.data) {
          setNotice(safeAuthFailure(challenge.error, "Authenticator challenge did not start"));
          return false;
        }
        const verification = await client.mfa.verify({
          challengeId: challenge.data.id,
          code,
          factorId,
        });
        if (verification.error) {
          setNotice(safeAuthFailure(verification.error, "Authenticator code was not accepted"));
          return false;
        }
        const refreshResult = await client.refreshSession();
        if (refreshResult.error) {
          setNotice(
            safeAuthFailure(
              refreshResult.error,
              "Authenticator was verified, but assurance could not be refreshed",
            ),
          );
          return false;
        }
        setTotpEnrollment(null);
        await reloadMfa();
        setNotice("Authenticator verified. The current session assurance was refreshed.");
        return true;
      },
      workQueue,
    }),
    [
      activeOrganization,
      announce,
      capabilities,
      clearSignedInState,
      client,
      environment.status,
      foundation,
      identity,
      loadWork,
      mfa,
      notice,
      reloadMfa,
      reportWorkflowFailure,
      session,
      totpEnrollment,
      workQueue,
    ],
  );

  return <StudioSessionContext.Provider value={value}>{children}</StudioSessionContext.Provider>;
}

export function useStudioSession(): StudioSessionContextValue {
  const value = useContext(StudioSessionContext);
  if (!value) {
    throw new Error("Studio session context is unavailable");
  }
  return value;
}

export function preventDefault(handler: () => void | Promise<void>) {
  return (event: FormEvent) => {
    event.preventDefault();
    void handler();
  };
}
