# Scénario de test de bout en bout

Préparation : un projet de test, un compte owner, un compte coach (deux adresses e-mail que vous consultez), Turnstile actif.
Cochez chaque ligne. Les numéros renvoient au cahier des charges.

## 1. L'OSC entre seule (critère 1)
- [ ] Owner : onglet Projet, copier le lien public, l'ouvrir dans une fenêtre de navigation privée sur un téléphone.
- [ ] Saisir un nom, un e-mail, choisir le coach, cocher la case : le lien personnel s'affiche et arrive par e-mail (F0).
- [ ] Ressaisir le même e-mail avec un autre nom : aucun lien affiché, message « Vérifiez votre boîte », nouveau lien reçu. L'ancien lien affiche « Lien non valide ».
- [ ] Ouvrir le dernier lien : 9 sections, toutes « Non commencée » (F1).

## 2. Deux sections, coupure, reprise (critères 1, F3, F4)
- [ ] Ouvrir la section 5 (ordre libre), répondre à 3 questions. Pour une réponse 1 ou 2, la question d'appui apparaît ; pour 3 ou N/A, elle disparaît (F2).
- [ ] Indicateur en haut : « Enregistré ».
- [ ] Couper le réseau (mode avion). Répondre à 4 questions : l'indicateur passe à « En attente de connexion ».
- [ ] Fermer l'onglet. Rétablir le réseau. Rouvrir le lien : les 7 réponses sont là, et la page s'ouvre sur la première question sans réponse.
- [ ] Terminer les sections 5 et 1. Sur l'accueil, elles sont « Complète ».

## 3. Fin et rapport (F5, F6)
- [ ] Le bouton d'envoi n'apparaît qu'une fois les 9 sections complètes.
- [ ] Envoyer : le rapport s'affiche, sans aucun score ni radar. Owner et coach reçoivent un e-mail.

## 4. Session coach (critère 2, F8 à F13)
- [ ] Coach : se connecter par `/login`, ouvrir l'OSC depuis la cohorte.
- [ ] Onglet Session, filtre « Réponses 1 et 2 ». Pour au moins 80 % des questions discutées : écrire une note, taguer un besoin. Ajouter un besoin nouveau en un clic (F10).
- [ ] Changer une réponse : côté OSC, la mention « Réponse modifiée par votre accompagnateur » apparaît (F11). Owner : onglet Journal, l'ancienne valeur et l'auteur sont visibles.
- [ ] Ajouter une question en texte libre à une section (F12) : elle apparaît chez l'OSC, hors score.
- [ ] Clôturer la session : l'OSC ne peut plus modifier (F13). Rouvrir, puis clôturer à nouveau.
- [ ] Le compteur « questions avec notes ou besoins » donne le taux à reporter dans le bilan.

## 5. Plan (critère 3, F14 à F17)
- [ ] Onglet Plan : « Proposer les priorités ». Ordre : appui demandé, puis 1, puis 2.
- [ ] Retirer une priorité, en reformuler une, renseigner action, responsable, échéance, besoin. Ajouter une action libre.
- [ ] Statut « Validé », puis « PDF français » et « PDF anglais » : enregistrer en PDF depuis la fenêtre d'impression.
- [ ] Statut « Partagé » et case « Montrer mes notes » : l'OSC voit le plan et les notes dans son rapport.

## 6. Vue cohorte (critère 4, F19 à F21)
- [ ] Owner : onglet Cohorte (coach, statut, complétion, score), filtre par coach.
- [ ] Onglet Besoins : classement par nombre d'OSC, liste des OSC derrière chaque besoin, export CSV ouvert dans un tableur.
- [ ] Coach : il ne voit que ses OSC et leurs besoins.

## 7. Révocation (sécurité)
- [ ] Owner : onglet Équipe, révoquer le coach. Le coach, déjà connecté, recharge sa page : plus aucune OSC visible.
- [ ] Réaffecter ses OSC à un autre coach depuis la cohorte.

## 8. Langue (F7)
- [ ] Bascule FR/EN sur chaque écran : libellés et textes des questions changent.

## 9. Après chaque session
- [ ] Supabase > Table Editor : exporter en CSV `subjects`, `assessments`, `answers`, `answer_needs`, `needs`, `action_plans`, `audit_log`.
- [ ] Se connecter au tableau de bord Supabase au moins une fois tous les 5 jours (pause du plan gratuit).
