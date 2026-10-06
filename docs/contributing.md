# Contributing

Start with research.md and architecture.md. Protocol fidelity comes before test count or presentation. Keep this project independent and preserve the evidence/governance boundary.

1. Inspect the current upstream requirement and pin the source revision. Distinguish merged semantics, examples, open proposals and ambiguities.
2. Add a versioned definition to `suites/jarvis/core.ts`: stable ID, category, purpose, requirement, references, setup, expected behavior, reproduction and possible causes.
3. Implement the scenario using `Context` and bounded `Transport`. Establish a positive control before a negative gate. A rejection must include the expected protocol error and an unchanged exposed snapshot.
4. Add a behavioral regression that demonstrates both the accepted case and the violation. Use actual HTTP for interactions; never branch target behavior on test IDs.
5. Bump suite/test versions for semantic changes. Update the research coverage matrix, limitations and documentation.
6. Run build and tests. Inspect generated evidence/HTML. Review secret handling, bounds, exit behavior and source fidelity.

Do not load code from targets or evidence; do not add arbitrary adapter modules, retries for unsafe mutations, protocol endpoints without source support, scores, official approval language or automatic issue publishing. Host-specific credentials/provisioning belong in explicit configuration and documentation.

The small module structure is intentional. Split the catalogue into per-area files when new suites justify it; do not manufacture packages for organizational appearance. Workstream and advanced Jarvis areas need separately researched scenarios and provisioning contracts.
