// SPDX-License-Identifier: Apache-2.0
import { PassVerifyOptions, verifyNotifyPass, NotifyPassClaims } from "./verification.js";

export function bearer(authorization: string | undefined): string | undefined {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

export type HonoPassContext = {
  req: { header: (name: string) => string | undefined };
  set: (k: string, v: unknown) => void;
};

/** Hono middleware. Sets `pass` on the context. */
export function honoNotifyPass(
  options: PassVerifyOptions,
): (c: HonoPassContext, next: () => Promise<void>) => Promise<unknown> {
  return async (c, next) => {
    const token = bearer(c.req.header("authorization"));
    if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
    try {
      c.set("pass", await verifyNotifyPass(token, options));
    } catch {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    await next();
  };
}

/** Express middleware. Sets `req.pass`. */
export function expressNotifyPass(
  options: PassVerifyOptions,
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
      req.pass = await verifyNotifyPass(token, options);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}

/** Fastify preHandler. Sets `request.pass`. */
export function fastifyNotifyPass(
  options: PassVerifyOptions,
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
      request.pass = await verifyNotifyPass(token, options);
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  };
}
