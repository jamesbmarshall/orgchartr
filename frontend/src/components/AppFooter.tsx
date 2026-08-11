import { Coffee } from 'lucide-react';
import { APP_VERSION, RELEASE_URL } from '../version';

export function AppFooter() {
  return (
    <footer className="app-footer">
      <a href={RELEASE_URL} target="_blank" rel="noreferrer">
        orgchartr v{APP_VERSION}
      </a>
      <a href="https://ko-fi.com/jamesbmarshall" target="_blank" rel="noreferrer">
        <Coffee aria-hidden="true" />
        Buy me a coffee
      </a>
    </footer>
  );
}
