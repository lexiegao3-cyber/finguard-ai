import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const records=sqliteTable('records',{id:text('id').primaryKey(),owner:text('owner').notNull(),kind:text('kind').notNull(),payload:text('payload').notNull(),created:integer('created').notNull()});
