import { prisma } from "./db";

// Start a new conversation, return its id
export async function createConversation(userId: number, model: string) {
  const conv = await prisma.conversation.create({
    data: { userId, model, title: "New chat" },
  });
  return conv.id;
}

// Auto-title: set title from first user message (first 60 chars)
export async function setConversationTitle(convId: number, firstMessage: string) {
  const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? "…" : "");
  await prisma.conversation.update({ where: { id: convId }, data: { title } });
}

// Save a single message
export async function saveMessage(
  conversationId: number,
  role: "user" | "assistant",
  content: string
) {
  await prisma.message.create({ data: { conversationId, role, content } });
}

// Load last N messages for the in-memory context window
export async function loadRecentMessages(conversationId: number, limit = 20) {
  const msgs = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  // Return in chronological order
  return msgs.reverse().map((m:any) => ({ role: m.role, content: m.content }));
}

// List all conversations for a user
export async function listConversations(userId: number) {
  return prisma.conversation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      model: true,
      createdAt: true,
      _count: { select: { messages: true } },
    },
  });
}

// Delete a conversation (cascades to messages)
export async function deleteConversation(convId: number, userId: number) {
  await prisma.conversation.deleteMany({
    where: { id: convId, userId }, // userId guard prevents deleting others' convs
  });
}

// Delete the user account (cascades everything)
export async function deleteAccount(userId: number) {
  await prisma.user.delete({ where: { id: userId } });
}