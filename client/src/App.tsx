import { useQuizStore } from './store/quizStore';
import { Header } from './components/Header';
import { UploadZone } from './components/UploadZone';
import { PreviewPairs } from './components/PreviewPairs';
import { QuizView } from './components/QuizView';
import { ResultsView } from './components/ResultsView';
import { StatsView } from './components/StatsView';

export default function App() {
  const view = useQuizStore((s) => s.view);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <main className="flex-1 flex flex-col">
        {view === 'upload' && <UploadZone />}
        {view === 'preview' && <PreviewPairs />}
        {view === 'quiz' && <QuizView />}
        {view === 'results' && <ResultsView />}
        {view === 'stats' && <StatsView />}
      </main>
    </div>
  );
}
