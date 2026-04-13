import type { STTState } from '../hooks/useSpeechRecognition';
import type { Lang } from '../i18n';

interface MicButtonProps {
  state: STTState;
  onStart: () => void;
  onStop: () => void;
  lang?: Lang;
}

const LABELS: Record<STTState, { en: string; es: string }> = {
  idle:       { en: 'Tap to speak',   es: 'Toca para hablar'   },
  connecting: { en: 'Starting mic…',  es: 'Iniciando mic…'     },
  listening:  { en: 'Listening…',     es: 'Escuchando…'        },
  processing: { en: 'Processing…',    es: 'Procesando…'        },
  result:     { en: 'Tap to retry',   es: 'Toca para repetir'  },
  error:      { en: 'Tap to retry',   es: 'Toca para repetir'  },
};

export function MicButton({ state, onStart, onStop, lang = 'en' }: MicButtonProps) {
  const isListening  = state === 'listening';
  const isConnecting = state === 'connecting';
  const isProcessing = state === 'processing';
  const isDisabled   = isProcessing;
  const label        = LABELS[state][lang];

  const handleClick = () => {
    if (isDisabled) return;
    if (isListening) onStop();
    else onStart();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleClick}
        disabled={isDisabled}
        className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all
          ${isListening
            ? 'bg-red-500 hover:bg-red-600'
            : isConnecting
              ? 'bg-yellow-400 cursor-wait'
              : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        title={label}
      >
        {/* Pulsing ring while listening */}
        {isListening && (
          <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-60" />
        )}
        {/* Slow pulse while connecting */}
        {isConnecting && (
          <span className="absolute inset-0 rounded-full bg-yellow-300 animate-pulse opacity-70" />
        )}

        {isProcessing || isConnecting ? (
          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-7 h-7 text-white relative z-10" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
            <path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V20H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.07A7 7 0 0 0 19 11z" />
          </svg>
        )}
      </button>

      {/* State label */}
      <span className={`text-xs font-medium ${
        isListening  ? 'text-red-500'    :
        isConnecting ? 'text-yellow-600' :
        isProcessing ? 'text-blue-500'   :
        'text-gray-400'
      }`}>
        {label}
      </span>
    </div>
  );
}
