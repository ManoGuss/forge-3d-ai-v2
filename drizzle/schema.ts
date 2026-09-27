import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const forgeProjects = mysqlTable("forge_projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  name: varchar("name", { length: 180 }).notNull(),
  slug: varchar("slug", { length: 220 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const forgeGenerations = mysqlTable("forge_generations", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId"),
  prompt: text("prompt").notNull(),
  style: varchar("style", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["pending", "completed", "failed"]).default("pending").notNull(),
  conceptUrl: text("conceptUrl"),
  modelUrl: text("modelUrl"),
  provider: varchar("provider", { length: 80 }),
  error: text("error"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const forgeReferences = mysqlTable("forge_references", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId"),
  generationId: int("generationId"),
  type: varchar("type", { length: 40 }).notNull(),
  label: varchar("label", { length: 180 }),
  url: text("url").notNull(),
  mimeType: varchar("mimeType", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ForgeProject = typeof forgeProjects.$inferSelect;
export type ForgeGeneration = typeof forgeGenerations.$inferSelect;
export type ForgeReference = typeof forgeReferences.$inferSelect;
