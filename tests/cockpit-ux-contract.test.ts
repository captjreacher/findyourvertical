import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../src/components/cockpit/AssessmentTemplates.tsx', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../src/components/cockpit/AuthGate.tsx', import.meta.url), 'utf8');
const creatorGate = readFileSync(new URL('../src/components/creator/CreatorGate.tsx', import.meta.url), 'utf8');

test('question editor has canonical edit route and template edit navigates to it', () => {
  assert.match(app, /question-bank\/:questionId\/edit/);
  assert.match(editor, /question-bank\/\$\{question\.id\}\/edit/);
});

test('question drafts are session scoped, restorable, and explicitly discardable', () => {
  assert.match(editor, /sessionStorage\.setItem\(draftKey/);
  assert.match(editor, /Unsaved draft restored/);
  assert.match(editor, /Discard draft/);
  assert.match(editor, /sessionStorage\.removeItem\(draftKey/);
});

test('public landing exposes the creator authentication path', () => {
  assert.match(landing, /Existing creator\? Sign in/);
  assert.match(landing, /to="\/my"/);
});

test('creator authentication returns to the requested creator route', () => {
  assert.match(creatorGate, /location\.pathname\.startsWith\('\/my'\)/);
  assert.match(creatorGate, /signInWithOtp\(email, requestedPath\)/);
  assert.match(creatorGate, /setPhase\('agency'\)/);
});
