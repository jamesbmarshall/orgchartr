import { APP_VERSION, RELEASE_URL } from '../version';

export function AppFooter() {
  return (
    <footer className="app-footer">
      <a href={RELEASE_URL} target="_blank" rel="noreferrer">
        orgchartr v{APP_VERSION}
      </a>
    </footer>
  );
}