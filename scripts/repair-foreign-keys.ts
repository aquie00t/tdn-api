/**
 * Restores foreign keys that are missing from a database.
 *
 * The `0_init` migration was recorded three times in `_prisma_migrations`, twice
 * without finishing, and the schema ended up without most of its foreign keys.
 * Every `onDelete: Cascade` the Prisma schema declares is therefore inert: a
 * deleted post leaves its comments, likes and bookmarks behind, and the user
 * purge job orphans everything a deleted user owned.
 *
 * The expected constraints are parsed out of the committed migration files
 * rather than hardcoded, so this stays correct as migrations are added.
 *
 * Usage:
 *   pnpm tsx scripts/repair-foreign-keys.ts                  # report only
 *   pnpm tsx scripts/repair-foreign-keys.ts --apply          # add missing keys
 *   pnpm tsx scripts/repair-foreign-keys.ts --apply --delete-orphans
 *
 * NODE_ENV selects the .env file, defaulting to development.
 *
 * Note on $queryRawUnsafe: identifiers are interpolated into the orphan and
 * DELETE statements because they cannot be bound as parameters. They come from
 * the committed migration files, never from user input.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Endpoints this script refuses to write to.
 *
 * Production and development currently share a connection string, so without
 * this guard `--apply` would alter the live database. Removing an entry is a
 * deliberate act, not a default.
 */
const PROTECTED_ENDPOINTS = ["ep-shiny-bonus-ajcqipxo"];

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

interface ExpectedForeignKey {
    /** Constraint name as declared in the migration */
    name: string;
    /** Table the constraint lives on */
    table: string;
    /** Column carrying the reference */
    column: string;
    /** Table being referenced */
    referencedTable: string;
    /** Column being referenced */
    referencedColumn: string;
    /** The verbatim ALTER TABLE statement */
    statement: string;
}

/**
 * Reads every committed migration and extracts its foreign key statements.
 *
 * @returns The constraints the schema is supposed to have, in file order
 */
function collectExpectedForeignKeys(): ExpectedForeignKey[] {
    const found: ExpectedForeignKey[] = [];
    const seen = new Set<string>();

    const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

    for (const dir of dirs) {
        const file = join(MIGRATIONS_DIR, dir, "migration.sql");
        if (!existsSync(file)) continue;

        const sql = readFileSync(file, "utf8");

        for (const rawStatement of sql.split(";")) {
            // Strip line comments before collapsing whitespace: folding a
            // "-- AddForeignKey" comment onto the same line as the statement
            // would put the statement inside the comment.
            const withoutComments = rawStatement
                .split("\n")
                .filter((line) => !line.trim().startsWith("--"))
                .join(" ");
            const statement = withoutComments.replace(/\s+/g, " ").trim();
            if (!/^ALTER TABLE .+ FOREIGN KEY /i.test(statement)) continue;

            const match =
                /^ALTER TABLE (?:"public"\.)?"([^"]+)" ADD CONSTRAINT "([^"]+)" FOREIGN KEY \("([^"]+)"\) REFERENCES (?:"public"\.)?"([^"]+)"\("([^"]+)"\)/i.exec(
                    statement,
                );
            if (!match) {
                console.warn("  ! ayristirilamadi:", statement.slice(0, 80));
                continue;
            }

            const [, table, name, column, referencedTable, referencedColumn] =
                match;
            if (seen.has(name)) continue;
            seen.add(name);

            found.push({
                name,
                table,
                column,
                referencedTable,
                referencedColumn,
                statement: `${statement};`,
            });
        }
    }

    return found;
}

/**
 * Entry point.
 */
async function main(): Promise<void> {
    const apply = process.argv.includes("--apply");
    const deleteOrphans = process.argv.includes("--delete-orphans");

    const envName = process.env.NODE_ENV || "development";
    const { parsed } = config({ path: `.env.${envName}` });
    const url = parsed?.DATABASE_URL ?? process.env.DATABASE_URL;

    if (!url) {
        throw new Error(`DATABASE_URL bulunamadi (.env.${envName})`);
    }

    const host = new URL(url).hostname;
    const endpoint = host.split(".")[0].replace(/-pooler$/, "");

    console.log(`ortam    : ${envName}`);
    console.log(`endpoint : ${endpoint}`);
    console.log(`mod      : ${apply ? "APPLY" : "dry-run"}\n`);

    if (apply && PROTECTED_ENDPOINTS.includes(endpoint)) {
        console.error(
            `REDDEDILDI: ${endpoint} korumali bir endpoint (production).\n` +
                `Bu script prod'a yazmaz. .env.${envName} icindeki DATABASE_URL'i\n` +
                `ayri bir dev veritabanina cevirdikten sonra tekrar calistir.`,
        );
        process.exitCode = 1;
        return;
    }

    const expected = collectExpectedForeignKeys();
    console.log(`migration'larda tanimli FK sayisi: ${expected.length}\n`);

    const adapter = new PrismaPg({ connectionString: url });
    const prisma = new PrismaClient({ adapter });

    try {
        const existingRows = await prisma.$queryRawUnsafe<
            { conname: string }[]
        >(
            `SELECT conname FROM pg_constraint WHERE contype = 'f'
             AND connamespace = 'public'::regnamespace`,
        );
        const existing = new Set(existingRows.map((row) => row.conname));

        const tableRows = await prisma.$queryRawUnsafe<
            { table_name: string }[]
        >(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
        );
        const tables = new Set(tableRows.map((row) => row.table_name));

        // A constraint whose table has not been created yet belongs to a
        // migration this database has not run; it is not a missing key.
        const notMigrated = expected.filter(
            (fk) =>
                !existing.has(fk.name) &&
                (!tables.has(fk.table) || !tables.has(fk.referencedTable)),
        );
        for (const fk of notMigrated) {
            console.log(
                `PENDING ${fk.table}.${fk.column} -> ${fk.referencedTable} ` +
                    "(tablo yok, migration uygulanmamis)",
            );
        }

        const missing = expected.filter(
            (fk) =>
                !existing.has(fk.name) &&
                tables.has(fk.table) &&
                tables.has(fk.referencedTable),
        );
        console.log(
            `mevcut: ${existing.size} | eksik: ${missing.length}\n` +
                "-".repeat(64),
        );

        let added = 0;
        let blocked = 0;

        for (const fk of missing) {
            const orphanRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
                `SELECT count(*) n FROM "${fk.table}" c
                 WHERE c."${fk.column}" IS NOT NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM "${fk.referencedTable}" p
                     WHERE p."${fk.referencedColumn}" = c."${fk.column}"
                   )`,
            );
            const orphans = Number(orphanRows[0].n);
            const label = `${fk.table}.${fk.column} -> ${fk.referencedTable}`;

            if (orphans > 0 && !deleteOrphans) {
                console.log(
                    `SKIP  ${label.padEnd(42)} ${orphans} yetim satir ` +
                        "(--delete-orphans ile temizlenir)",
                );
                blocked++;
                continue;
            }

            if (!apply) {
                console.log(
                    `WOULD ${label.padEnd(42)}` +
                        (orphans > 0 ? `${orphans} yetim silinecek` : "temiz"),
                );
                continue;
            }

            if (orphans > 0) {
                await prisma.$executeRawUnsafe(
                    `DELETE FROM "${fk.table}" c
                     WHERE c."${fk.column}" IS NOT NULL
                       AND NOT EXISTS (
                         SELECT 1 FROM "${fk.referencedTable}" p
                         WHERE p."${fk.referencedColumn}" = c."${fk.column}"
                       )`,
                );
                console.log(`      ${orphans} yetim satir silindi (${label})`);
            }

            await prisma.$executeRawUnsafe(fk.statement);
            console.log(`ADDED ${label}`);
            added++;
        }

        console.log("-".repeat(64));
        if (apply) {
            console.log(`eklendi: ${added} | atlandi: ${blocked}`);
        } else {
            console.log(
                `dry-run bitti. Uygulamak icin --apply ekle` +
                    (blocked > 0 ? " (yetimler icin --delete-orphans da)" : ""),
            );
        }

        const finalRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
            `SELECT count(*) n FROM pg_constraint WHERE contype = 'f'
             AND connamespace = 'public'::regnamespace`,
        );
        console.log(
            `veritabanindaki FK sayisi: ${Number(finalRows[0].n)} / ${expected.length}`,
        );
    } finally {
        await prisma.$disconnect();
    }
}

void main();
