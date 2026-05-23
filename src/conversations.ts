import { prisma } from "./db";

// ── Create ────────────────────────────────────────────────────
export async function createConversation(userId: number, model: string) {
  const conv = await prisma.conversation.create({
    data: { userId, model, title: "New chat" },
  });
  return conv.id;
}

// ── Auto-title: guarded by userId so only the owner can rename ─
export async function setConversationTitle(
  convId: number,
  userId: number,
  firstMessage: string
) {
  const title =
    firstMessage.slice(0, 60) + (firstMessage.length > 60 ? "…" : "");
  await prisma.conversation.updateMany({
    where: { id: convId, userId },
    data: { title },
  });
}

// ── Save a single message ─────────────────────────────────────
export async function saveMessage(
  conversationId: number,
  role: "user" | "assistant" | "system",
  content: string
) {
  await prisma.message.create({ data: { conversationId, role, content } });
}

// ── Load last N messages for context window ───────────────────
// We fetch desc + reverse so Prisma's `take` gives us the LAST N
// in correct chronological order — do NOT change this pattern.
export async function loadRecentMessages(conversationId: number, limit = 20) {
  const msgs = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return msgs
    .reverse()
    .map((m: any) => ({ role: m.role as string, content: m.content }));
}

// ── List conversations (paginated) ────────────────────────────
export async function listConversations(
  userId: number,
  page = 0,
  pageSize = 20
) {
  return prisma.conversation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: page * pageSize,
    take: pageSize,
    select: {
      id: true,
      title: true,
      model: true,
      createdAt: true,
      _count: { select: { messages: true } },
    },
  });
}

// ── Delete a conversation (cascades to messages) ──────────────
export async function deleteConversation(convId: number, userId: number) {
  await prisma.conversation.deleteMany({
    where: { id: convId, userId }, // userId guard prevents deleting others'
  });
}

// ── Delete user account (cascades everything) ─────────────────
export async function deleteAccount(userId: number) {
  await prisma.user.delete({ where: { id: userId } });
}