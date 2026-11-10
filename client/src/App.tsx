import { useEffect } from 'react';
import { useQuizStore } from './store/quizStore';
import { useAuthStore } from './store/authStore';
import { fetchMe } from './api/authApi';
import { Header } from './components/Header';
import { AuthView } from './components/AuthView';
import { AdminView } from './components/AdminView';
import { UploadZone } from './components/UploadZone';
import { PreviewPairs } from './components/PreviewPairs';
import { QuizView } from './components/QuizView';
import { ResultsView } from './components/ResultsView';
import { StatsView } from './components/StatsView';

export default function App() {
  const view = useQuizStore((s) => s.view);
  const { status, user, setUser } = useAuthStore();

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null));
  }, [setUser]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <main className="flex-1 flex flex-col">
        {status === 'loading' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {status === 'anonymous' && <AuthView />}
        {status === 'authenticated' && (
          <>
            {view === 'upload' && <UploadZone />}
            {view === 'preview' && <PreviewPairs />}
            {view === 'quiz' && <QuizView />}
            {view === 'results' && <ResultsView />}
            {view === 'stats' && <StatsView />}
            {view === 'admin' && (user?.role === 'admin' ? <AdminView /> : <UploadZone />)}
          </>
        )}
      </main>
    </div>
  );
}
