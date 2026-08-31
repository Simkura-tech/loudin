import LegalDocPage from './LegalDocPage';
import { TERMS_OF_SERVICE } from './legalContent';

export function TermsPage() {
  return <LegalDocPage doc={TERMS_OF_SERVICE} />;
}

export default TermsPage;
