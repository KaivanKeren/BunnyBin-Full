import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BoundingBoxOverlay } from './BoundingBoxOverlay';
import type { CvDetection } from '../../api/contracts';

const detection = (overrides: Partial<CvDetection> = {}): CvDetection => ({
  category: 'organic',
  confidence: 0.91,
  bbox: [100, 80, 300, 260],
  timestamp: '2026-07-06T00:00:00Z',
  ...overrides,
});

describe('BoundingBoxOverlay', () => {
  it('menampilkan bounding box + label saat bbox tidak null', () => {
    render(<BoundingBoxOverlay detection={detection()} />);
    expect(screen.getByTestId('bounding-box')).toBeInTheDocument();
    expect(screen.getByText('Organik 91%')).toBeInTheDocument();
  });

  it('tidak render apapun saat bbox null', () => {
    render(<BoundingBoxOverlay detection={detection({ bbox: null })} />);
    expect(screen.queryByTestId('bounding-box')).not.toBeInTheDocument();
  });

  it('tidak render apapun saat kategori null (tidak ada objek)', () => {
    render(<BoundingBoxOverlay detection={detection({ category: null })} />);
    expect(screen.queryByTestId('bounding-box')).not.toBeInTheDocument();
  });
});
