import { z } from 'zod';

export const role = z.enum(['ADMIN', 'EDITOR', 'TECHNICIAN']);
const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const password = z.string().min(12).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes');
export const createUserSchema = z.object({ fullName: z.string().trim().min(1).max(120), email, password, role }).strict();
export const updateUserSchema = z.object({ role: role.optional(), isActive: z.boolean().optional() }).strict().refine((value) => Object.keys(value).length > 0);
export const listUsersSchema = z.object({ search: z.string().trim().max(120).optional(), role: role.optional() }).strict();
