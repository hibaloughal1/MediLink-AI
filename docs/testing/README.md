# Tests — MediLink AI

Étape 15 : couverture de tests approfondie (backend + frontend + E2E) et
seed de démonstration. Ce document explique comment lancer chaque suite,
la stratégie d'isolation des données de test, et les garanties de sécurité
du seed de démonstration.

## Lancer les suites

```bash
# Backend (apps/api)
npm run test:api               # 153 tests
npm run test:coverage:api      # avec rapport de couverture (text + html)

# Frontend (apps/web)
npm run test:web               # 105 tests
npm run test:coverage:web

# E2E (apps/web/e2e) — nécessite la pile Docker démarrée au préalable
docker compose --profile mail up -d
npm run test:e2e
```

Le rapport de couverture HTML est généré dans `apps/api/coverage/` et
`apps/web/coverage/` (non versionnés).

## Résultats actuels

| Suite | Tests | Couverture (statements / branches / functions) |
|---|---|---|
| Backend (Vitest) | 153 passent | 91.3 % / 83.2 % / 92.4 % |
| Frontend (Vitest) | 105 passent | 83.3 % / 82.6 % / 79.1 % |
| E2E (Playwright) | 1 scénario complet, passe | — (pas de métrique de couverture pour l'E2E) |

## Isolation des données de test (backend)

Toute la logique de nettoyage est centralisée dans deux fichiers, jamais
dupliquée par fichier de test :

- **`apps/api/tests/test-data-cleanup.ts`** — module sans dépendance à
  Vitest (nécessaire car `globalSetup`/`globalTeardown` s'exécutent dans un
  contexte séparé qui ne peut pas importer `vitest`). Il supprime
  uniquement les données identifiables comme appartenant aux tests :
  utilisateurs dont l'email se termine par `@test.medilink.local`, villes
  dont le nom commence par `Ville-`/`ListCity-`, spécialités dont le nom
  commence par `Specialite-`/`ListSpecialty-`. La suppression des
  utilisateurs s'appuie sur les cascades Prisma existantes
  (`User → Doctor → Appointment/Availability`, `Appointment/User → Notification`,
  `User → RefreshToken`) : un seul `deleteMany` sur `User` suffit à nettoyer
  toute la chaîne. Jamais de `TRUNCATE` global.
- **`apps/api/tests/global-teardown.ts`** — exécuté une seule fois après
  la suite complète (`globalSetup` de `vitest.config.ts`), jamais en
  `afterAll` par fichier. Vérifie explicitement que `TEST_DATABASE_URL` est
  défini et qu'il diffère de `DATABASE_URL` avant de nettoyer quoi que ce
  soit ; sinon il lève une erreur au lieu de risquer de toucher la base de
  développement.
- **`apps/api/tests/helpers.ts`** ré-exporte `cleanupTestData` et les
  constantes de préfixe depuis `test-data-cleanup.ts` pour que les
  fixtures de test (`registerAndLogin`, `createCityAndSpecialty`, etc.)
  utilisent les mêmes conventions de nommage.

**Pourquoi un teardown global et pas un `afterAll` par fichier** : Vitest
exécute les fichiers de test en parallèle par défaut ; un nettoyage par
fichier supprimait des données encore utilisées par un autre fichier en
cours d'exécution, provoquant des échecs aléatoires. Un seul nettoyage
après la suite complète élimine ce problème et a été vérifié stable sur
plusieurs exécutions consécutives (la base de test revient à zéro ligne de
test à chaque fois, sans jamais toucher le seed ni la base de
développement).

## Sécurité du seed de démonstration

`npm run prisma:seed` (alias `npm run seed`, `apps/api/prisma/seed.ts`) ne
peut **jamais** envoyer d'email réel, même si `SMTP_HOST` est défini dans
l'environnement :

- Les rendez-vous et notifications de démonstration sont créés en
  appelant directement les fonctions de service (`createAppointment`,
  `cancelAppointment`, `generateAvailableSlots`) et en insérant les
  notifications via Prisma (`channel: "IN_APP"` uniquement), **jamais** via
  les routes HTTP.
- Dans cette architecture, le déclenchement d'un envoi d'email
  (`emailTransport.send`) n'existe que dans les handlers de route HTTP
  (`appointments.routes.ts`), jamais dans les fonctions de service. Appeler
  les services directement rend l'envoi d'email **structurellement
  impossible** depuis le seed, plutôt que de dépendre d'un flag qu'on
  pourrait oublier de vérifier.
- Vérifié empiriquement : avec `SMTP_HOST=mailpit` défini (voir
  `apps/api/.env`), le seed s'exécute sans erreur et Mailpit ne reçoit
  aucun message pour les adresses `@medilink.local` du seed — seules les
  notifications `IN_APP` sont créées (7 au total : 6 `APPOINTMENT_BOOKED`,
  1 `APPOINTMENT_CANCELLED`).
- Le seed est **idempotent** : rejoué plusieurs fois de suite (y compris
  contre la base de développement, après un rebuild Docker complet), il
  produit exactement les mêmes compteurs (3 rendez-vous : 2 `CONFIRMED` +
  1 `CANCELLED`, 7 notifications `IN_APP`, 0 `EMAIL`) sans dupliquer ni
  échouer.

## Email via Mailpit (SMTP local)

Le profil Docker `mail` démarre Mailpit mais ne configure pas seul le
transport SMTP de l'API : il faut définir `SMTP_HOST=mailpit` (et
`SMTP_PORT=1025`) dans `apps/api/.env` pour que
`apps/api/src/plugins/email-transport.ts` bascule du transport "no-op" vers
un vrai transport SMTP (voir `apps/api/.env.example`, section
Notifications). Sans cette variable, l'API fonctionne normalement mais
n'envoie jamais d'email réel (comportement par défaut, y compris en CI).
La suite E2E détecte automatiquement si Mailpit est joignable et ignore
l'assertion email (avec un avertissement) si le profil `mail` n'est pas
démarré, plutôt que d'échouer.

## Suite E2E (Playwright)

Voir `apps/web/e2e/README.md` pour les prérequis et la procédure de
nettoyage des comptes `@e2e.medilink.local` qu'elle crée dans la base de
développement (aucune API de suppression de compte n'est exposée
volontairement ; nettoyage via une requête SQL documentée, qui s'appuie
sur les mêmes cascades Prisma).

Le scénario unique (`full-journey.spec.ts`) couvre, avec de vraies
sessions navigateur et les vraies API (jamais de manipulation directe de
la base pour simuler un résultat) : inscription patient et médecin,
vérification d'un médecin `PENDING` depuis l'interface admin, visibilité
publique après vérification, réservation réelle d'un créneau, notifications
in-app (patient et médecin), email réel via Mailpit, annulation depuis
l'agenda médecin, mise à jour du statut et de la notification côté
patient.

Le timeout global du test (`apps/web/e2e/playwright.config.ts`) est de 90
secondes : le scénario navigue vers une dizaine de routes différentes
contre le serveur `next dev` de la pile Docker, dont la compilation à la
demande de chaque route ajoute plusieurs secondes cumulées (le défaut de
30 s de Playwright, prévu pour un test unitaire, est trop court pour un
parcours de bout en bout).

## Bugs réels découverts et corrigés pendant l'approfondissement des tests

Le fait de tester des chemins jusque-là jamais exercés a révélé deux bugs
de production (pas des faux positifs de test) :

1. **Rate limiting silencieusement inactif** — `apps/api/src/app.ts` :
   `app.register(cors, ...)` et `app.register(rateLimit, ...)` n'étaient
   pas attendus (`await`) avant l'enregistrement suivant. Deux
   enregistrements Fastify non attendus en série interfèrent l'un avec
   l'autre : le hook de rate limiting ne se déclenchait jamais, quel que
   soit l'ordre d'enregistrement. Corrigé en rendant `buildServer()`
   asynchrone et en attendant explicitement les deux enregistrements.
   Vérifié : le 429 se déclenche exactement à la requête attendue.

2. **Perte de session après un rechargement de page (mode dev)** —
   `apps/web/context/auth-context.tsx` : l'effet de restauration de session
   au montage (`bootstrap`) appelait `/api/auth/refresh` directement via
   `apiFetch`. En mode strict de React (activé, `next.config.ts`), cet
   effet est invoqué deux fois de suite au montage — deux appels de
   refresh concurrents partent alors avec le même cookie de refresh token
   à usage unique. Le premier appel fait tourner le jeton (rotation) ; le
   second, utilisant désormais un jeton déjà révoqué, échoue et efface la
   session tout juste restaurée par le premier. `apps/web/lib/api-client.ts`
   avait déjà un mécanisme de déduplication (`refreshAccessToken`, promesse
   partagée) prévu pour ce type de cas, mais le bootstrap ne l'utilisait
   pas. Corrigé en faisant passer le bootstrap par cette fonction partagée
   au lieu d'appeler `apiFetch` directement — un seul appel réseau de
   refresh a désormais lieu, quel que soit le nombre d'invocations de
   l'effet.

## Limitations connues

- La couverture de branches du backend (83.2 %) et des fonctions du
  frontend (79.1 %) reste en dessous de 90 % : les zones non couvertes
  sont pour l'essentiel des branches d'erreur secondaires déjà exercées au
  moins une fois (ex. `email-transport.ts` en mode SMTP réel, `server.ts`
  qui n'est volontairement pas testé — il ne fait qu'appeler
  `buildServer()` et écouter un port).
- La suite E2E est un scénario unique et séquentiel (`fullyParallel:
  false`), pas une matrice de cas ; elle vérifie le chemin nominal complet,
  pas les cas d'erreur (déjà couverts par les tests d'intégration
  backend).
- Le seed de démonstration crée un jeu de données fixe (2 médecins
  vérifiés avec rendez-vous, 1 en attente, 1 rejeté, 1 suspendu) ; il ne
  couvre pas toutes les combinaisons de statuts possibles.
