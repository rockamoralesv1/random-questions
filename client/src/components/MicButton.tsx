import type { STTState } from '../hooks/useSpeechRecognition';

interface MicButtonProps {
  state: STTState;
  onStart: () => void;
  onStop: () => void;
}

export function MicButton({ state, onStart, onStop }: MicButtonProps) {
  const isListening = state === 'listening';
  const isProcessing = state === 'processing';
  const isDisabled = isProcessing;

  return (
    <button
      onClick={isListening ? onStop : onStart}
      disabled={isDisabled}
      className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all
        ${isListening
          ? 'bg-red-500 hover:bg-red-600'
          : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
        }`}
      title={isListening ? 'Stop recording' : 'Start recording'}
    >
      {/* Pulsing ring while listening */}
      {isListening && (
        <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-60" />
      )}

      {isProcessing ? (
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ) : (
        <svg
          className="w-7 h-7 text-white relative z-10"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
          <path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V20H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.07A7 7 0 0 0 19 11z" />
        </svg>
      )}
    </button>
  );
}
