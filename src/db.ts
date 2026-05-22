import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prevent multiple instances during hot reload in dev
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter, log: [] });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}