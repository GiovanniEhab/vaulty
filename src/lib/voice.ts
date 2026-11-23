/**
 * Minimal Web Speech API wrappers. Recognition is Chrome/Edge/Safari only —
 * the assistant always keeps a typed fallback.
 */

export type VoiceLanguage = 'en' | 'ar';

export interface SpeechResultEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: { [index: number]: { transcript: string } };
  };
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return recognitionCtor() !== null;
}

export function recognitionLocale(language: VoiceLanguage): string {
  return language === 'ar' ? 'ar-EG' : 'en-US';
}

export function createRecognition(language: VoiceLanguage = 'en'): SpeechRecognitionLike | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = recognitionLocale(language);
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  return recognition;
}

export function speak(text: string, language: VoiceLanguage = 'en'): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = recognitionLocale(language);
    utterance.rate = 1.02;
    utterance.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((voice) => voice.lang.toLowerCase().startsWith(language === 'ar' ? 'ar' : 'en'));
    if (match) utterance.voice = match;

    window.speechSynthesis.speak(utterance);
  } catch {
    /* speech is a nice-to-have; never break the assistant over it */
  }
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
}
