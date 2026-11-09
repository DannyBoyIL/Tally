import { useDemo } from './demo.ts';
import { QueuePage } from './pages/QueuePage.tsx';
import { ReviewPage } from './pages/ReviewPage.tsx';
import { navigate, usePath } from './router.ts';

export function App() {
  const path = usePath();
  const review = /^\/documents\/([0-9a-f-]+)$/.exec(path);
  const demo = useDemo();
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
      {demo?.demo && (
        <p className="demo-banner" role="note">
          <strong>Demo.</strong> Everything resets daily. The samples are read from answers Claude
          really gave;{' '}
          {demo.liveEnabled
            ? 'reading your own image live needs an access code.'
            : 'live reading of your own images is turned off.'}
        </p>
      )}
      {review?.[1] ? <ReviewPage key={review[1]} id={review[1]} /> : <QueuePage />}
    </>
  );
}
