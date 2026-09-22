import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PublicAssessmentStart } from './PublicAssessmentStart';
import { createPublicAssessmentInvite } from '@/lib/creators-api';
import { deliverAssessmentInvitation } from '@/lib/email/deliverAssessmentInvitation';

// The RPC + email seams are mocked; the URL builder and success-copy selector
// stay REAL so these tests exercise the shipped public-assessment contract.
vi.mock('@/lib/creators-api', () => ({ createPublicAssessmentInvite: vi.fn() }));
vi.mock('@/lib/email/deliverAssessmentInvitation', () => ({ deliverAssessmentInvitation: vi.fn() }));

const INVITE = {
  invite_link_id: '11111111-1111-1111-1111-111111111111',
  invite_code: 'abc123',
  template_id: '22222222-2222-2222-2222-222222222222',
  template_slug: 'default',
  creator_profile_id: '33333333-3333-3333-3333-333333333333',
  creator_email: 'emma@example.com',
  creator_name: 'Emma Rose',
  expires_at: '2027-01-01T00:00:00Z',
  reused: false,
  source: 'public' as const,
};

const EXPECTED_URL = 'https://findmyvertical.com/a/default?ref=abc123&email=emma%40example.com';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function submitRequest() {
  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Emma Rose' } });
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'emma@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Start My Assessment' }));
}

test('start uses the existing issuance contract and exposes a usable assessment action', async () => {
  vi.mocked(createPublicAssessmentInvite).mockResolvedValue(INVITE);
  vi.mocked(deliverAssessmentInvitation).mockResolvedValue({
    email: { to: 'emma@example.com', subject: '', html: '', text: '' },
    result: { delivered: true, mode: 'live', provider: 'test' },
    linkGenerated: true,
  } as never);

  render(<PublicAssessmentStart />);
  submitRequest();

  const start = await screen.findByTestId('start-assessment-cta');
  expect(createPublicAssessmentInvite).toHaveBeenCalledWith({
    name: 'Emma Rose',
    email: 'emma@example.com',
    onlyfansHandle: null,
  });
  // Canonical URL shape, built by the shared contract module.
  expect(start).toHaveAttribute('href', EXPECTED_URL);
  expect(start).toHaveTextContent('Start My Assessment');
  expect(screen.getByText('Your assessment is ready.')).toBeInTheDocument();
  expect(screen.getByTestId('copy-assessment-link')).toBeInTheDocument();
});

test('undelivered email still exposes the assessment: no internal delivery language', async () => {
  vi.mocked(createPublicAssessmentInvite).mockResolvedValue(INVITE);
  // Manual/no-op provider: the email is NOT configured to send.
  vi.mocked(deliverAssessmentInvitation).mockResolvedValue({
    email: { to: 'emma@example.com', subject: '', html: '', text: '' },
    result: { delivered: false, mode: 'manual', provider: 'manual' },
    linkGenerated: true,
  } as never);

  render(<PublicAssessmentStart />);
  submitRequest();

  expect(await screen.findByTestId('start-assessment-cta')).toHaveAttribute('href', EXPECTED_URL);
  expect(screen.getByText('Your assessment is ready.')).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/not configured/i);
  expect(document.body.textContent).not.toMatch(/manual delivery/i);
  expect(document.body.textContent).not.toMatch(/smtp|provider/i);
});

test('a throwing email provider cannot block assessment access', async () => {
  vi.mocked(createPublicAssessmentInvite).mockResolvedValue(INVITE);
  vi.mocked(deliverAssessmentInvitation).mockRejectedValue(new Error('provider exploded'));

  render(<PublicAssessmentStart />);
  submitRequest();

  expect(await screen.findByTestId('start-assessment-cta')).toHaveAttribute('href', EXPECTED_URL);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(document.body.textContent).not.toMatch(/provider exploded/i);
});

test('a reused invite tells the creator they can pick up where they left off', async () => {
  vi.mocked(createPublicAssessmentInvite).mockResolvedValue({ ...INVITE, reused: true });
  vi.mocked(deliverAssessmentInvitation).mockResolvedValue({
    email: { to: 'emma@example.com', subject: '', html: '', text: '' },
    result: { delivered: false, mode: 'manual', provider: 'manual' },
    linkGenerated: true,
  } as never);

  render(<PublicAssessmentStart />);
  submitRequest();

  expect(await screen.findByText(/reused your existing link/i)).toBeInTheDocument();
});

test('RPC validation errors surface as a retryable message, not a dead end', async () => {
  vi.mocked(createPublicAssessmentInvite).mockRejectedValue(new Error('A valid email is required'));

  render(<PublicAssessmentStart />);
  submitRequest();

  expect(await screen.findByRole('alert')).toHaveTextContent('A valid email is required');
  expect(screen.queryByTestId('start-assessment-cta')).toBeNull();
  // The form is still there so the creator can correct and retry.
  expect(screen.getByRole('button', { name: 'Start My Assessment' })).toBeEnabled();
  expect(deliverAssessmentInvitation).not.toHaveBeenCalled();
});
