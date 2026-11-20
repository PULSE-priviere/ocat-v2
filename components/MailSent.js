// Confirmation d'envoi d'e-mail : après le chargement du bouton, un message clair qui rappelle de regarder les indésirables
import Icon from './Icon';

export default function MailSent({ title, children }) {
  return (
    <div className="mailsent" role="status">
      <span className="mailsent-icon"><Icon name="check" size={20} /></span>
      <div><b>{title}</b><p>{children}</p></div>
    </div>
  );
}
