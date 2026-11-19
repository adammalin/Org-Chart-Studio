import { z } from 'zod';

/** Reject malformed external input before handlers dereference optional fields. */
export async function readJsonObject(request: Request, fields: z.ZodRawShape) {
  const reject = (error: string, status: number) => ({
    ok: false as const,
    response: Response.json({ error }, {
      status, headers: { 'cache-control': 'private, no-store' },
    }),
  });
  let value: unknown;
  try { value = await request.json(); }
  catch { return reject('The request is not valid JSON.', 400); }
  const parsed = z.object(fields).passthrough().safeParse(value);
  if (!parsed.success) return reject('The request contains unsupported field values.', 422);
  return { ok: true as const, body: parsed.data };
}

export const jsonField = {
  text: z.string().optional(),
  number: z.number().finite().optional(),
  boolean: z.boolean().optional(),
  strings: z.array(z.string()).optional(),
  object: z.record(z.string(), z.unknown()).optional(),
};
