# Challenge 001 — PermitDesk : permis de travail pour la maintenance industrielle

| | |
|---|---|
| **Numéro du challenge** | 001 |
| **Domaine** | Industrie / Maintenance (sécurité industrielle) |
| **Difficulté** | Avancé (challenge de base, sans phase IA) |
| **Stack frontend** | Vue 3 + TypeScript + Vite + Vue Router |
| **Stack backend (demandée)** | Java avec Spring Boot |
| **Modèle économique** | Outil interne d'exploitation pour un site industriel unique |

> Le frontend est fourni et fonctionne avec une couche de mock isolée (`frontend/src/mock`). Votre mission : concevoir et implémenter l'API Spring Boot qui répond à cette spécification, puis remplacer la couche de mock. Tout le reste du backend (base de données, style d'API, architecture, mécanisme d'authentification, format des erreurs, stratégie de concurrence) est à votre charge.
>
> Ce README fait foi. La couche de mock ne fait qu'approximer les règles pour permettre la démonstration de l'interface ; en cas de différence, ce document prévaut.
>
> Note : la version de référence est `README.md` (en anglais). Cette traduction française est fournie à titre de confort.

---

## 1. Contexte

Northfield Foods exploite une usine agroalimentaire comportant des zones à risque (chaufferie, parc de cuves, station de pompage, lignes de conditionnement). Tout travail de maintenance non routinier doit être couvert par un **permis de travail** avant de commencer. Un permis décrit le travail à effectuer, le lieu, le créneau, les intervenants, les équipements à isoler (consignation) et la personne qui l'a autorisé.

Aujourd'hui, les permis sont des formulaires papier et des appels radio. PermitDesk les remplace. Les principaux risques que le système doit maîtriser : deux travaux incompatibles dans la même zone, un équipement remis sous tension pendant qu'on travaille dessus, des travaux qui dépassent discrètement leur horaire approuvé, et des permis signés par la mauvaise personne.

## 2. Rôles utilisateurs

| Rôle | Capacités |
|---|---|
| **Technicien** | Crée et soumet des permis pour les types de travaux pour lesquels il est habilité. Agit comme *responsable* du permis pendant l'exécution (activation, suspension, relève, demande de clôture). Ne voit que les permis qu'il a demandés, dans lesquels il est équipier ou dont il est responsable. |
| **Autorité de zone** | Approuve les permis dans les zones qui lui sont affectées. Peut suspendre et prolonger les permis (non à haut risque) et contresigner la clôture des permis à haut risque dans ses zones. Voit les permis de ses zones. |
| **Responsable sécurité** | Second approbateur pour les permis à haut risque. Peut placer des zones en mode restreint. Peut suspendre n'importe quel permis et prolonger les permis à haut risque. Voit tous les permis. |
| **Directeur d'usine** | Approbateur final des permis critiques. Peut annuler tout permis avant activation et suspendre tout permis actif. Voit tous les permis. |

Les comptes de démonstration sont listés sur l'écran de connexion (mot de passe : `demo` pour tous). L'authentification réelle relève de la responsabilité du développeur.

## 3. Exigences fonctionnelles

1. **Connexion / déconnexion.** Les utilisateurs s'authentifient par email et mot de passe. Chaque écran et chaque jeu de données est limité à l'utilisateur connecté.
2. **Liste des permis.** Liste consultable, filtrable, triable et paginée des permis que l'utilisateur a le droit de voir, avec des vues rapides : *À traiter par moi*, *En retard*, *Expire dans moins de 60 minutes*.
3. **Création et modification (brouillon).** Titre, description, zone, type de travaux, créneau prévu, points d'isolation, équipe. Pendant la saisie, le formulaire affiche le niveau de risque calculé, la chaîne d'approbation requise et les violations de règles, avant tout enregistrement.
4. **Workflow du permis.** Soumettre, approuver, rejeter (avec commentaire), réviser un permis rejeté, annuler, activer, suspendre, reprendre, prolonger, relève entre équipes, demander la clôture, contresigner la clôture. Voir la section 5.
5. **Détail du permis.** Statut, progression de la chaîne d'approbation, points d'isolation et état des cadenas, équipe et statut du briefing, état de la relève, temps restant et historique d'audit complet.
6. **Tableau des zones.** Par zone : mode restreint, nombre de permis actifs par rapport à la capacité, et permis actuellement actifs. Le Responsable sécurité peut activer/désactiver le mode restreint avec un motif.
7. **Registre des points d'isolation.** Liste consultable des points de consignation avec leur état actuel et le permis qui les détient.
8. **Notifications.** Liste des éléments nécessitant l'attention de l'utilisateur (approbations en attente, demandes de relève, permis sur le point d'expirer ou en retard, zones passées en mode restreint).

## 4. Règles métier

### 4.1 Niveau de risque et chaîne d'approbation

- Risque de base selon le type de travaux : `GENERAL` → Faible ; `ELECTRICAL`, `WORK_AT_HEIGHT` → Moyen ; `HOT_WORK`, `CONFINED_SPACE` → Élevé.
- Un permis `GENERAL` ayant au moins un point d'isolation est de risque Moyen.
- Si le niveau de danger de la zone est 3, le risque est augmenté d'un cran (Faible→Moyen→Élevé→Critique).
- Approbations requises, dans un ordre strict :
  - Faible, Moyen : Autorité de zone
  - Élevé : Autorité de zone, puis Responsable sécurité
  - Critique : Autorité de zone, puis Responsable sécurité, puis Directeur d'usine
- Un approbateur doit détenir le rôle requis (et, pour l'Autorité de zone, être affecté à la zone du permis). Personne ne peut approuver ou rejeter son propre permis. Une étape n'est actionnable que lorsque la précédente est approuvée.
- Un rejet exige un commentaire, met fin au processus d'approbation et libère les réservations d'isolation. Le demandeur peut le *réviser*, ce qui le renvoie à l'état brouillon et **invalide toutes les approbations précédentes**.

### 4.2 Règles de planification (vérifiées à la soumission et affichées en direct dans le formulaire)

- Durée du créneau : 12 heures maximum. Le début ne peut pas être dans le passé.
- `HOT_WORK` et `CONFINED_SPACE` ne peuvent pas démarrer entre 22h00 et 06h00 (heure locale du site).
- Le demandeur doit détenir une habilitation pour le type de travaux, encore valide à la fin prévue.
- `ELECTRICAL` et `CONFINED_SPACE` exigent au moins un point d'isolation.
- Les points d'isolation doivent appartenir à la zone du permis.
- Un point ne peut pas être utilisé par deux permis dont les créneaux se chevauchent (de la soumission jusqu'à la fin du permis).
- La soumission est refusée si le créneau chevauche un permis approuvé ou actif de la même zone dont le type de travaux est incompatible (voir 4.4).
- Seuls les brouillons peuvent être modifiés.

### 4.3 Points d'isolation

- Un point est réservé à la soumission d'un permis, verrouillé à son activation et libéré lorsque le permis prend fin (clôturé, annulé, rejeté, expiré).
- Pour activer, le responsable doit fournir un numéro de cadenas physique pour **chaque** point d'isolation ; les numéros doivent être uniques et non vides.
- Un point verrouillé par un autre permis bloque l'activation.
- Pour demander la clôture, le responsable confirme le retrait de chaque cadenas. Pour les permis à haut risque, les points restent réservés jusqu'au contreseing de la clôture.

### 4.4 Zones, capacité et incompatibilités

- Chaque zone a un nombre maximal de permis actifs simultanés.
- `HOT_WORK` est incompatible avec les autres `HOT_WORK` et avec `CONFINED_SPACE` dans la même zone, dans les deux sens.
- Une zone en **mode restreint** ne peut pas avoir de travaux par point chaud activés ou repris. Le passage en mode restreint suspend automatiquement tous les permis de travaux par point chaud actifs de cette zone (attribué au système, avec le motif).

### 4.5 Activation

Un permis ne peut être activé que si toutes ces conditions sont réunies : il est entièrement approuvé ; l'heure actuelle est dans son créneau prévu ; l'appelant est son responsable ; le briefing sécurité de tous les membres de l'équipe est confirmé ; les numéros de cadenas sont valides (4.3) ; les règles de capacité et d'incompatibilité de la zone sont respectées ; la zone n'est pas restreinte pour ce type de travaux.
Répéter la même demande d'activation (par exemple après un délai réseau dépassé) ne doit pas verrouiller deux fois, ajouter d'entrées d'audit en double, ni échouer avec une erreur trompeuse.

### 4.6 Expiration

- Un permis approuvé qui n'est pas activé dans les 2 heures suivant son début prévu passe à **Expiré** et libère ses réservations.
- Un permis actif ayant dépassé sa fin prévue est signalé **En retard**. Il ne peut plus être prolongé. Il reste actif et ses cadenas restent en place jusqu'à sa clôture.
- Un permis est « bientôt expiré » lorsqu'il est actif et qu'il reste moins de 60 minutes.

### 4.7 Prolongation

- Uniquement pour les permis actifs qui ne sont pas encore en retard.
- La prolongation dure de 30 à 120 minutes. Au maximum 2 prolongations par permis. La durée totale ne peut pas dépasser 16 heures.
- Permis Faible/Moyen : prolongés par l'Autorité de zone concernée. Permis Élevé/Critique : par le Responsable sécurité.

### 4.8 Relève entre équipes

- Les équipes changent à 06h00 et 18h00. Un permis actif ou suspendu encore en cours lors d'un changement d'équipe nécessite une relève.
- Le responsable désigne un autre technicien habilité pour le type de travaux. Le désigné doit accepter (et confirmer le briefing) dans les 30 minutes ; sinon le permis est automatiquement suspendu.
- Tant que la relève n'est pas acceptée, le responsable actuel reste responsable. Après acceptation, le désigné devient responsable et le précédent perd ses droits d'action sur ce permis.

### 4.9 Suspension et reprise

- Les permis actifs peuvent être suspendus par le responsable, l'Autorité de la zone, le Responsable sécurité ou le Directeur d'usine. Un motif est obligatoire.
- Un permis suspendu conserve ses cadenas. Il peut être repris par le responsable, l'Autorité de la zone ou le Responsable sécurité, sous réserve des mêmes contrôles de zone, capacité et incompatibilité que l'activation. Il ne peut pas être repris une fois en retard.

### 4.10 Clôture

- Le responsable soumet une clôture avec une liste de contrôle d'inspection du site complétée et confirme que chaque cadenas a été retiré.
- Les permis Faible/Moyen passent immédiatement à **Clôturé**.
- Les permis Élevé passent à **Clôture en attente** et sont contresignés par l'Autorité de la zone ; les permis Critique par le Responsable sécurité. Le contresignataire ne peut être ni le demandeur ni le responsable.

### 4.11 Visibilité

- Les techniciens voient les permis qu'ils ont demandés, dont ils sont équipiers ou responsables.
- Les Autorités de zone voient les permis de leurs zones.
- Les Responsables sécurité et Directeurs d'usine voient tous les permis.
- Les notifications et compteurs respectent la même visibilité.

### 4.12 Audit

- Chaque changement d'état, approbation, relève, prolongation et action automatique du système est enregistré avec l'acteur (ou « système »), le rôle, l'heure, le statut précédent et nouveau, et le commentaire.
- L'historique ne peut pas être modifié et est visible par toute personne pouvant voir le permis.

### 4.13 Modifications concurrentes

- Deux utilisateurs agissant en même temps sur le même permis (par exemple deux approbateurs, ou un approbateur et un demandeur qui annule) ne doivent jamais réussir tous les deux. Le perdant doit recevoir un résultat clair et distinguable afin que l'interface recharge et explique ce qui a changé.

## 5. Workflow

```text
DRAFT ──submit──▶ SUBMITTED ──approve──▶ IN_APPROVAL ──approve (last)──▶ APPROVED ──activate──▶ ACTIVE ◀──resume── SUSPENDED
  ▲                  │  │                    │                              │                      │  └─suspend───▲
  │                  │  └──────reject────────┤                              │                      │
revise               ▼                       ▼                              ▼                      └──request closure──▶ CLOSURE_PENDING ──countersign──▶ CLOSED
REJECTED         CANCELLED               REJECTED                        EXPIRED / CANCELLED          (Faible/Moyen passent directement à CLOSED)
```

Notes : les permis à approbation unique passent de `SUBMITTED` à `APPROVED` directement. `SUSPENDED` peut aussi demander la clôture. `EXPIRED`, `CANCELLED`, `REJECTED` (jusqu'à révision) et `CLOSED` sont terminaux pour l'activation.

## 6. Concepts de données

- **Utilisateur** : nom, email, rôle, zones affectées (Autorité de zone), habilitations (type de travaux, expiration).
- **Zone** : nom, niveau de danger (1–3), nombre maximal de permis actifs simultanés, indicateur de mode restreint et motif.
- **Point d'isolation** : repère, nature (électrique / vanne / mécanique), zone, état (libre / réservé / verrouillé), permis détenteur, numéro de cadenas.
- **Permis** : référence (lisible, unique), titre, description, zone, type de travaux, risque calculé, statut, demandeur, responsable, créneau prévu, nombre de prolongations, équipe avec confirmation de briefing, points d'isolation avec état verrouillé/libéré, étapes d'approbation, relève en attente, inspection de clôture.
- **Entrée d'audit** : décrite en 4.12.
- **Notification** : dérivée de l'état des permis et des zones pour un utilisateur donné.

## 7. Exigences d'interface

| Écran | Contenu |
|---|---|
| Connexion | Formulaire email/mot de passe, raccourcis des comptes de démo, erreur en cas d'identifiants incorrects. |
| Permis | Filtres (statut, zone, risque, type de travaux, plage de dates, recherche texte), onglets rapides avec compteurs, tri, pagination, états chargement / vide / erreur. |
| Nouveau / modification | Aperçu en direct du risque, de la chaîne d'approbation et des violations ; sélecteur de points d'isolation dépendant de la zone avec raison d'indisponibilité ; sélecteur d'équipe affichant la validité des habilitations ; enregistrer le brouillon et soumettre. |
| Détail du permis | Statut, chaîne d'approbation, points d'isolation, équipe, relève, temps restant, boutons d'action contextuels (désactivés avec la raison quand non autorisés), onglet historique d'audit. |
| Boîtes de dialogue d'action | Une par action du workflow, avec les saisies requises par 4.x ; les violations côté serveur sont affichées dans la boîte de dialogue. |
| Zones | Jauge de capacité, contrôle du mode restreint (Responsable sécurité), liste des permis actifs. |
| Points d'isolation | Tableau avec filtres. |
| Notifications | Liste avec liens vers le permis concerné ; compteur dans l'en-tête. |

L'interface doit indiquer, pour chaque permis et chaque utilisateur, quelles actions sont possibles à cet instant et pourquoi une action bloquée l'est.

## 8. Cas limites

- Un approbateur ouvre un permis qui vient d'être annulé ou approuvé par quelqu'un d'autre.
- Deux approbateurs approuvent en même temps.
- Demande d'activation envoyée deux fois ; activation pendant qu'un autre permis active le même point.
- Une zone passe en mode restreint pendant qu'un technicien remplit la boîte de dialogue d'activation.
- L'habilitation d'un technicien expire entre la création du brouillon et la soumission.
- Un créneau de permis traverse un changement d'équipe ou la limite 22h00 / 06h00.
- Une relève n'est jamais acceptée.
- Révision d'un permis rejeté dont les points d'isolation ont entre-temps été réservés par quelqu'un d'autre.
- Prolongation demandée à l'instant exact où le permis passe en retard.
- L'approbateur est aussi le demandeur (par exemple un Responsable sécurité également habilité — l'auto-approbation n'est pas permise).
- Grandes listes : les filtres et le tri doivent fonctionner sur toutes les pages.

## 9. Attentes envers l'API (point de vue du frontend)

Le frontend isole tout accès aux données dans `frontend/src/api/client.ts`. Ce fichier est le seul à modifier pour connecter un vrai backend. Du point de vue du frontend, l'API doit :

- Authentifier les utilisateurs et limiter toutes les données à leur périmètre.
- Prendre en charge la recherche, le filtrage, le tri et la pagination côté serveur pour les permis, y compris les filtres calculés (*à traiter par moi*, *en retard*, *bientôt expiré*) et les compteurs de ces vues rapides.
- Calculer le risque, la chaîne d'approbation et les violations de règles pour un brouillon **sans l'enregistrer** (pour l'aperçu en direct).
- Retourner, avec chaque permis, les actions que l'utilisateur courant peut effectuer et la raison de chaque action bloquée.
- Distinguer ces types d'échec pour que l'interface réagisse correctement : saisie invalide (par champ), violation de règle métier (avec code stable et message lisible), permission refusée, introuvable / non visible, et conflit de modification concurrente.
- Rendre les opérations de changement d'état sûres à rejouer (l'activation en particulier).
- Appliquer les transitions temporelles (expiration, délai de relève, indicateur de retard) sans aucune action utilisateur.
- Retourner l'historique d'audit complet d'un permis.
- Fournir les listes des zones, des points d'isolation (avec disponibilité pour une plage horaire donnée) et des équipiers éligibles (avec validité d'habilitation pour un type de travaux et une date).
- Fournir les notifications de l'utilisateur.

C'est à vous de décider comment tout cela est exposé.

## 10. Critères d'acceptation

1. Chaque compte de démo voit exactement les permis autorisés par 4.11 et rien d'autre, y compris dans les compteurs et notifications.
2. L'aperçu en direct affiche le même niveau de risque et la même chaîne d'approbation que ceux appliqués par le serveur à la soumission.
3. Chaque violation de 4.2 est signalée avec un message clair, et un permis qui en viole une ne peut pas être soumis.
4. Un permis ne suit que les transitions de la section 5 ; toute autre tentative est refusée avec une erreur de règle métier.
5. L'ordre des approbations, le rôle et l'affectation de zone sont appliqués ; l'auto-approbation est impossible ; un rejet exige un commentaire ; la révision réinitialise les approbations.
6. Les points d'isolation ne peuvent jamais être détenus par deux permis qui se chevauchent ; verrouillage, libération et réservation respectent 4.3.
7. Les règles de capacité, d'incompatibilité et de mode restreint sont appliquées à l'activation et à la reprise ; le passage en mode restreint suspend automatiquement les permis de travaux par point chaud actifs de la zone et le consigne dans l'audit.
8. Répéter une demande d'activation produit exactement une activation, un seul jeu de cadenas et une seule entrée d'audit.
9. L'expiration, le retard, le délai de relève et le « bientôt expiré » se comportent comme en 4.6 et 4.8 sans intervention manuelle.
10. Les limites de prolongation (nombre, durée, rôle, non en retard) sont appliquées.
11. La clôture suit 4.10, y compris le contreseing par le bon rôle et la libération des points au bon moment.
12. Deux actions conflictuelles simultanées sur le même permis ne réussissent jamais toutes les deux, et l'utilisateur perdant voit un message clair.
13. L'historique d'audit est complet, ordonné et en lecture seule.
14. Le frontend fonctionne avec votre API Spring Boot en ne modifiant que `frontend/src/api/` (la couche de mock peut être supprimée).

## 11. Lancer le frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # build de production
npm run typecheck  # vérification TypeScript
```

Comptes de démo (mot de passe `demo`) : `amira.haddad@plant.example` (Technicien), `lucas.moreau@plant.example` (Technicien), `priya.nair@plant.example` (Technicien, espace confiné), `jonas.weber@plant.example` (Autorité de zone), `elena.rossi@plant.example` (Autorité de zone), `marta.kowalski@plant.example` (Responsable sécurité), `daniel.okafor@plant.example` (Directeur d'usine). Toutes les données sont fictives.
