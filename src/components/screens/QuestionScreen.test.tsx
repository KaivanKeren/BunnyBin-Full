import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuestionScreen } from './QuestionScreen';
import type { QuizItem } from '../../api/contracts';

const quizItem: QuizItem = {
  id: 'q-kulit-pisang',
  category: 'organic',
  item_name: 'kulit pisang',
  image_url: 'data:,',
  explanation: 'membusuk jadi pupuk',
  active: true,
};

describe('QuestionScreen', () => {
  it('mode manual menampilkan gambar & nama item bank soal', () => {
    render(<QuestionScreen mode="manual" quizItem={quizItem} onAnswer={() => {}} />);
    expect(screen.getByText('kulit pisang')).toBeInTheDocument();
    expect(screen.getByAltText('kulit pisang')).toBeInTheDocument();
  });

  it('mode cv TIDAK membocorkan kategori/item — anak harus menebak sendiri', () => {
    render(<QuestionScreen mode="cv" quizItem={quizItem} onAnswer={() => {}} />);
    expect(screen.queryByText('kulit pisang')).not.toBeInTheDocument();
    expect(
      screen.getByText(/sampah yang kamu pegang itu sampah apa/i),
    ).toBeInTheDocument();
  });

  it('klik tombol memanggil onAnswer dengan kategori yang benar', () => {
    const onAnswer = vi.fn();
    render(<QuestionScreen mode="cv" quizItem={null} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: /^🍃 organik$/i }));
    expect(onAnswer).toHaveBeenCalledWith('organic');
    fireEvent.click(screen.getByRole('button', { name: /^🧴 anorganik$/i }));
    expect(onAnswer).toHaveBeenCalledWith('inorganic');
  });
});
