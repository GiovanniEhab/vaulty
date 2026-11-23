import { useEffect, useRef, useState, type FormEvent } from 'react';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import { Switch } from '../components/Field';
import { ASSISTANT_SUGGESTIONS, planCommand } from '../lib/assistant';
import { notificationPermission, requestNotificationPermission } from '../lib/notifications';
import { createRecognition, isSpeechRecognitionSupported, speak, stopSpeaking, type SpeechRecognitionLike } from '../lib/voice';
import { useVault } from '../store/VaultContext';
import { useUI } from '../ui/UIContext';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const HELLO = 'Hi. Tell me what to add, move or change — for example "spent 250 on groceries".';
const HELLO_AR = 'أهلاً. قولي أسجل إيه أو أغيّر إيه — مثلاً "صرفت ٢٥٠ على البقالة".';

export function AssistantSheet({ onClose }: { onClose: () => void }) {
  const { state, saveTransaction, saveBudget, contributeToGoal, deleteTransaction, updateSettings } = useVault();
  const { setView, setPlanTab, openSheet } = useUI();
  const language = state.assistantLanguage;
  const isArabic = language === 'ar';

  const [messages, setMessages] = useState<Message[]>([
    { id: 'hello', role: 'assistant', text: language === 'ar' ? HELLO_AR : HELLO },
  ]);
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const supported = isSpeechRecognitionSupported();

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, listening]);

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      stopSpeaking();
    },
    [],
  );

  const push = (role: Message['role'], text: string) =>
    setMessages((prev) => [...prev, { id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role, text }]);

  const run = async (input: string) => {
    const command = input.trim();
    if (!command) return;
    push('user', command);

    const plan = planCommand(command, state, language);
    let reply = plan.reply;

    switch (plan.kind) {
      case 'transaction':
        saveTransaction(plan.transaction);
        break;
      case 'budget':
        saveBudget(plan.budget);
        break;
      case 'goal':
        contributeToGoal(plan.goalId, plan.delta);
        break;
      case 'delete':
        deleteTransaction(plan.id);
        break;
      case 'navigate':
        setPlanTab(plan.planTab ?? 'budgets');
        setView(plan.view);
        break;
      case 'insights':
        openSheet({ kind: 'insights' });
        break;
      case 'settings':
        if (plan.patch.notificationsEnabled && notificationPermission() !== 'granted') {
          const granted = await requestNotificationPermission();
          if (!granted) {
            reply = 'Notifications are blocked in this browser. Allow them in the site settings and ask again.';
            updateSettings({ notificationsEnabled: false });
            break;
          }
        }
        updateSettings(plan.patch);
        break;
      case 'answer':
      default:
        break;
    }

    push('assistant', reply);

    const shouldSpeak =
      plan.kind === 'settings' && plan.patch.voiceReplies !== undefined ? plan.patch.voiceReplies : state.voiceReplies;
    if (shouldSpeak) speak(reply, /[\u0600-\u06FF]/.test(reply) ? 'ar' : 'en');
  };

  const toggleListening = () => {
    if (!supported) {
      setError('Voice input is not available in this browser. Type your command below — it works the same.');
      return;
    }
    if (listening) {
      recognitionRef.current?.abort();
      setListening(false);
      return;
    }
    const recognition = createRecognition(language);
    if (!recognition) {
      setError('Could not start the microphone. Type your command instead.');
      return;
    }
    recognition.onresult = (event) => {
      const transcript = event.results[event.resultIndex]?.[0]?.transcript ?? '';
      setListening(false);
      if (transcript) void run(transcript);
    };
    recognition.onerror = (event) => {
      setListening(false);
      setError(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone access was blocked. Allow it in the browser, or type your command.'
          : `Voice input failed (${event.error}). You can type your command instead.`,
      );
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setError('Could not start the microphone. Type your command instead.');
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft;
    setDraft('');
    void run(value);
  };

  return (
    <Sheet title={isArabic ? 'مساعد Vaulty' : 'Vaulty Assistant'} onClose={onClose}>
      <div className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {isArabic ? 'اتكلم أو اكتب بالعربي أو الإنجليزي' : 'Speak or type in English or Arabic'}
          </span>
          <div className="flex shrink-0 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {(['en', 'ar'] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => updateSettings({ assistantLanguage: code })}
                className={`rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
                  language === code ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {code === 'en' ? 'English' : 'العربية'}
              </button>
            ))}
          </div>
        </div>
        <div
          ref={transcriptRef}
          className="no-scrollbar max-h-[34vh] space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60"
        >
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                dir="auto"
                className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  message.role === 'user'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200'
                }`}
              >
                {message.text}
              </div>
            </div>
          ))}
          {listening ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-xs text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Listening…
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={toggleListening}
            aria-label={listening ? 'Stop listening' : 'Start voice command'}
            className={`relative flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95 ${
              listening
                ? 'bg-rose-600 shadow-rose-600/30'
                : 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-600/30'
            }`}
          >
            {listening ? <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/40" /> : null}
            <Icon name={listening ? 'mic-off' : 'mic'} className="h-7 w-7" />
          </button>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {listening
              ? isArabic
                ? 'بسمع — دوس للإيقاف'
                : 'Listening — tap to stop'
              : supported
                ? isArabic
                  ? 'دوس واتكلم'
                  : 'Tap and speak'
                : isArabic
                  ? 'الصوت يحتاج Chrome أو Edge أو Safari'
                  : 'Voice needs Chrome, Edge or Safari'}
          </span>
        </div>

        {error ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">{error}</p> : null}

        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={isArabic ? 'اكتب أمر، مثال: "صرفت ٤٠ على القهوة"' : 'Type a command, e.g. "spent 40 on coffee"'}
            aria-label="Type a command"
            className="h-11 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800"
          />
          <button
            type="submit"
            aria-label="Send command"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white active:scale-95"
          >
            <Icon name="send" className="h-4 w-4" />
          </button>
        </form>

        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {ASSISTANT_SUGGESTIONS[language].slice(0, 5).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void run(suggestion)}
              className="shrink-0 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-2.5 dark:bg-slate-800/60">
          <div className="flex items-center gap-2">
            <Icon name={state.voiceReplies ? 'volume-2' : 'volume-x'} className="h-4 w-4 text-slate-400" />
            <div>
              <div className="text-xs font-semibold">{isArabic ? 'قول الردود بصوت' : 'Speak replies'}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                {isArabic ? 'يقرأ الإجابات بصوت عالي' : 'Read answers out loud'}
              </div>
            </div>
          </div>
          <Switch
            checked={state.voiceReplies}
            label="Speak replies"
            onChange={(value) => updateSettings({ voiceReplies: value })}
          />
        </div>

        <button
          type="button"
          onClick={() => void run(isArabic ? 'مساعدة' : 'help')}
          className="w-full text-center text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
        >
          {isArabic ? 'أقول إيه؟' : 'What can I say?'}
        </button>
      </div>
    </Sheet>
  );
}

export default AssistantSheet;
