import pdfParse from 'pdf-parse';

const MIN_TEXT_LENGTH = 100;

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  const text = data.text.trim();

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
