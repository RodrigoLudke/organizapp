import * as SQLite from "expo-sqlite";

export type Section = {
  id: number;
  name: string;
  icon: string;
  color: string;
  created_at: number;
};

export type NewSection = {
  name: string;
  icon: string;
  color: string;
};

export type Item = {
  id: number;
  section_id: number;
  title: string;
  content: string;
  done: number; // 0 | 1 (SQLite não tem boolean)
  remind_at: number | null; // timestamp em ms, ou null
  notification_id: string | null;
  created_at: number;
  updated_at: number;
};

export type NewItem = {
  section_id: number;
  title: string;
  content: string;
  remind_at?: number | null;
  notification_id?: string | null;
};

// Uma única conexão reutilizada em todo o app.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("organizapp.db");
  }
  return dbPromise;
}

export async function initDatabase(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`PRAGMA journal_mode = WAL;`);

  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version"
  );
  const version = versionRow?.user_version ?? 0;

  if (version === 0) {
    const hasItems = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='items'`
    );

    if (!hasItems || hasItems.count === 0) {
      // Instalação nova — cria schema direto
      await db.execAsync(`
        CREATE TABLE sections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          icon TEXT NOT NULL DEFAULT '📁',
          color TEXT NOT NULL DEFAULT '#6C5CE7',
          created_at INTEGER NOT NULL
        );
        CREATE TABLE items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          section_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          done INTEGER NOT NULL DEFAULT 0,
          remind_at INTEGER,
          notification_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_items_updated ON items(updated_at DESC);
      `);
    } else {
      // Migração do schema antigo (tinha coluna type)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS sections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          icon TEXT NOT NULL DEFAULT '📁',
          color TEXT NOT NULL DEFAULT '#6C5CE7',
          created_at INTEGER NOT NULL
        );
      `);

      const now = Date.now();
      await db.runAsync(
        `INSERT OR IGNORE INTO sections (id, name, icon, color, created_at) VALUES (1, 'Ideias', '💡', '#FFD166', ?)`,
        [now]
      );
      await db.runAsync(
        `INSERT OR IGNORE INTO sections (id, name, icon, color, created_at) VALUES (2, 'Notas', '📝', '#4ECDC4', ?)`,
        [now]
      );
      await db.runAsync(
        `INSERT OR IGNORE INTO sections (id, name, icon, color, created_at) VALUES (3, 'Lembretes', '⏰', '#8B7FF0', ?)`,
        [now]
      );

      // Adiciona coluna section_id (pode já existir se migração anterior falhou)
      try {
        await db.execAsync(
          `ALTER TABLE items ADD COLUMN section_id INTEGER DEFAULT 1`
        );
      } catch (_) {
        // Coluna já existe — ignora
      }

      // Mapeia type → section_id
      await db.execAsync(`
        UPDATE items SET section_id = 1 WHERE type = 'idea';
        UPDATE items SET section_id = 2 WHERE type = 'note';
        UPDATE items SET section_id = 3 WHERE type = 'reminder';
        UPDATE items SET section_id = 1 WHERE section_id IS NULL;
      `);

      // Recria tabela sem coluna type
      await db.execAsync(`
        CREATE TABLE items_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          section_id INTEGER NOT NULL DEFAULT 1,
          title TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          done INTEGER NOT NULL DEFAULT 0,
          remind_at INTEGER,
          notification_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        INSERT INTO items_new
          SELECT id, section_id, title, content, done, remind_at, notification_id, created_at, updated_at
          FROM items;
        DROP TABLE items;
        ALTER TABLE items_new RENAME TO items;
        CREATE INDEX IF NOT EXISTS idx_items_updated ON items(updated_at DESC);
      `);
    }

    await db.execAsync(`PRAGMA user_version = 1;`);
  }
}

// ─── Seções ─────────────────────────────────────────────────────────────────

export async function listSections(): Promise<Section[]> {
  const db = await getDb();
  return db.getAllAsync<Section>(
    `SELECT * FROM sections ORDER BY created_at ASC`
  );
}

export async function createSection(section: NewSection): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO sections (name, icon, color, created_at) VALUES (?, ?, ?, ?)`,
    [section.name, section.icon, section.color, now]
  );
  return result.lastInsertRowId;
}

export async function deleteSection(id: number): Promise<void> {
  const db = await getDb();
  // Cancela notificações dos itens antes de deletar
  const sectionItems = await db.getAllAsync<{ notification_id: string | null }>(
    `SELECT notification_id FROM items WHERE section_id = ?`,
    [id]
  );
  for (const it of sectionItems) {
    if (it.notification_id) {
      try {
        const { cancelReminder } = await import("../lib/notifications");
        await cancelReminder(it.notification_id);
      } catch (_) {}
    }
  }
  await db.runAsync(`DELETE FROM items WHERE section_id = ?`, [id]);
  await db.runAsync(`DELETE FROM sections WHERE id = ?`, [id]);
}

export async function countItemsInSection(id: number): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM items WHERE section_id = ?`,
    [id]
  );
  return row?.count ?? 0;
}

// ─── Itens ───────────────────────────────────────────────────────────────────

export async function listItems(
  sectionId?: number | null,
  done?: boolean | null,
  search = ""
): Promise<Item[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (sectionId != null) {
    conditions.push("section_id = ?");
    params.push(sectionId);
  }

  if (done != null) {
    conditions.push("done = ?");
    params.push(done ? 1 : 0);
  }

  if (search.trim()) {
    conditions.push("(title LIKE ? OR content LIKE ?)");
    const q = `%${search.trim()}%`;
    params.push(q, q);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return db.getAllAsync<Item>(
    `SELECT * FROM items ${where} ORDER BY done ASC, updated_at DESC`,
    params
  );
}

export async function getItem(id: number): Promise<Item | null> {
  const db = await getDb();
  return db.getFirstAsync<Item>(`SELECT * FROM items WHERE id = ?`, [id]);
}

export async function createItem(item: NewItem): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO items (section_id, title, content, remind_at, notification_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      item.section_id,
      item.title,
      item.content,
      item.remind_at ?? null,
      item.notification_id ?? null,
      now,
      now,
    ]
  );
  return result.lastInsertRowId;
}

export async function updateItem(
  id: number,
  fields: Partial<NewItem>
): Promise<void> {
  const db = await getDb();
  const current = await getItem(id);
  if (!current) return;
  await db.runAsync(
    `UPDATE items
     SET section_id = ?, title = ?, content = ?, remind_at = ?, notification_id = ?, updated_at = ?
     WHERE id = ?`,
    [
      fields.section_id ?? current.section_id,
      fields.title ?? current.title,
      fields.content ?? current.content,
      fields.remind_at !== undefined ? fields.remind_at : current.remind_at,
      fields.notification_id !== undefined
        ? fields.notification_id
        : current.notification_id,
      Date.now(),
      id,
    ]
  );
}

export async function toggleDone(id: number, done: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE items SET done = ?, updated_at = ? WHERE id = ?`,
    [done ? 1 : 0, Date.now(), id]
  );
}

export async function deleteItem(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM items WHERE id = ?`, [id]);
}
