import { z } from 'zod';

const RESERVED = new Set([
  'admin', 'administrator', 'root', 'bookmall', 'support', 'help', 'system', 'moderator', 'api', 'null', 'undefined',
]);

export const usernameSchema = z
  .string({ required_error: 'Login kiritilmagan' })
  .trim()
  .toLowerCase()
  .min(3, 'Login kamida 3 ta belgidan iborat bo‘lishi kerak')
  .max(20, 'Login 20 ta belgidan oshmasligi kerak')
  .regex(/^[a-z][a-z0-9_.]*$/, 'Login lotin harfi bilan boshlanib, faqat lotin harflari, raqamlar, "_" va "." dan iborat bo‘lishi kerak')
  .refine((u) => !/[_.]{2}/.test(u) && !/[_.]$/.test(u), 'Login "_" yoki "." bilan tugamasligi va ularni ketma-ket ishlatmasligi kerak')
  .refine((u) => !RESERVED.has(u), 'Bu login band qilingan, boshqasini tanlang');

export const passwordSchema = z
  .string({ required_error: 'Parol kiritilmagan' })
  .min(8, 'Parol kamida 8 ta belgidan iborat bo‘lishi kerak')
  .max(128, 'Parol 128 ta belgidan oshmasligi kerak')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Parolda kamida bitta harf va bitta raqam bo‘lishi kerak');

export function withConfirm<T extends z.ZodRawShape>(shape: T, pwKey: string, confirmKey: string) {
  return z.object(shape).superRefine((v: Record<string, unknown>, ctx) => {
    if (v[pwKey] !== v[confirmKey]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [confirmKey], message: 'Parollar bir xil emas' });
    }
  });
}
