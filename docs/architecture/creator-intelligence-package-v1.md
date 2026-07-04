# Creator Intelligence Package v1

## Boundary

Find Your Vertical owns assessment, scoring, vertical and archetype derivation, derived scenarios, opportunity identification, and the versioned intelligence snapshot.

FunkMyFans can later consume the published package, project it into its own operational model, and adapt journeys or playbooks from that snapshot.

## Purpose

This package is the stable, product-neutral contract between FYV and FMF. It is intentionally transport-neutral and does not choose API push, webhook, event bus, file import, or any other delivery mechanism.

The package is immutable once published. A reassessment should create a new package version rather than mutate historical intelligence.

## What v1 Includes

- Identity with source and correlation references
- Provenance with producer, contract version, intelligence result version, assessment reference, template version when available, and generation timestamps
- Positioning with a primary vertical, a role-based archetype journey, confidence, and rationale
- Derived scenarios with archetype progression, narrative progression, applicable journey types, and warnings
- Opportunities with a stable reference, journey type, related scenario reference, rationale, confidence, priority, and intelligence-level state

## What v1 Excludes

- No API endpoints, webhooks, queues, or UI
- No shared database tables
- No dependency on FYV or FMF internal IDs or schemas
- No FMF operational states such as accepted, configured, generated, active, paused, or retired
- No master identity resolution architecture
- No creator-style projection data unless a separately owned style profile already exists

## Guidance For Future Consumers

Treat the package as an immutable published snapshot.

Use the stable references to correlate records without coupling to internal database keys.

Keep FMF operational state, journey selection, playbook generation, activation, and optimisation outside the FYV contract.

Preserve the distinction between universal commercial journeys and creator-specific narrative treatment so scenarios can be reused without template explosion.
