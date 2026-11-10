import { PDFParse } from 'pdf-parse';

const MIN_TEXT_LENGTH = 100;

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({
    data: new Uint8Array(buffer),
    // Defense in depth for untrusted PDFs: never compile font code with
    // `new Function` (the CVE-2024-4367 class of bugs).
    isEvalSupported: false,
  });

  let text: string;
  try {
    // No "-- 3 of 20 --" page markers: the AI could mistake them for the
    // document's own page references.
    const result = await parser.getText({ pageJoiner: '' });
    text = result.text.trim();
  } catch {
    throw Object.assign(new Error('This file could not be read as a PDF.'), { status: 422 });
  } finally {
    await parser.destroy();
  }

  if (text.length < MIN_TEXT_LENGTH) {
    throw Object.assign(
      new Error(
        'This PDF appears to be image-based or contains no extractable text. ' +
          'Please use a text-based PDF.',
      ),
      { status: 422 },
    );
  }

  return text;
}
