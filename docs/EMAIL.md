# E-mails : arriver en boîte de réception

## Pourquoi les invitations partent en indésirables

Avec `MAIL_PROVIDER=airtable`, les e-mails sont envoyés par une automatisation Airtable. L'expéditeur n'est **pas authentifié** (pas de SPF, DKIM ni DMARC à votre nom) : les filtres des messageries d'entreprise classent ces messages en indésirables ou les bloquent. Aucune modification du texte ne peut corriger cela : il faut un expéditeur authentifié. Il y en a deux façons.

| | Domaine à vous nécessaire ? | Quand l'utiliser |
|---|---|---|
| **A. SMTP (Gmail)** | non | pas de nom de domaine ; mise en place en 10 minutes |
| **B. Resend** | oui | une fois que vous avez un domaine : la solution durable |

Dans les deux cas : plus d'Airtable ni d'automatisation pour les e-mails, et les liens personnels ne sont plus stockés dans Airtable.

## A. Envoyer par Gmail (SMTP), sans domaine

Les e-mails partent directement de l'application vers les serveurs de Gmail ; ils sont **signés par Google** (SPF, DKIM, DMARC valides). Utilisez de préférence un compte dédié (par exemple `pulse.diagnostic@gmail.com`), pas une boîte personnelle.

1. Sur le compte Gmail : *Compte Google > Sécurité > Validation en deux étapes* : l'activer.
2. Aller sur **myaccount.google.com/apppasswords**, créer un mot de passe d'application nommé « OCAT », le copier (16 caractères ; les espaces affichés peuvent être collés tels quels). Si cette page n'existe pas, la validation en deux étapes n'est pas active, ou l'administrateur Google Workspace bloque les mots de passe d'application.
3. Dans **Vercel** (Settings > Environment Variables), puis redéployer :

| Variable | Valeur |
|---|---|
| `MAIL_PROVIDER` | `smtp` |
| `SMTP_USER` | l'adresse Gmail |
| `SMTP_PASS` | le mot de passe d'application |
| `MAIL_FROM` | la même adresse Gmail (Gmail remplace toute autre adresse par celle du compte) |
| `MAIL_REPLY_TO` | une vraie boîte de réponse (facultatif) |
| `SMTP_HOST` / `SMTP_PORT` | `smtp.gmail.com` / `465` (valeurs par défaut) |

4. **Administration > E-mails** : « Fournisseur » doit être OK. Envoyer un e-mail de test et regarder où il arrive.

**Limites à connaître.** Environ 500 destinataires par jour avec un compte Gmail gratuit (2 000 avec Google Workspace). Google peut bloquer un compte qui envoie de façon inhabituelle : consulter les alertes de sécurité du compte en cas d'échec. Les passerelles anti-spam d'entreprise restent libres de se méfier d'un expéditeur `gmail.com` : le test vers une adresse de votre organisation le dira.

Tout autre serveur SMTP fonctionne de la même façon (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`).

## B. Resend, avec un domaine à vous (environ 30 minutes)

1. **Choisir un domaine d'envoi.** Idéalement un sous-domaine, par exemple `mail.votre-domaine.org`. Jamais une adresse gratuite avec Resend : une adresse gmail ne peut pas être utilisée par un service tiers.
2. **Créer un compte sur resend.com**, puis *Domains > Add Domain*, région **Europe (Irlande)** si possible.
3. **Ajouter les enregistrements DNS** affichés par Resend : SPF et MX (sur `send`), DKIM (`resend._domainkey`). Ajouter aussi DMARC : TXT `_dmarc` valant `v=DMARC1; p=none; rua=mailto:une-adresse@votre-domaine.org`.
4. Cliquer sur **Verify** jusqu'à « Verified », puis **créer une clé d'API** (droit d'envoi seulement).
5. Dans Vercel, puis redéployer : `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM=no-reply@mail.votre-domaine.org`, `MAIL_REPLY_TO`, `APP_URL`.
6. **Administration > E-mails** : tout doit être « OK » (SPF, DKIM, DMARC). Envoyer un e-mail de test ; sur le message reçu, vérifier SPF, DKIM et DMARC *PASS* (Gmail : « Afficher l'original »). mail-tester.com doit donner au moins 9/10.

## Si un message n'arrive même pas (filtré)

Les messageries d'entreprise ont leurs propres règles. Demander à leur service informatique d'**autoriser l'expéditeur** (liste des expéditeurs de confiance), de **regarder la quarantaine** de la passerelle anti-spam, et d'exclure l'adresse de l'application de l'analyse « liens sécurisés » (l'application y résiste : un lien d'activation ne se consomme qu'au clic sur le bouton).

## Boutons d'envoi

Les boutons qui envoient un e-mail (connexion, nouveau lien, invitation) affichent un chargement, puis « E-mail envoyé : vérifiez aussi vos indésirables ». Sur Vercel, l'e-mail et l'envoi vers Airtable partent en tâche de fond : la réponse est immédiate. Seules les invitations attendent l'e-mail, pour dire à l'invitant s'il est parti.

## Liens d'activation

- Le lien d'une invitation (`/activate?t=…`) **n'expire pas** : valable tant qu'il n'a pas servi, et il ne se consomme qu'au clic sur « Activer mon compte ».
- Après activation, il reste utilisable 30 minutes, puis affiche « déjà utilisé » : la personne se connecte avec son adresse e-mail depuis la page de connexion.
- Invitation perdue ou antérieure à cette mise à jour : **Renvoyer l'invitation** (onglet Équipe, ou Administration > Comptes). L'e-mail part toujours à l'adresse de la personne ; le lien n'est jamais montré à celui qui invite.
- Les liens de **connexion** ne servent qu'une fois. Pour qu'ils expirent moins vite : Supabase > Authentication > Providers > Email > *Email OTP Expiration* (maximum 24 heures).
