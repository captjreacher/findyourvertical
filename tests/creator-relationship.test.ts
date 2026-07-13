// Pure-logic tests for the creator relationship/access contract.
// Run with: node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RELATIONSHIP_STATES,
  RELATIONSHIP_EVENT_TYPES,
  nextRelationshipState,
  canTransitionRelationship,
  STATE_EVENT,
  EVENT_STATE,
  fyvCreatorReference,
  relationshipEventCorrelationId,
  buildCreatorRelationshipEvent,
  buildAcceptInvitePath,
  describeInvitation,
  INVITATION_MESSAGES,
} from '../src/lib/creator-relationship.ts';

const FYV = '16bab1fb-df50-4101-9e2c-749ab7ed3d5e';
const FMF = '20fdee3c-6998-4e8a-8611-04ab88949301';
const REL = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('lifecycle order is draft → invited → accepted → active', () => {
  assert.deepEqual([...RELATIONSHIP_STATES], ['draft', 'invited', 'accepted', 'active']);
  assert.equal(nextRelationshipState('draft'), 'invited');
  assert.equal(nextRelationshipState('invited'), 'accepted');
  assert.equal(nextRelationshipState('accepted'), 'active');
  assert.equal(nextRelationshipState('active'), null);
});

test('only immediate forward transitions are legal', () => {
  assert.ok(canTransitionRelationship('draft', 'invited'));
  assert.ok(canTransitionRelationship('invited', 'accepted'));
  assert.ok(canTransitionRelationship('accepted', 'active'));
  assert.ok(!canTransitionRelationship('draft', 'accepted'));
  assert.ok(!canTransitionRelationship('invited', 'active'));
  assert.ok(!canTransitionRelationship('accepted', 'invited')); // no reversal
  assert.ok(!canTransitionRelationship('active', 'active'));
});

test('state ↔ event maps are consistent', () => {
  assert.deepEqual([...RELATIONSHIP_EVENT_TYPES], ['creator_invited', 'creator_accepted', 'creator_activated']);
  assert.equal(STATE_EVENT.invited, 'creator_invited');
  assert.equal(STATE_EVENT.accepted, 'creator_accepted');
  assert.equal(STATE_EVENT.active, 'creator_activated');
  for (const ev of RELATIONSHIP_EVENT_TYPES) {
    assert.equal(STATE_EVENT[EVENT_STATE[ev]], ev);
  }
});

test('canonical creator reference is fyv:<uuid> (never a username)', () => {
  assert.equal(fyvCreatorReference(FYV), `fyv:${FYV}`);
});

test('correlation id encodes relationship + state (deterministic dedupe)', () => {
  assert.equal(relationshipEventCorrelationId(REL, 'invited'), `fyv/creator-relationship/${REL}/invited`);
  assert.notEqual(
    relationshipEventCorrelationId(REL, 'invited'),
    relationshipEventCorrelationId(REL, 'accepted'),
  );
});

test('event payload has the exact FMF contract shape + canonical ids', () => {
  const p = buildCreatorRelationshipEvent({
    eventType: 'creator_invited',
    fyvCreatorId: FYV,
    fmfCreatorId: FMF,
    relationshipId: REL,
    relationshipState: 'invited',
    timestamp: '2026-07-13T01:23:45Z',
  });
  assert.deepEqual(p, {
    event_type: 'creator_invited',
    creator_id: FYV,
    creator_reference: `fyv:${FYV}`,
    fmf_creator_id: FMF,
    relationship_id: REL,
    source_product: 'FYV',
    relationship_state: 'invited',
    timestamp: '2026-07-13T01:23:45Z',
  });
  // No BetterFans username / handle / alias leaks into the payload.
  assert.ok(!JSON.stringify(p).toLowerCase().includes('leahsiren'));
});

test('event timestamp defaults to a UTC second-precision ISO string', () => {
  const p = buildCreatorRelationshipEvent({
    eventType: 'creator_activated',
    fyvCreatorId: FYV, fmfCreatorId: FMF, relationshipId: REL, relationshipState: 'active',
  });
  assert.match(p.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(p.relationship_state, 'active');
});

test('accept path carries a URL-encoded token', () => {
  assert.equal(buildAcceptInvitePath('abc123'), '/accept-invite?token=abc123');
  assert.ok(buildAcceptInvitePath('a b/c').includes('token=a%20b%2Fc'));
});

test('invitation failure codes have distinct human messages', () => {
  assert.equal(describeInvitation({ ok: true }), 'Invitation accepted.');
  const codes = ['invalid', 'revoked', 'expired', 'already_accepted', 'identity_conflict'] as const;
  const msgs = codes.map(c => describeInvitation({ ok: false, code: c }));
  assert.equal(new Set(msgs).size, codes.length, 'messages are distinct');
  for (const c of codes) assert.ok(INVITATION_MESSAGES[c].length > 0);
});
