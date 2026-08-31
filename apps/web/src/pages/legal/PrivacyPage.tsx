import LegalDocPage from './LegalDocPage';
import { PRIVACY_POLICY } from './legalContent';

export function PrivacyPage() {
  return <LegalDocPage doc={PRIVACY_POLICY} />;
}

export default PrivacyPage;
