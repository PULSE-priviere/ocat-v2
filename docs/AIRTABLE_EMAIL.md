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

## Dépannage : « the to input is empty » / « the message input is empty »

Ces messages **ne viennent pas de l'application** : ils sont écrits par l'automatisation Airtable (typiquement l'action Gmail ou Outlook « Send email »). Causes les plus fréquentes :

1. **L'enregistrement de test est vide.** L'action 2 vide `Body` après chaque envoi, et une table neuve contient des lignes blanches. Le test de l'action utilise l'enregistrement choisi à l'étape « Test trigger », qui est donc vide. Remède : créer à la main une ligne de test dans `Outbox` (votre adresse, un sujet, un texte), refaire « Test trigger » en la choisissant, puis tester l'action.
2. **Les champs ne sont pas liés.** Dans l'action, `To`, `Subject` et `Message` doivent être des champs insérés (pastilles) et non du texte tapé. Quand on remplace l'action « Send email » par celle de Gmail, la configuration est à refaire.
3. **L'automatisation se déclenche sur des lignes vides** (lignes blanches, ou ligne dont `Body` vient d'être vidé). Remède : déclencheur « When a record matches conditions » avec `To` n'est pas vide ET `Body` n'est pas vide.

Le plus simple reste de ne plus passer par Airtable : voir `docs/EMAIL.md` (envoi direct par Gmail en SMTP, sans automatisation).
