import { QueuePage } from './pages/QueuePage.tsx';
import { ReviewPage } from './pages/ReviewPage.tsx';
import { navigate, usePath } from './router.ts';

export function App() {
  const path = usePath();
  const review = /^\/documents\/([0-9a-f-]+)$/.exec(path);
  return (
    <>
      <header className="topbar">
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          Tally
        </a>
        <span className="muted">LLM invoice extraction that checks its own math</span>
      </header>
      {review?.[1] ? <ReviewPage key={review[1]} id={review[1]} /> : <QueuePage />}
    </>
  );
}
