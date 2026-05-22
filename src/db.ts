import { PrismaClient } from "@prisma/client";

// Prevent multiple instances during hot reload in dev
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: [] });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}