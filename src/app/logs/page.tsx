export const dynamic = "force-dynamic";

import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { LogsList } from "./logs-list";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const search = q?.trim() ?? "";

  // Haal alle bedrijven op die notities hebben, met hun notities
  const businessesWithNotes = await db
    .select({
      business: schema.businesses,
      noteCount: sql<number>`count(${schema.notes.id})::int`,
    })
    .from(schema.businesses)
    .innerJoin(schema.notes, eq(schema.businesses.id, schema.notes.businessId))
    .where(
      search
        ? sql`lower(${schema.businesses.name}) like ${`%${search.toLowerCase()}%`}`
        : undefined
    )
    .groupBy(schema.businesses.id)
    .orderBy(desc(sql`max(${schema.notes.createdAt})`));

  // Haal alle notities op voor deze bedrijven
  const businessIds = businessesWithNotes.map((b) => b.business.id);

  let allNotes: { id: string; businessId: string; content: string; createdAt: Date }[] = [];
  if (businessIds.length > 0) {
    allNotes = await db
      .select({
        id: schema.notes.id,
        businessId: schema.notes.businessId,
        content: schema.notes.content,
        createdAt: schema.notes.createdAt,
      })
      .from(schema.notes)
      .where(sql`${schema.notes.businessId} IN ${businessIds}`)
      .orderBy(desc(schema.notes.createdAt));
  }

  // Groepeer notities per bedrijf
  const notesByBusiness = new Map<
    string,
    { id: string; content: string; createdAt: Date }[]
  >();
  for (const note of allNotes) {
    const existing = notesByBusiness.get(note.businessId) ?? [];
    existing.push({ id: note.id, content: note.content, createdAt: note.createdAt });
    notesByBusiness.set(note.businessId, existing);
  }

  const data = businessesWithNotes.map((row) => ({
    id: row.business.id,
    name: row.business.name,
    city: row.business.city,
    noteCount: row.noteCount,
    notes: notesByBusiness.get(row.business.id) ?? [],
  }));

  return (
    <div>
      <Header title="Logs" description="Alle notities per bedrijf" />
      <Card>
        <LogsList data={data} initialSearch={search} />
      </Card>
    </div>
  );
}
