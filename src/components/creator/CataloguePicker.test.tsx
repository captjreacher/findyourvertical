import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CataloguePicker, useCataloguePicker, buildLibraryIndex } from './CataloguePicker';
import type { ArchetypeVariation } from '@/types/creator';

// ── Mock the API module ──

const mockGetAllActiveArchetypeVariations = vi.fn();

vi.mock('@/lib/creators-api', () => ({
  getAllActiveArchetypeVariations: (...args: unknown[]) =>
    mockGetAllActiveArchetypeVariations(...args),
  getActiveVariationsForArchetypes: vi.fn().mockResolvedValue([]),
  generateMyPersonaPortfolio: vi.fn().mockResolvedValue({}),
  getMyArchetypeSnapshot: vi.fn().mockResolvedValue(null),
}));

// ── Fixtures ──

const FIXTURE_VARIATIONS: ArchetypeVariation[] = [
  { id: '1', archetype: 'Alternative / Tattooed', name: 'Goth Girlfriend', description: 'Dark and moody', is_active: true, display_order: 1, guidance: {}, created_at: '', updated_at: '' },
  { id: '2', archetype: 'Alternative / Tattooed', name: 'Punk Rock Queen', description: 'Edgy and rebellious', is_active: true, display_order: 2, guidance: {}, created_at: '', updated_at: '' },
  { id: '3', archetype: 'College Girl', name: 'Sorority Sweetheart', description: 'Bubbly and social', is_active: true, display_order: 1, guidance: {}, created_at: '', updated_at: '' },
  { id: '4', archetype: 'College Girl', name: 'Study Buddy', description: 'Focused and reliable', is_active: true, display_order: 2, guidance: {}, created_at: '', updated_at: '' },
  { id: '5', archetype: 'Dominatrix', name: 'Confident Power Player', description: 'Bold and commanding', is_active: true, display_order: 1, guidance: {}, created_at: '', updated_at: '' },
  { id: '6', archetype: 'Fitness', name: 'Gym Rat', description: 'Dedicated to gains', is_active: true, display_order: 1, guidance: {}, created_at: '', updated_at: '' },
  { id: '7', archetype: 'Cosplay', name: 'Anime Heroine', description: 'Bringing fiction to life', is_active: true, display_order: 1, guidance: {}, created_at: '', updated_at: '' },
  { id: '8', archetype: 'Goth', name: 'Dark Fantasy', description: 'Mysterious and creative', is_active: true, display_order: 1, guidance: {}, created_at: '', updated_at: '' },
];

function buildIndex() {
  return buildLibraryIndex(FIXTURE_VARIATIONS);
}

// ── Tests ──

describe('CataloguePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllActiveArchetypeVariations.mockResolvedValue(FIXTURE_VARIATIONS);
  });

  // ── Data Loading ──

  it('loads the full catalogue on mount', async () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();

    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={3}
        onDismiss={onDismiss}
        onConfirm={onConfirm}
      />,
    );

    // Wait for loading to finish - the picker shows archetype names, not variation names
    await waitFor(() => {
      expect(screen.getByText('Alternative / Tattooed')).toBeInTheDocument();
    });

    // Verify ALL 6 archetypes appear (not just 3)
    expect(screen.getByText('Alternative / Tattooed')).toBeInTheDocument();
    expect(screen.getByText('College Girl')).toBeInTheDocument();
    expect(screen.getByText('Dominatrix')).toBeInTheDocument();
    expect(screen.getByText('Fitness')).toBeInTheDocument();
    expect(screen.getByText('Cosplay')).toBeInTheDocument();
    expect(screen.getByText('Goth')).toBeInTheDocument();

    // Verify at least 6 distinct archetype entries (the number of unique archetypes in fixture)
    const buttons = document.querySelectorAll('[role="dialog"] button[type="button"]');
    // Exclude Cancel and Close buttons
    const catalogueButtons = Array.from(buttons).filter(b => !['Cancel', '✕'].includes(b.textContent?.trim() || ''));
    expect(catalogueButtons.length).toBeGreaterThanOrEqual(6);

    // Verify mock was called
    expect(mockGetAllActiveArchetypeVariations).toHaveBeenCalledTimes(1);
  });

  it('shows loading skeleton while fetching', () => {
    // Don't resolve the mock yet
    mockGetAllActiveArchetypeVariations.mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={3}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    // Should show loading state
    expect(screen.getByText(/Add from catalogue/)).toBeInTheDocument();
    // The skeleton rows are divs with animate-pulse
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error state when loading fails', async () => {
    mockGetAllActiveArchetypeVariations.mockRejectedValue(new Error('Network error'));

    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={3}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load the catalogue/)).toBeInTheDocument();
    });

    expect(screen.getByText('Network error')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  // ── Selection and Disabled States ──

  it('already-selected directions are shown dimmed and not interactive', async () => {
    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={['Alternative / Tattooed', 'College Girl']}
        remainingLimit={4}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Alternative / Tattooed')).toBeInTheDocument();
    });

    // Already-selected section heading
    expect(screen.getByText('Already in your list')).toBeInTheDocument();

    // Already-selected items have aria-disabled
    const alreadySelected = screen.getByText('Alternative / Tattooed').closest('[aria-disabled="true"]');
    expect(alreadySelected).toBeInTheDocument();

    // Unselected items are buttons (interactive)
    const dominatrixButton = screen.getByText('Dominatrix').closest('button');
    expect(dominatrixButton).toBeInTheDocument();
    expect(dominatrixButton).not.toBeDisabled();
  });

  it('shows variation count for each entry', async () => {
    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={6}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      // Two archetypes have 2 variations (Alternative / Tattooed and College Girl)
      const twoVariationEntries = screen.getAllByText('2 variations');
      expect(twoVariationEntries.length).toBe(2);
    });

    // Multiple archetypes have 1 variation
    const oneVariationEntries = screen.getAllByText('1 variation');
    expect(oneVariationEntries.length).toBe(4);
  });

  // ── Add Flow ──

  it('add flow allows multi-selection and confirm', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={['Alternative / Tattooed']}
        remainingLimit={2}
        onDismiss={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('College Girl')).toBeInTheDocument();
    });

    // Select two available directions
    const collegeBtn = screen.getByText('College Girl').closest('button')!;
    await user.click(collegeBtn);
    expect(collegeBtn).toHaveAttribute('aria-pressed', 'true');

    const dominatrixBtn = screen.getByText('Dominatrix').closest('button')!;
    await user.click(dominatrixBtn);
    expect(dominatrixBtn).toHaveAttribute('aria-pressed', 'true');

    // Confirm button should show count
    const confirmBtn = screen.getByText('Add selected (2)');
    expect(confirmBtn).not.toBeDisabled();

    await user.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(['College Girl', 'Dominatrix']);
  });

  it('disables confirm button when nothing selected', async () => {
    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={3}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Add selected')).toBeInTheDocument();
    });

    const confirmBtn = screen.getByText('Add selected');
    expect(confirmBtn).toBeDisabled();
  });

  it('respects remaining limit in add mode', async () => {
    const user = userEvent.setup();

    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={['Alternative / Tattooed']}
        remainingLimit={1}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('College Girl')).toBeInTheDocument();
    });

    // Select first direction
    await user.click(screen.getByText('College Girl').closest('button')!);

    // Try to select a second (should be blocked by remainingLimit)
    await user.click(screen.getByText('Dominatrix').closest('button')!);

    // The second one should not be selected
    const dominatrixBtn = screen.getByText('Dominatrix').closest('button')!;
    expect(dominatrixBtn).not.toHaveAttribute('aria-pressed', 'true');
  });

  // ── Replace Flow ──

  it('replace mode excludes the direction being replaced and already-selected ones', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <CataloguePicker
        mode="replace"
        replacingArchetype="College Girl"
        alreadyUsedArchetypes={['Alternative / Tattooed']}
        remainingLimit={1}
        onDismiss={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Replace direction')).toBeInTheDocument();
    });

    // The being-replaced direction should NOT appear
    expect(screen.queryByText('College Girl')).not.toBeInTheDocument();

    // Already-selected direction should NOT appear
    expect(screen.queryByText('Alternative / Tattooed')).not.toBeInTheDocument();

    // Other directions should be available
    expect(screen.getByText('Dominatrix')).toBeInTheDocument();
    expect(screen.getByText('Fitness')).toBeInTheDocument();

    // Click on an available direction should auto-confirm
    await user.click(screen.getByText('Dominatrix').closest('button')!);
    expect(onConfirm).toHaveBeenCalledWith(['Dominatrix']);
  });

  it('replace mode has no Add selected button', async () => {
    render(
      <CataloguePicker
        mode="replace"
        replacingArchetype="College Girl"
        alreadyUsedArchetypes={[]}
        remainingLimit={1}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Replace direction')).toBeInTheDocument();
    });

    expect(screen.queryByText('Add selected')).not.toBeInTheDocument();
  });

  // ── Search ──

  it('search filters the complete catalogue', async () => {
    const user = userEvent.setup();

    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={6}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Alternative / Tattooed')).toBeInTheDocument();
    });

    // Get the search input
    const searchInput = screen.getByLabelText('Search creative directions');
    await user.type(searchInput, 'college');

    // Only College Girl should show now
    expect(screen.getByText('College Girl')).toBeInTheDocument();
    expect(screen.queryByText('Alternative / Tattooed')).not.toBeInTheDocument();
    expect(screen.queryByText('Dominatrix')).not.toBeInTheDocument();
  });

  it('search is case-insensitive', async () => {
    const user = userEvent.setup();

    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={6}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Alternative / Tattooed')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText('Search creative directions');
    await user.type(searchInput, 'COLLEGE');

    expect(screen.getByText('College Girl')).toBeInTheDocument();
  });

  it('clearing search restores full catalogue', async () => {
    const user = userEvent.setup();

    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={6}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Alternative / Tattooed')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText('Search creative directions');
    await user.type(searchInput, 'college');
    expect(screen.queryByText('Alternative / Tattooed')).not.toBeInTheDocument();

    await user.clear(searchInput);
    expect(screen.getByText('Alternative / Tattooed')).toBeInTheDocument();
    expect(screen.getByText('Dominatrix')).toBeInTheDocument();
  });

  it('shows empty state when search has no matches', async () => {
    const user = userEvent.setup();

    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={6}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Alternative / Tattooed')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText('Search creative directions');
    await user.type(searchInput, 'zzzzzzzz');

    await waitFor(() => {
      expect(screen.getByText(/No directions matching/)).toBeInTheDocument();
    });
  });

  // ── Accessibility ──

  it('has dialog role and accessible name', async () => {
    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={3}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Add creative directions from catalogue');
  });

  it('Escape key calls onDismiss', async () => {
    const onDismiss = vi.fn();

    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={3}
        onDismiss={onDismiss}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('close button has accessible label', async () => {
    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={3}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const closeBtn = screen.getByLabelText('Close');
    expect(closeBtn).toBeInTheDocument();
  });

  it('search input has accessible label', () => {
    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={3}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Search creative directions')).toBeInTheDocument();
  });

  // ── Submit error handling ──

  it('shows submit error when confirm throws', async () => {
    const onConfirm = vi.fn().mockImplementation(() => {
      throw new Error('Save failed');
    });
    const user = userEvent.setup();

    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={3}
        onDismiss={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('College Girl')).toBeInTheDocument();
    });

    // Select and confirm
    await user.click(screen.getByText('College Girl').closest('button')!);
    await user.click(screen.getByText(/Add selected/).closest('button')!);

    // Error should be visible
    await waitFor(() => {
      expect(screen.getByText('Save failed')).toBeInTheDocument();
    });

    // Picker should still be open (not dismissed)
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('prevents duplicate submissions', async () => {
    let callCount = 0;
    const onConfirm = vi.fn().mockImplementation(() => {
      callCount++;
    });
    const user = userEvent.setup();

    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={3}
        onDismiss={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('College Girl')).toBeInTheDocument();
    });

    // Select and get the add button
    await user.click(screen.getByText('College Girl').closest('button')!);
    const addBtn = screen.getByText(/Add selected/);

    // Click multiple times rapidly
    await user.click(addBtn);
    await user.click(addBtn);
    await user.click(addBtn);

    // Should only have confirmed once
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  // ── Portal rendering ──

  it('renders into document.body via portal', async () => {
    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={3}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    // The dialog should be a child of body, not the rendered container
    const dialog = screen.getByRole('dialog');
    expect(dialog.parentElement).toBe(document.body);
  });

  // ── Scrollable results region ──

  it('has overflow-y-auto on results region', async () => {
    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={3}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('College Girl')).toBeInTheDocument();
    });

    // The scrollable container is the one with overflow-y-auto
    const scrollContainer = document.querySelector('.overflow-y-auto');
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer).toHaveClass('overflow-y-auto');
  });

  // ── Background scroll lock ──

  it('locks body scroll while open and restores on unmount', () => {
    const { unmount } = render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={3}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  // ── Add from catalogue button states ──

  it('shows "Added" badge on already-selected directions', async () => {
    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={['Alternative / Tattooed']}
        remainingLimit={5}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Added')).toBeInTheDocument();
    });
  });

  it('shows "Selected" badge on user-selected directions', async () => {
    const user = userEvent.setup();

    render(
      <CataloguePicker
        mode="add"
        alreadyUsedArchetypes={[]}
        remainingLimit={3}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('College Girl')).toBeInTheDocument();
    });

    await user.click(screen.getByText('College Girl').closest('button')!);
    expect(screen.getByText('Selected')).toBeInTheDocument();
  });
});

// ── Hook tests ──

describe('useCataloguePicker', () => {
  it('returns closed state initially', () => {
    function TestComponent() {
      const picker = useCataloguePicker({ alreadyUsedArchetypes: [] });
      return <div data-testid="state">{JSON.stringify({ isOpen: picker.isOpen, mode: picker.mode })}</div>;
    }

    render(<TestComponent />);
    const state = JSON.parse(screen.getByTestId('state').textContent!);
    expect(state.isOpen).toBe(false);
    expect(state.mode).toBeNull();
  });

  it('openAddPicker sets mode to add', async () => {
    function TestComponent() {
      const picker = useCataloguePicker({ alreadyUsedArchetypes: [] });
      return (
        <div>
          <div data-testid="state">{JSON.stringify({ isOpen: picker.isOpen, mode: picker.mode })}</div>
          <button onClick={picker.openAddPicker}>Open Add</button>
          {picker.renderPicker(vi.fn())}
        </div>
      );
    }

    render(<TestComponent />);
    await userEvent.click(screen.getByText('Open Add'));

    const state = JSON.parse(screen.getByTestId('state').textContent!);
    expect(state.isOpen).toBe(true);
    expect(state.mode).toBe('add');
  });

  it('openReplacePicker sets mode to replace with correct archetype', async () => {
    function TestComponent() {
      const picker = useCataloguePicker({ alreadyUsedArchetypes: ['Already Used'] });
      return (
        <div>
          <div data-testid="state">{JSON.stringify({ isOpen: picker.isOpen, mode: picker.mode, archetype: picker.replacingArchetype })}</div>
          <button onClick={() => picker.openReplacePicker('Test Archetype')}>Open Replace</button>
          {picker.renderPicker(vi.fn())}
        </div>
      );
    }

    render(<TestComponent />);
    await userEvent.click(screen.getByText('Open Replace'));

    const state = JSON.parse(screen.getByTestId('state').textContent!);
    expect(state.isOpen).toBe(true);
    expect(state.mode).toBe('replace');
    expect(state.archetype).toBe('Test Archetype');
  });

  it('renderPicker returns null when closed', () => {
    function TestComponent() {
      const picker = useCataloguePicker({ alreadyUsedArchetypes: [] });
      return <div data-testid="rendered">{picker.renderPicker(vi.fn()) ? 'visible' : 'hidden'}</div>;
    }

    render(<TestComponent />);
    expect(screen.getByTestId('rendered').textContent).toBe('hidden');
  });
});

// ── buildLibraryIndex tests ──

describe('buildLibraryIndex', () => {
  it('groups variations by archetype', () => {
    const index = buildLibraryIndex(FIXTURE_VARIATIONS);
    expect(index.size).toBe(6); // 6 unique archetypes
    const altEntry = index.get('Alternative / Tattooed')!;
    expect(altEntry.variations.length).toBe(2);
    expect(altEntry.variations[0].name).toBe('Goth Girlfriend');
    expect(altEntry.variations[1].name).toBe('Punk Rock Queen');
  });

  it('sorts variations by display_order then name', () => {
    const unsorted: ArchetypeVariation[] = [
      { id: 'b', archetype: 'Test', name: 'Beta', description: '', is_active: true, display_order: 2, guidance: {}, created_at: '', updated_at: '' },
      { id: 'a', archetype: 'Test', name: 'Alpha', description: '', is_active: true, display_order: 1, guidance: {}, created_at: '', updated_at: '' },
      { id: 'c', archetype: 'Test', name: 'Gamma', description: '', is_active: true, display_order: 3, guidance: {}, created_at: '', updated_at: '' },
    ];
    const index = buildLibraryIndex(unsorted);
    const entry = index.get('Test')!;
    expect(entry.variations[0].name).toBe('Alpha');
    expect(entry.variations[1].name).toBe('Beta');
    expect(entry.variations[2].name).toBe('Gamma');
  });

  it('sets description from first variation', () => {
    const index = buildLibraryIndex(FIXTURE_VARIATIONS);
    const altEntry = index.get('Alternative / Tattooed')!;
    expect(altEntry.description).toBe('Dark and moody');
  });

  it('returns empty map for empty input', () => {
    const index = buildLibraryIndex([]);
    expect(index.size).toBe(0);
  });
});
