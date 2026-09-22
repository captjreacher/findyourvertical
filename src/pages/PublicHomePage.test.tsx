import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicHomePage } from './PublicHomePage';
import { createPublicAssessmentInvite } from '@/lib/creators-api';
import { deliverAssessmentInvitation } from '@/lib/email/deliverAssessmentInvitation';

// The issuance RPC + email seam are mocked; URL building and success copy come
// from the real shipped contract.
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

let scrollIntoView: ReturnType<typeof vi.fn>;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView'];
});

test('homepage CTA hierarchy: assessment starts first, Creator Login stays available', () => {
  render(
    <MemoryRouter>
      <PublicHomePage />
    </MemoryRouter>,
  );

  // Primary acquisition CTA.
  const cta = screen.getByRole('button', { name: 'Complete My Assessment' });
  // Returning creators keep a prominent, working sign-in path.
  expect(screen.getByRole('link', { name: 'Creator Login' })).toHaveAttribute('href', '/auth/login');
  expect(screen.getByRole('link', { name: 'Sign in to your Creator Portal' })).toHaveAttribute('href', '/auth/login');
  // The self-service start card is already on the page (no separate workflow).
  expect(screen.getByRole('heading', { name: 'Start Your Assessment' })).toBeInTheDocument();

  // The CTA moves the visitor into the start flow.
  fireEvent.click(cta);
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
});

test('homepage → assessment start → ready state with a usable start action', async () => {
  vi.mocked(createPublicAssessmentInvite).mockResolvedValue(INVITE);
  // Manual/no-op email provider: email is unavailable but the creator proceeds.
  vi.mocked(deliverAssessmentInvitation).mockResolvedValue({
    email: { to: 'emma@example.com', subject: '', html: '', text: '' },
    result: { delivered: false, mode: 'manual', provider: 'manual' },
    linkGenerated: true,
  } as never);

  render(
    <MemoryRouter>
      <PublicHomePage />
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Emma Rose' } });
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'emma@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Start My Assessment' }));

  const start = await screen.findByTestId('start-assessment-cta');
  expect(createPublicAssessmentInvite).toHaveBeenCalledWith({
    name: 'Emma Rose',
    email: 'emma@example.com',
    onlyfansHandle: null,
  });
  expect(start).toHaveAttribute('href', EXPECTED_URL);
  expect(screen.getByText('Your assessment is ready.')).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/not configured|manual delivery|smtp/i);
  // Creator Login is still reachable after the creator starts.
  expect(screen.getByRole('link', { name: 'Creator Login' })).toHaveAttribute('href', '/auth/login');
});
