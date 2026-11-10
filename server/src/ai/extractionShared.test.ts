import { describe, it, expect } from 'vitest';
import { parseExtractionResponse } from './extractionShared';

describe('parseExtractionResponse', () => {
  it('keeps page references in "source", separate from the answer', () => {
    const pairs = parseExtractionResponse(
      JSON.stringify({
        pairs: [
          {
            question: '¿Qué es X?',
            answer: 'X es una prueba.',
            topic: 'Tema 1',
            source: ' Fuente en el documento: págs. 3, 11 ',
          },
          { question: '¿Y?', answer: 'Y.', topic: null },
        ],
      }),
    );
    expect(pairs[0]).toEqual({
      question: '¿Qué es X?',
      answer: 'X es una prueba.',
      topic: 'Tema 1',
      source: 'Fuente en el documento: págs. 3, 11',
    });
    expect(pairs[1].source).toBeNull();
  });

  it('tolerates markdown fences around the JSON', () => {
    const pairs = parseExtractionResponse('```json\n{"pairs":[{"question":"Q","answer":"A"}]}\n```');
    expect(pairs).toHaveLength(1);
  });
});
