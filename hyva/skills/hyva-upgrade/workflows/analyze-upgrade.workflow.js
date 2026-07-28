export const meta = {
  name: 'hyva-analyze-upgrade',
  description: 'Analyzes a Hyvä upgrade: changelogs + per-override notes (deterministic upstream classification)',
  phases: [
    { title: 'Changelogs' },
    { title: 'Override notes' },
  ],
}

// args: { from, to, magnitude, crossesTailwindV4, workdir, worklist: [{file, classification, priority}, ...] }
// The classification is computed UPSTREAM by classify-changes.sh; the workflow does NOT reclassify.
const FROM = (args && args.from) || 'unknown'
const TO = (args && args.to) || 'latest'
const MAGNITUDE = (args && args.magnitude) || 'unknown'
const CROSSES_V4 = !!(args && args.crossesTailwindV4)
const WORKDIR = (args && args.workdir) || ''
const WORKLIST = (args && args.worklist) || []

const BREAKING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          version: { type: 'string' },
          title: { type: 'string' },
          impact: { type: 'string' },
          actions: { type: 'array', items: { type: 'string' } },
        },
        required: ['version', 'title', 'impact', 'actions'],
      },
    },
  },
  required: ['items'],
}

const NOTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { notes: { type: 'string' } },
  required: ['notes'],
}

phase('Changelogs')
const breaking = await agent(
  `Read the Hyvä changelogs (default-theme AND theme-module) between ${FROM} and ${TO}. ` +
  `Rely on the skill's references/breaking-changes.md and the online docs (references/doc-sources.md). ` +
  `Return the list of breaks to handle (reset-theme 1.4.0, Tailwind v4 1.4.0, etc.).`,
  { schema: BREAKING_SCHEMA, phase: 'Changelogs', label: 'changelogs' }
)

phase('Override notes')
const verdicts = await pipeline(
  WORKLIST,
  (item) => agent(
    `Override "${item.file}" — classification ALREADY established: ${item.classification} (${item.priority}). ` +
    `Do NOT reclassify. Read the patch in ${WORKDIR}/patches/ ` +
    `(name = relative path with "/" replaced by "__", .patch extension) and the theme override, ` +
    `then write SHORT NOTES on what needs to be carried over.`,
    { schema: NOTE_SCHEMA, phase: 'Override notes', label: `notes:${item.file}` }
  ).then((r) => ({ ...item, notes: (r && r.notes) || '' }))
)

return {
  from: FROM,
  to: TO,
  magnitude: MAGNITUDE,
  crossesTailwindV4: CROSSES_V4,
  breakingChanges: breaking.items || [],
  worklist: verdicts.filter(Boolean),
}
