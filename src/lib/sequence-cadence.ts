/**
 * Follow-up cadence dagen na de initial send (dag 0).
 * Eén rij per stap in sequence_queue. Hardcoded voor MVP — als we later
 * per-experiment configurable cadence willen, lift dit naar een kolom op
 * de experiments tabel.
 */
export const SEQUENCE_DAYS = [0, 3, 7, 14] as const;
export type SequenceStep = 0 | 1 | 2 | 3;

/**
 * Default Cadence experiment (static UUID) — gebruikt voor ad-hoc sends die
 * niet onder een echt variant-test experiment vallen. Geseed in migratie 0013.
 * Zorgt dat sequence_queue.experiment_id NOT NULL kan blijven zonder NULL hacks.
 */
export const DEFAULT_CADENCE_EXPERIMENT_ID = '00000000-0000-0000-0000-000000000001';
