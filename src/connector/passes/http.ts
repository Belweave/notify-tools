// SPDX-License-Identifier: Apache-2.0
import { type PassVerifyOptions, type NotifyPassClaims, verifyNotifyPass } from "./verification.js";
export interface PassMiddlewareOptions extends PassVerifyOptions {
  /** Required durable, atomic claim shared by every service instance; true only once. */
  consumeJti: (jti: string, expiresAt: number) => Promise<boolean>;
}

async function consumePass(
  token: string,
  options: PassMiddlewareOptions,
): Promise<NotifyPassClaims> {
  // Runtime callers can bypass TypeScript; lack of durable replay protection is never a fallback.
  if (typeof options.consumeJti !== "function") throw new Error("Durable replay store required");
  const claims = await verifyNotifyPass(token, options);
  const key = `${claims.iss}:${claims.jti}`;
  if (!(await options.consumeJti(key, claims.exp))) throw new Error("Pass already used");
  return claims;
}

function bearer(authorization: string | undefined): string | undefined {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

type HonoPassContext = {
  req: { header: (name: string) => string | undefined };
  set: (k: string, v: unknown) => void;
};

/** Hono middleware. Sets `pass` on the context. */
export function honoNotifyPass(
  options: PassMiddlewareOptions,
): (c: HonoPassContext, next: () => Promise<void>) => Promise<unknown> {
  return async (c, next) => {
    const token = bearer(c.req.header("authorization"));
    if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
    try {
      c.set("pass", await consumePass(token, options));
    } catch {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    await next();
  };
}

/** Express middleware. Sets `req.pass`. */
export function expressNotifyPass(
  options: PassMiddlewareOptions,
): (
  req: { headers: { authorization?: string }; pass?: NotifyPassClaims },
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  next: (error?: unknown) => void,
) => Promise<void> {
  return async (req, res, next) => {
    const token = bearer(req.headers.authorization);
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      req.pass = await consumePass(token, options);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}

/** Fastify preHandler. Sets `request.pass`. */
export function fastifyNotifyPass(
  options: PassMiddlewareOptions,
): (
  request: { headers: { authorization?: string }; pass?: NotifyPassClaims },
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
) => Promise<unknown> {
  return async (request, reply) => {
    const token = bearer(request.headers.authorization);
    if (!token) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    try {
      request.pass = await consumePass(token, options);
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  };
}
