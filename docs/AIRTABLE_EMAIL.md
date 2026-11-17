# Envoi des e-mails par Airtable

1. Dans une base Airtable, créer une table `Outbox` avec les champs : `To` (e-mail), `Subject` (texte), `Body` (texte long), `Kind` (texte), `Sent` (case à cocher).
2. Créer un jeton personnel (airtable.com/create/tokens) : portée `data.records:write`, accès limité à cette base. Le mettre dans `AIRTABLE_TOKEN`, l'identifiant de base (`app…`) dans `AIRTABLE_BASE_ID`, puis `MAIL_PROVIDER=airtable`.
3. Automatisation : déclencheur « When a record is created » sur `Outbox`.
   - Action 1 : « Send email » : To = `To`, Subject = `Subject`, Message = `Body`.
   - Action 2 : « Update record » sur le même enregistrement : `Body` vidé, `Sent` coché.
4. Tester avec un compte de test : inviter un coach, vérifier la réception.

**Limites à connaître**

- Le lien personnel de l'OSC est en clair dans `Body` jusqu'à l'action 2, et l'historique des révisions d'Airtable peut le conserver. C'est un écart à la règle « jeton jamais stocké en clair », accepté pour le pilote. Parade : le coach révoque et régénère un lien en un clic. À remplacer par Resend avant l'ouverture à grande échelle.
- L'expéditeur est Airtable : vérifier que les messages n'arrivent pas en spam chez les 2 OSC.
- Le nombre d'exécutions d'automatisations dépend du plan Airtable.
