import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  forgeGenerations,
  forgeProjectSnapshots,
  forgeProjects,
  forgeReferences,
  InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function createForgeProject(input: { name: string; slug: string; userId?: number }) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(forgeProjects).values(input);
  return Number(result[0].insertId);
}

export async function listForgeProjects(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (userId) return db.select().from(forgeProjects).where(eq(forgeProjects.userId, userId)).orderBy(desc(forgeProjects.updatedAt));
  return db.select().from(forgeProjects).orderBy(desc(forgeProjects.updatedAt));
}

export async function createForgeGeneration(input: {
  projectId?: number;
  prompt: string;
  style: string;
  status: "pending" | "completed" | "failed";
  conceptUrl?: string;
  modelUrl?: string;
  provider?: string;
  error?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(forgeGenerations).values(input);
  return Number(result[0].insertId);
}

export async function createForgeReference(input: {
  projectId?: number;
  generationId?: number;
  type: string;
  label?: string;
  url: string;
  mimeType?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(forgeReferences).values(input);
  return Number(result[0].insertId);
}

export async function createForgeSnapshot(input: {
  projectId: number;
  label: string;
  prompt: string;
  style: string;
  doodleUrl?: string;
  referencesJson?: string;
  transformJson?: string;
  conceptUrl?: string;
  modelUrl?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(forgeProjectSnapshots).values(input);
  return Number(result[0].insertId);
}

export async function listForgeSnapshots(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(forgeProjectSnapshots).where(eq(forgeProjectSnapshots.projectId, projectId)).orderBy(desc(forgeProjectSnapshots.createdAt));
}

export async function deleteForgeSnapshot(id: number) {
  const db = await getDb();
  if (!db) return false;
  await db.delete(forgeProjectSnapshots).where(eq(forgeProjectSnapshots.id, id));
  return true;
}
