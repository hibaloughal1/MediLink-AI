# Suite E2E (Playwright) — MediLink AI

Suite versionnée (étape 15), remplaçant les scripts ad hoc écrits (et
jetés) à chaque étape précédente du projet.

## Prérequis

La pile complète doit déjà tourner :

```bash
docker compose --profile mail up -d
```

Le profil `mail` (Mailpit) est optionnel : sans lui, l'assertion sur les
emails envoyés est ignorée avec un avertissement plutôt que de faire
échouer la suite (voir `full-journey.spec.ts`).

## Lancer la suite

```bash
npm run test:e2e --workspace=apps/web
```

(ou directement depuis `apps/web` : `npm run test:e2e`)

## Ce qui est couvert

Un parcours complet, avec de vraies sessions navigateur et les vraies API
existantes (jamais de manipulation directe de la base pour simuler un
résultat) : inscription/connexion patient et médecin, vérification d'un
médecin `PENDING` depuis l'interface admin, visibilité publique après
vérification, réservation réelle, notifications in-app (patient + médecin),
email réel via Mailpit (si actif), annulation depuis l'agenda médecin,
mise à jour du statut et de la notification côté patient.

## Nettoyage des données de test

Ce test crée de vrais comptes dans la base de **développement** (celle
servie par la pile Docker) — il n'existe volontairement aucune API de
suppression de compte. Les comptes créés utilisent un domaine dédié et
horodaté (`@e2e.medilink.local`) pour rester facilement identifiables :

```bash
# Depuis apps/api, dans le conteneur ou en local avec DATABASE_URL pointant
# sur la base de développement — jamais TEST_DATABASE_URL (déjà nettoyée
# automatiquement par la suite de tests backend, voir tests/global-teardown.ts).
# Exemple (Node + Prisma), à adapter à la session la plus récente :
#   DELETE FROM "User" WHERE email LIKE '%@e2e.medilink.local';
# (les cascades du schéma suppriment automatiquement le profil médecin,
# les disponibilités, les rendez-vous et les notifications associés).
```

Pensez à nettoyer après chaque exécution locale, comme documenté pour
chaque étape précédente du projet.
